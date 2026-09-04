import type { VoiceApiResponse, VoiceServiceStatus, VoiceState } from './protocol';

export type VoicePendingAction = { type: 'move'; roomKey: string } | { type: 'disconnect' };

export interface WorldVoiceState {
  service: VoiceServiceStatus | 'checking';
  voiceState: VoiceState | null;
  pending: VoicePendingAction | null;
  error: string | null;
  notice: string | null;
}

export type WorldVoiceAction =
  | { type: 'reset' }
  | { type: 'resolved'; response: VoiceApiResponse }
  | { type: 'voice-state'; state: VoiceState }
  | { type: 'service'; service: VoiceServiceStatus }
  | { type: 'begin-move'; roomKey: string }
  | { type: 'begin-disconnect' }
  | { type: 'reconciliation-finished'; pending: VoicePendingAction; message: string }
  | { type: 'failed'; message: string; pending?: VoicePendingAction }
  | { type: 'dismiss-notice' };

export const VOICE_DISCONNECTED_NOTICE =
  'Disconnected. Reconnect in Discord before using another voice room.';

export const INITIAL_WORLD_VOICE_STATE: WorldVoiceState = {
  service: 'checking',
  voiceState: null,
  pending: null,
  error: null,
  notice: null,
};

export function shouldFollowVoiceChannelChange(
  previousChannelKey: string | null | undefined,
  nextChannelKey: string | null,
  currentRoomKey: string | null,
): boolean {
  return (
    nextChannelKey !== null &&
    previousChannelKey !== nextChannelKey &&
    currentRoomKey !== nextChannelKey
  );
}

function isNewer(previous: VoiceState | null, next: VoiceState): boolean {
  return (
    previous === null ||
    previous.serviceSessionId !== next.serviceSessionId ||
    next.revision > previous.revision
  );
}

function latestState(previous: VoiceState | null, next: VoiceState | null): VoiceState | null {
  if (next === null) return previous;
  return isNewer(previous, next) ? next : previous;
}

function settledPending(
  pending: VoicePendingAction | null,
  next: VoiceState,
): VoicePendingAction | null {
  if (pending?.type === 'move' && next.channelKey === pending.roomKey) return null;
  if (pending?.type === 'disconnect' && next.channelKey === null) return null;
  return pending;
}

function samePending(left: VoicePendingAction | null, right: VoicePendingAction): boolean {
  if (right.type === 'disconnect') return left?.type === 'disconnect';
  return left?.type === 'move' && left.roomKey === right.roomKey;
}

export function reduceWorldVoiceState(
  state: WorldVoiceState,
  action: WorldVoiceAction,
): WorldVoiceState {
  switch (action.type) {
    case 'reset':
      return INITIAL_WORLD_VOICE_STATE;
    case 'resolved': {
      const resolvedState = latestState(state.voiceState, action.response.state);
      const pending =
        resolvedState === null ? state.pending : settledPending(state.pending, resolvedState);
      const confirmedDisconnect = state.pending?.type === 'disconnect' && pending === null;
      return {
        ...state,
        service: action.response.service,
        voiceState: resolvedState,
        pending,
        error: null,
        notice: confirmedDisconnect ? VOICE_DISCONNECTED_NOTICE : state.notice,
      };
    }
    case 'voice-state': {
      if (!isNewer(state.voiceState, action.state)) return state;
      const pending = settledPending(state.pending, action.state);
      return {
        ...state,
        service: 'online',
        voiceState: action.state,
        pending,
        error: null,
        notice:
          state.pending?.type === 'disconnect' && pending === null
            ? VOICE_DISCONNECTED_NOTICE
            : action.state.channelKey === null
              ? state.notice
              : null,
      };
    }
    case 'service':
      return {
        ...state,
        service: action.service,
      };
    case 'begin-move':
      return { ...state, pending: { type: 'move', roomKey: action.roomKey }, error: null };
    case 'begin-disconnect':
      return { ...state, pending: { type: 'disconnect' }, error: null };
    case 'reconciliation-finished':
      if (!samePending(state.pending, action.pending)) return state;
      return { ...state, pending: null, error: action.message };
    case 'failed':
      if (action.pending === undefined) return { ...state, error: action.message };
      if (!samePending(state.pending, action.pending)) return state;
      return { ...state, pending: null, error: action.message };
    case 'dismiss-notice':
      return { ...state, notice: null };
  }
}
