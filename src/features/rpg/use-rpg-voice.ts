import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { VoiceApiResponse, VoiceServiceStatus, VoiceState } from '../../domain/voice/protocol';
import {
  INITIAL_WORLD_VOICE_STATE,
  reduceWorldVoiceState,
  type VoicePendingAction,
  type WorldVoiceAction,
  type WorldVoiceState,
} from '../../domain/voice/state';
import {
  disconnectVoice,
  fetchVoiceState,
  isVoiceActionTimeout,
  moveVoice,
  VoiceApiError,
  voiceErrorMessage,
} from '../world/voice-api';

export interface RpgVoiceController {
  state: WorldVoiceState;
  onVoiceState(state: VoiceState): void;
  onVoiceService(service: VoiceServiceStatus): void;
  onVoiceSnapshot(response: VoiceApiResponse): void;
  move(roomKey: string): Promise<void>;
  disconnect(): Promise<string | null>;
  dismissNotice(): void;
}

interface VoiceScope {
  guildId: string | undefined;
  active: boolean;
}

interface VoiceSession {
  scope: VoiceScope;
  active: boolean;
  controller: AbortController;
  state: WorldVoiceState;
  snapshotCount: number;
  receivedSnapshot: boolean;
  reading: boolean;
  action: VoicePendingAction | null;
}

const UNCERTAIN_CHANGE = 'Discord did not confirm the change. Check your call before trying again.';

function uncertain(error: unknown): boolean {
  return (
    isVoiceActionTimeout(error) ||
    !(error instanceof VoiceApiError) ||
    error.code === 'VOICE_RESPONSE_INVALID' ||
    error.code === 'VOICE_UNAVAILABLE'
  );
}

function waitForUpdate(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, 1_000);
    signal.addEventListener('abort', finish, { once: true });
  });
}

/** Call state belongs to a guild, not the traveler's current house or world theme. */
export function useRpgVoice(guildId: string | undefined, active: boolean): RpgVoiceController {
  const scope = useMemo(() => ({ guildId, active }), [guildId, active]);
  const sessionRef = useRef<VoiceSession | null>(null);
  const [snapshot, setSnapshot] = useState({ scope, state: INITIAL_WORLD_VOICE_STATE });
  const currentSession = useCallback(() => {
    const session = sessionRef.current;
    return session?.scope === scope && session.active ? session : null;
  }, [scope]);

  useEffect(() => {
    const session: VoiceSession = {
      scope,
      active: scope.active && scope.guildId !== undefined,
      controller: new AbortController(),
      state: INITIAL_WORLD_VOICE_STATE,
      snapshotCount: 0,
      receivedSnapshot: false,
      reading: false,
      action: null,
    };
    sessionRef.current = session;
    return () => {
      session.active = false;
      session.controller.abort();
    };
  }, [scope]);

  const dispatch = useCallback(
    (action: WorldVoiceAction) => {
      const session = currentSession();
      if (!session) return;
      session.state = reduceWorldVoiceState(session.state, action);
      setSnapshot({ scope, state: session.state });
    },
    [currentSession, scope],
  );

  const readInitialState = useCallback(async () => {
    const session = currentSession();
    if (!session || !scope.guildId || session.reading) return;
    const snapshotCount = session.snapshotCount;
    session.reading = true;
    const current = () => currentSession() === session;
    try {
      const response = await fetchVoiceState(scope.guildId, session.controller.signal);
      if (current() && session.snapshotCount === snapshotCount) {
        session.receivedSnapshot = true;
        dispatch({ type: 'resolved', response });
      }
    } catch (error) {
      if (current() && session.snapshotCount === snapshotCount) {
        dispatch({ type: 'failed', message: voiceErrorMessage(error) });
      }
    } finally {
      if (current()) session.reading = false;
    }
  }, [currentSession, dispatch, scope]);

  const perform = useCallback(
    async (pending: VoicePendingAction): Promise<string | null> => {
      const session = currentSession();
      const currentGuildId = scope.guildId;
      if (!session || !currentGuildId) return 'This server is no longer open.';
      // Live state can settle the reducer before its HTTP request returns. Keep this lock too.
      if (session.action !== null || session.state.pending !== null) {
        return 'Another Discord voice change is already in progress.';
      }
      if (session.state.service !== 'online')
        return 'Voice sync is offline. Check your call in Discord.';
      if (!session.state.voiceState?.channelKey) return 'Join a voice channel in Discord first.';
      if (pending.type === 'move' && session.state.voiceState.channelKey === pending.roomKey)
        return null;

      const current = () => currentSession() === session && session.action === pending;
      session.action = pending;
      dispatch(
        pending.type === 'move'
          ? { type: 'begin-move', roomKey: pending.roomKey }
          : { type: 'begin-disconnect' },
      );

      const reconcile = async (message: string, delay: boolean): Promise<string | null> => {
        if (!current()) return null;
        if (session.state.pending === null) return null;
        if (delay) await waitForUpdate(session.controller.signal);
        if (!current() || session.state.pending === null) return null;
        try {
          const response = await fetchVoiceState(currentGuildId, session.controller.signal);
          if (!current()) return null;
          dispatch({ type: 'resolved', response });
          if (session.state.pending === null) return null;
        } catch {
          if (!current() || session.state.pending === null) return null;
        }
        dispatch({ type: 'reconciliation-finished', pending, message });
        return message;
      };

      try {
        const response = await (pending.type === 'move'
          ? moveVoice(currentGuildId, pending.roomKey)
          : disconnectVoice(currentGuildId));
        if (!current()) return null;
        dispatch({ type: 'resolved', response });
        return await reconcile(UNCERTAIN_CHANGE, true);
      } catch (error) {
        if (!current() || session.state.pending === null) return null;
        if (uncertain(error)) return await reconcile(UNCERTAIN_CHANGE, false);
        const message = voiceErrorMessage(error);
        dispatch({ type: 'failed', pending, message });
        return message;
      } finally {
        if (current()) session.action = null;
      }
    },
    [currentSession, dispatch, scope],
  );

  const onVoiceState = useCallback(
    (state: VoiceState) => {
      const session = currentSession();
      if (!session) return;
      session.snapshotCount += 1;
      session.receivedSnapshot = true;
      dispatch({ type: 'voice-state', state });
    },
    [currentSession, dispatch],
  );
  const onVoiceSnapshot = useCallback(
    (response: VoiceApiResponse) => {
      const session = currentSession();
      if (!session) return;
      session.snapshotCount += 1;
      session.receivedSnapshot = true;
      dispatch({ type: 'resolved', response });
    },
    [currentSession, dispatch],
  );
  const onVoiceService = useCallback(
    (service: VoiceServiceStatus) => {
      const session = currentSession();
      if (!session) return;
      session.snapshotCount += 1;
      dispatch({ type: 'service', service });
      if (service === 'offline') session.receivedSnapshot = false;
      else if (!session.receivedSnapshot) void readInitialState();
    },
    [currentSession, dispatch, readInitialState],
  );
  const move = useCallback(
    async (roomKey: string) => {
      await perform({ type: 'move', roomKey });
    },
    [perform],
  );
  const disconnect = useCallback(() => perform({ type: 'disconnect' }), [perform]);
  const dismissNotice = useCallback(() => dispatch({ type: 'dismiss-notice' }), [dispatch]);

  return {
    state: snapshot.scope === scope && active ? snapshot.state : INITIAL_WORLD_VOICE_STATE,
    onVoiceState,
    onVoiceSnapshot,
    onVoiceService,
    move,
    disconnect,
    dismissNotice,
  };
}
