import { useEffect, useMemo, useRef, useState } from 'react';

import type { MapSnapshot } from '../../domain/map/snapshot';
import { createVillageWorld } from './engine/village-world';
import type { WorldUiState } from './engine/types';
import { WorldEngine } from './engine/world-engine';
import { WorldPresenceClient, type WorldPresenceState } from './presence/world-presence-client';
import { VirtualJoystick } from './VirtualJoystick';

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

function ControlIcon({ children }: { children: string }) {
  return <span aria-hidden="true">{children}</span>;
}

export function WorldCanvas({ snapshot, presenceGuildId }: WorldCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const world = useMemo(() => createVillageWorld(snapshot), [snapshot]);
  const [ready, setReady] = useState(false);
  const [assetError, setAssetError] = useState(false);
  const [ui, setUi] = useState<WorldUiState>(INITIAL_UI);
  const [sceneRoom, setSceneRoom] = useState<WorldUiState['room']>(null);
  const [presence, setPresence] = useState<WorldPresenceState>(INITIAL_PRESENCE);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const presenceClient = presenceGuildId
      ? new WorldPresenceClient(presenceGuildId, {
          onPlayers: (players) => engineRef.current?.setRemotePlayers(players),
          onSelfAvatar: (avatarId) => engineRef.current?.setPlayerAvatar(avatarId),
          onState: setPresence,
        })
      : null;
    const engine = new WorldEngine(canvas, world, {
      onReady: () => setReady(true),
      onAssetError: () => setAssetError(true),
      onUiChange: setUi,
      onSceneChange: setSceneRoom,
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
  }, [presenceGuildId, world]);

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
