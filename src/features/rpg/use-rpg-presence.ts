import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldSync, WorldView } from '../../domain/channels/protocol';
import type { MapSnapshot } from '../../domain/map/snapshot';
import type { RoomMessage } from '../../domain/messages/protocol';
import type {
  RpgAppearanceId,
  RpgLocation,
  RpgMovement,
  RpgPresencePlayer,
} from '../../domain/presence/rpg-protocol';
import type { SavedWorldResponse } from '../../domain/world/protocol';
import { fetchWorldAdmission } from '../world/channel-api';
import {
  MessageRequestError,
  WorldPresenceClient,
  type WorldPresenceState,
} from '../world/presence/world-presence-client';
import type { RpgVoiceController } from './use-rpg-voice';
import type { RpgPositionUpdate } from './types';

type Directory = {
  key: string;
  label: string;
  rooms: { key: string; label: string; type: string }[];
}[];
function directoryKey(name: string, areas: Directory): string {
  return JSON.stringify([
    name,
    areas
      .map((area) => [
        area.key,
        area.label,
        area.rooms
          .map((room) => [room.key, room.label, room.type])
          .sort((a, b) => a[0]!.localeCompare(b[0]!)),
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ]);
}

/** Compare only public directory content; map geometry and room permissions have different owners. */
export function savedDirectoryMatches(data: SavedWorldResponse, snapshot: MapSnapshot): boolean {
  if (!data.town) return false;
  return (
    directoryKey(
      data.server.displayName,
      data.town.districts.map((district) => ({
        ...district,
        rooms: district.streets.flatMap((street) => street.rooms),
      })),
    ) === directoryKey(snapshot.server.displayName, snapshot.areas)
  );
}

interface Options {
  guildId: string;
  data: SavedWorldResponse | null;
  scene: RpgLocation['scene'];
  active: boolean;
  voice: RpgVoiceController;
  onRefresh(): void;
}
interface SessionState extends WorldPresenceState {
  key: string;
  owner: SavedWorldResponse;
  sync: WorldSync;
  players: readonly RpgPresencePlayer[];
  self: RpgPresencePlayer | null;
  position: RpgPositionUpdate | null;
  liveMessage: RoomMessage | null;
}
const EMPTY_PLAYERS: readonly RpgPresencePlayer[] = [];

/** Saved-world socket lifetime, separate from Phaser and Discord call ownership. */
export function useRpgPresence(options: Options) {
  const { guildId, data, scene, active } = options;
  const key = JSON.stringify([guildId, data?.document.worldId, data?.checksum, scene]);
  const latest = useRef(options);
  const client = useRef<WorldPresenceClient | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  useEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    if (!active || !data) return;
    let current = true;
    let refreshing = false;
    let admitted = false;
    const patch = (next: Partial<SessionState>) => {
      if (!current) return;
      setSession((previous) => ({
        key,
        owner: data,
        connection: 'connecting',
        onlineCount: 0,
        sync: { state: 'recovering', code: 'WORLD_SOURCE_UNAVAILABLE' },
        players: [],
        self: null,
        position: null,
        liveMessage: null,
        ...(previous?.key === key && previous.owner === data ? previous : {}),
        ...next,
      }));
    };
    const refresh = () => {
      if (!current || refreshing) return;
      refreshing = true;
      patch({ self: null, players: [], liveMessage: null });
      latest.current.onRefresh();
    };
    const receiveView = (view: WorldView) => {
      const saved = latest.current.data;
      if (saved && !savedDirectoryMatches(saved, view.snapshot)) refresh();
    };
    const presence = new WorldPresenceClient(
      guildId,
      {
        onPlayers: () => {},
        onSelfAvatar: () => {},
        onState: (state) => {
          if (state.connection !== 'online') admitted = false;
          patch({
            ...state,
            ...(state.connection !== 'online'
              ? { self: null, players: [], liveMessage: null }
              : {}),
          });
        },
        onVoiceState: (state) => current && latest.current.voice.onVoiceState(state),
        onVoiceService: (state) => current && latest.current.voice.onVoiceService(state),
        onVoiceSnapshot: (state) => current && latest.current.voice.onVoiceSnapshot(state),
        onWorldView: receiveView,
        onWorldSync: (sync) => {
          patch({ sync, ...(sync.state !== 'ready' ? { players: [], liveMessage: null } : {}) });
          if (sync.state === 'denied' || (admitted && sync.state !== 'ready')) refresh();
        },
        onRoomMessage: (message) => patch({ liveMessage: message }),
        recoverAdmission: async (signal) => {
          const view = await fetchWorldAdmission(guildId, signal);
          // A reconnect may follow a map extension or a lost permission update.
          // Reload the saved projection before admitting coordinates again.
          if (!signal.aborted) refresh();
          return view;
        },
      },
      {
        admission: {
          theme: data.document.themeId,
          worldId: data.document.worldId,
          checksum: data.checksum,
          scene,
        },
        onWelcome: (welcome) => {
          admitted = true;
          patch({
            self: welcome.self,
            position: { ...welcome.self, revision: 0 },
            players: welcome.players,
          });
        },
        onPlayers: (players) => patch({ players }),
        onPosition: (player, revision) =>
          patch({ self: player, position: { ...player, revision, resumeDestination: true } }),
        onAppearance: (player) => patch({ self: player }),
      },
    );
    client.current = presence;
    presence.connect();
    const resume = () => presence.resume();
    const pause = () => presence.pauseRpgMovement();
    const visible = () => {
      if (document.visibilityState === 'visible') presence.resume();
      else pause();
    };
    window.addEventListener('online', resume);
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', visible);
    return () => {
      current = false;
      window.removeEventListener('online', resume);
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', visible);
      presence.disconnect();
      if (client.current === presence) client.current = null;
    };
    // The immutable admission identity owns the socket; callbacks and projection use latest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, key, active, data]);

  const state = active && session?.key === key && session.owner === data ? session : null;
  const ready =
    state?.connection === 'online' && state.sync.state === 'ready' && state.self !== null;
  const readyRef = useRef(false);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  const updateLocation = useCallback((location: RpgMovement) => {
    if (readyRef.current) client.current?.updateRpgLocation(location);
  }, []);
  const setAppearance = useCallback((appearance: RpgAppearanceId) => {
    if (readyRef.current) client.current?.updateRpgAppearance(appearance);
  }, []);
  const readMessages = useCallback((roomKey: string) => {
    if (!readyRef.current || !client.current)
      return Promise.reject(new MessageRequestError('WORLD_SOURCE_UNAVAILABLE'));
    return client.current.readMessages(roomKey);
  }, []);
  const sendMessage = useCallback((roomKey: string, content: string) => {
    if (!readyRef.current || !client.current)
      return Promise.reject(new MessageRequestError('WORLD_SOURCE_UNAVAILABLE'));
    return client.current.sendMessage({ roomKey, content });
  }, []);
  return {
    ready,
    connection: state?.connection ?? ('connecting' as const),
    onlineCount: state?.onlineCount ?? 0,
    sync: state?.sync ?? null,
    players: ready ? state.players : EMPTY_PLAYERS,
    self: ready ? state.self : null,
    position: ready ? state.position : null,
    liveMessage: ready ? state.liveMessage : null,
    updateLocation,
    setAppearance,
    readMessages,
    sendMessage,
  };
}

export type RpgConnection = ReturnType<typeof useRpgPresence>;
