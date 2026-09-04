import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import type { MapRoom, MapSnapshot } from '../../domain/map/snapshot';
import {
  INITIAL_WORLD_VOICE_STATE,
  reduceWorldVoiceState,
  shouldFollowVoiceChannelChange,
  type VoicePendingAction,
  type WorldVoiceAction,
} from '../../domain/voice/state';
import { createVillageWorld } from './engine/village-world';
import type { WorldUiState } from './engine/types';
import { WorldEngine } from './engine/world-engine';
import { WorldPresenceClient, type WorldPresenceState } from './presence/world-presence-client';
import { VirtualJoystick } from './VirtualJoystick';
import { VoiceBeacon } from './VoiceBeacon';
import {
  disconnectVoice,
  fetchVoiceState,
  isVoiceActionTimeout,
  moveVoice,
  voiceErrorMessage,
} from './voice-api';

export interface WorldCanvasProps {
  snapshot: MapSnapshot;
  presenceGuildId?: string;
}

const INITIAL_UI: WorldUiState = {
  area: null,
  nearbyPortal: null,
  room: null,
  environment: 'exterior',
  zoom: 100,
};

const INITIAL_PRESENCE: WorldPresenceState = {
  connection: 'connecting',
  onlineCount: 0,
};

const VOICE_RECONCILE_DELAY_MS = 1_000;

function samePendingAction(left: VoicePendingAction | null, right: VoicePendingAction): boolean {
  if (right.type === 'disconnect') return left?.type === 'disconnect';
  return left?.type === 'move' && left.roomKey === right.roomKey;
}

function voiceStateMatchesAction(
  channelKey: string | null | undefined,
  pending: VoicePendingAction,
): boolean {
  return pending.type === 'disconnect' ? channelKey === null : channelKey === pending.roomKey;
}

function waitForReconciliation(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function ControlIcon({ children }: { children: string }) {
  return <span aria-hidden="true">{children}</span>;
}

export function WorldCanvas({ snapshot, presenceGuildId }: WorldCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const world = useMemo(() => createVillageWorld(snapshot), [snapshot]);
  const [readyWorld, setReadyWorld] = useState<typeof world | null>(null);
  const [failedWorld, setFailedWorld] = useState<typeof world | null>(null);
  const ready = readyWorld === world;
  const assetError = failedWorld === world;
  const [ui, setUi] = useState<WorldUiState>(INITIAL_UI);
  const [sceneRoom, setSceneRoom] = useState<WorldUiState['room']>(null);
  const [presence, setPresence] = useState<WorldPresenceState>(INITIAL_PRESENCE);
  const [voice, dispatchVoiceState] = useReducer(reduceWorldVoiceState, INITIAL_WORLD_VOICE_STATE);
  const voiceRef = useRef(voice);
  const sceneRoomRef = useRef<WorldUiState['room']>(null);
  const observedVoiceChannelRef = useRef<string | null | undefined>(undefined);
  const suppressedRoomMoveRef = useRef<string | null>(null);
  const dispatchVoice = useCallback((action: WorldVoiceAction) => {
    voiceRef.current = reduceWorldVoiceState(voiceRef.current, action);
    dispatchVoiceState(action);
  }, []);

  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  const voiceRooms = useMemo(() => {
    const rooms = new Map<string, MapRoom>();
    for (const area of snapshot.areas) {
      for (const room of area.rooms) {
        if (room.type === 'voice' || room.type === 'stage') rooms.set(room.key, room);
      }
    }
    return rooms;
  }, [snapshot]);

  const reconcileVoice = useCallback(
    async (signal?: AbortSignal) => {
      if (!presenceGuildId) return;
      try {
        const response = await fetchVoiceState(presenceGuildId, signal);
        dispatchVoice({ type: 'resolved', response });
      } catch (error) {
        if (signal?.aborted) return;
        dispatchVoice({ type: 'failed', message: voiceErrorMessage(error) });
      }
    },
    [dispatchVoice, presenceGuildId],
  );

  const reconcilePendingVoiceAction = useCallback(
    async (
      pending: VoicePendingAction,
      unconfirmedMessage: string,
      delayMs = VOICE_RECONCILE_DELAY_MS,
    ): Promise<boolean> => {
      if (!presenceGuildId) return false;
      if (delayMs > 0) await waitForReconciliation(delayMs);
      if (!samePendingAction(voiceRef.current.pending, pending)) return true;

      try {
        const response = await fetchVoiceState(presenceGuildId);
        dispatchVoice({ type: 'resolved', response });
        const confirmed =
          voiceStateMatchesAction(response.state?.channelKey, pending) ||
          voiceStateMatchesAction(voiceRef.current.voiceState?.channelKey, pending);
        if (!confirmed) {
          dispatchVoice({ type: 'reconciliation-finished', pending, message: unconfirmedMessage });
        }
        return confirmed;
      } catch {
        if (!samePendingAction(voiceRef.current.pending, pending)) return true;
        dispatchVoice({
          type: 'failed',
          pending,
          message: unconfirmedMessage,
        });
        return false;
      }
    },
    [dispatchVoice, presenceGuildId],
  );

  const moveToVoiceRoom = useCallback(
    async (roomKey: string) => {
      if (!presenceGuildId) return;
      const current = voiceRef.current;
      if (
        current.service !== 'online' ||
        current.voiceState?.channelKey === null ||
        current.voiceState?.channelKey === undefined ||
        current.voiceState.channelKey === roomKey
      ) {
        return;
      }
      const pending = { type: 'move', roomKey } as const;
      dispatchVoice({ type: 'begin-move', roomKey });
      try {
        const response = await moveVoice(presenceGuildId, roomKey);
        dispatchVoice({ type: 'resolved', response });
        void reconcilePendingVoiceAction(
          pending,
          'Discord accepted the move, but Dmap could not confirm the current room.',
        );
      } catch (error) {
        const message = voiceErrorMessage(error);
        if (isVoiceActionTimeout(error)) {
          await reconcilePendingVoiceAction(pending, message, 0);
          return;
        }
        dispatchVoice({ type: 'failed', pending, message });
      }
    },
    [dispatchVoice, presenceGuildId, reconcilePendingVoiceAction],
  );

  const disconnectCall = useCallback(async (): Promise<string | null> => {
    if (!presenceGuildId || voiceRef.current.pending !== null) {
      return 'Another Discord voice change is already in progress.';
    }
    const pending = { type: 'disconnect' } as const;
    dispatchVoice({ type: 'begin-disconnect' });
    try {
      const response = await disconnectVoice(presenceGuildId);
      dispatchVoice({ type: 'resolved', response });
      void reconcilePendingVoiceAction(
        pending,
        'Discord accepted the disconnect, but Dmap could not confirm that the call ended.',
      );
      return null;
    } catch (error) {
      const message = voiceErrorMessage(error);
      if (isVoiceActionTimeout(error)) {
        const confirmed = await reconcilePendingVoiceAction(pending, message, 0);
        return confirmed ? null : message;
      }
      dispatchVoice({ type: 'failed', pending, message });
      return message;
    }
  }, [dispatchVoice, presenceGuildId, reconcilePendingVoiceAction]);

  useEffect(() => {
    dispatchVoice({ type: 'reset' });
    if (!presenceGuildId) return;
    const controller = new AbortController();
    void reconcileVoice(controller.signal);
    return () => controller.abort();
  }, [dispatchVoice, presenceGuildId, reconcileVoice]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const presenceClient = presenceGuildId
      ? new WorldPresenceClient(presenceGuildId, {
          onPlayers: (players) => engineRef.current?.setRemotePlayers(players),
          onSelfAvatar: (avatarId) => engineRef.current?.setPlayerAvatar(avatarId),
          onState: setPresence,
          onVoiceState: (state) => dispatchVoice({ type: 'voice-state', state }),
          onVoiceService: (service) => {
            dispatchVoice({ type: 'service', service });
            if (service === 'online') void reconcileVoice();
          },
        })
      : null;
    const engine = new WorldEngine(canvas, world, {
      onReady: () => setReadyWorld(world),
      onAssetError: () => setFailedWorld(world),
      onUiChange: setUi,
      onSceneChange: (room) => {
        sceneRoomRef.current = room;
        setSceneRoom(room);
        if (room?.room.type !== 'voice' && room?.room.type !== 'stage') return;
        if (suppressedRoomMoveRef.current === room.room.key) {
          suppressedRoomMoveRef.current = null;
          return;
        }
        void moveToVoiceRoom(room.room.key);
      },
      onPresenceMove: (location) => presenceClient?.updateLocation(location),
    });
    engineRef.current = engine;

    const resize = () => engine.resize(host.clientWidth, host.clientHeight);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    engine.start();
    presenceClient?.connect();

    return () => {
      resizeObserver.disconnect();
      presenceClient?.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, [dispatchVoice, moveToVoiceRoom, presenceGuildId, reconcileVoice, world]);

  const connectedRoom =
    voice.voiceState?.channelKey === null || voice.voiceState?.channelKey === undefined
      ? null
      : (voiceRooms.get(voice.voiceState.channelKey) ?? null);
  const connectedChannelKey = voice.voiceState?.channelKey ?? null;

  useEffect(() => {
    if (!ready || voice.service !== 'online' || voice.pending !== null) return;

    const previousChannelKey = observedVoiceChannelRef.current;
    observedVoiceChannelRef.current = connectedChannelKey;
    if (
      connectedRoom === null ||
      !shouldFollowVoiceChannelChange(
        previousChannelKey,
        connectedChannelKey,
        sceneRoomRef.current?.room.key ?? null,
      )
    )
      return;

    suppressedRoomMoveRef.current = connectedRoom.key;
    if (!engineRef.current?.enterRoomByKey(connectedRoom.key)) {
      suppressedRoomMoveRef.current = null;
    }
  }, [connectedChannelKey, connectedRoom, ready, voice.pending, voice.service]);

  const toggleFullscreen = async () => {
    const host = hostRef.current;
    if (!host) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await host.requestFullscreen();
  };

  return (
    <div ref={hostRef} className="world-viewport">
      <canvas
        ref={canvasRef}
        className="world-canvas"
        tabIndex={0}
        aria-label={`Playable map of ${snapshot.server.displayName}. Use W A S D or arrow keys to move, or click a destination.`}
      />

      {!ready && !assetError ? (
        <div className="world-loading" role="status">
          <span className="world-loading-mark" aria-hidden="true" />
          <p>Building the world…</p>
        </div>
      ) : null}

      {assetError ? (
        <div className="world-loading world-loading--error" role="alert">
          <p>The world tiles could not be loaded.</p>
        </div>
      ) : null}

      <div className="world-location" aria-live="polite">
        <span className="world-location-kicker">
          {sceneRoom ? 'Inside channel' : 'Now exploring'}
        </span>
        <strong>
          {sceneRoom ? `#${sceneRoom.room.label}` : (ui.area?.label ?? 'Central crossing')}
        </strong>
        <span className="world-location-meta">
          {sceneRoom
            ? `${sceneRoom.room.type} room · ${sceneRoom.areaLabel}`
            : ui.area
              ? `${ui.area.roomCount} mapped rooms`
              : world.name}
        </span>
        {presenceGuildId ? (
          <span
            className="world-presence-status"
            data-connection={presence.connection}
            aria-live="polite"
          >
            {presence.connection === 'online'
              ? `${presence.onlineCount} online`
              : presence.connection === 'connecting'
                ? 'Connecting…'
                : 'Reconnecting…'}
          </span>
        ) : null}
      </div>

      <div className="world-controls" aria-label="World view controls">
        <button type="button" onClick={() => engineRef.current?.zoomIn()} aria-label="Zoom in">
          <ControlIcon>+</ControlIcon>
        </button>
        <span className="world-zoom" aria-label={`Zoom ${ui.zoom} percent`}>
          {ui.zoom}%
        </span>
        <button type="button" onClick={() => engineRef.current?.zoomOut()} aria-label="Zoom out">
          <ControlIcon>−</ControlIcon>
        </button>
        <button
          type="button"
          onClick={() => engineRef.current?.resetView()}
          aria-label="Center on avatar"
        >
          <ControlIcon>◎</ControlIcon>
        </button>
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label="Toggle fullscreen"
        >
          <ControlIcon>⛶</ControlIcon>
        </button>
      </div>

      <div className="world-help">
        <span>
          <kbd>WASD</kbd> move
        </span>
        <span>
          <kbd>Shift</kbd> sprint
        </span>
        <span>
          <kbd>Click</kbd> walk
        </span>
        <span>
          <kbd>Drag</kbd> pan
        </span>
        <span>
          <kbd>Wheel</kbd> zoom
        </span>
        <span>
          <kbd>E</kbd> enter
        </span>
      </div>

      <VirtualJoystick
        onChange={(x, y, sprinting) => engineRef.current?.setVirtualAxis(x, y, sprinting)}
      />

      {presenceGuildId ? (
        <VoiceBeacon
          state={voice}
          currentRoom={sceneRoom?.room ?? null}
          connectedRoom={connectedRoom}
          onReturn={() => {
            if (connectedRoom === null) return;
            suppressedRoomMoveRef.current = connectedRoom.key;
            if (!engineRef.current?.enterRoomByKey(connectedRoom.key)) {
              suppressedRoomMoveRef.current = null;
            }
          }}
          onDisconnect={disconnectCall}
          onDismissNotice={() => dispatchVoice({ type: 'dismiss-notice' })}
        />
      ) : null}

      {ui.nearbyPortal ? (
        <button
          type="button"
          className="world-interaction"
          onClick={() => engineRef.current?.interact()}
        >
          <kbd>E</kbd>
          <span>
            {ui.nearbyPortal.destination === 'world' ? 'Leave' : 'Enter'}{' '}
            <strong>#{ui.nearbyPortal.room.label}</strong>
          </span>
        </button>
      ) : null}
    </div>
  );
}
