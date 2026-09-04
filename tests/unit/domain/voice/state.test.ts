import { describe, expect, it } from 'vitest';

import {
  INITIAL_WORLD_VOICE_STATE,
  reduceWorldVoiceState,
  shouldFollowVoiceChannelChange,
} from '../../../../src/domain/voice/state';
import type { VoiceState } from '../../../../src/domain/voice/protocol';

const connected = (revision: number, channelKey: string | null): VoiceState => ({
  serviceSessionId: '916bd62d-9144-4fa2-8f18-4616e2746598',
  revision,
  channelKey,
  selfMute: false,
  selfDeaf: false,
  serverMute: false,
  serverDeaf: false,
  suppress: false,
});

describe('world voice state', () => {
  it('follows actual Discord channel changes without pulling a local room exit back', () => {
    const roomA = `c_${'a'.repeat(43)}`;
    const roomB = `c_${'b'.repeat(43)}`;

    expect(shouldFollowVoiceChannelChange(undefined, roomA, null)).toBe(true);
    expect(shouldFollowVoiceChannelChange(roomA, roomA, null)).toBe(false);
    expect(shouldFollowVoiceChannelChange(roomA, roomB, roomA)).toBe(true);
    expect(shouldFollowVoiceChannelChange(roomA, null, roomA)).toBe(false);
    expect(shouldFollowVoiceChannelChange(null, roomA, roomA)).toBe(false);
  });

  it('ignores stale Gateway updates and settles the matching pending move', () => {
    const roomKey = `c_${'a'.repeat(43)}`;
    let state = reduceWorldVoiceState(INITIAL_WORLD_VOICE_STATE, {
      type: 'resolved',
      response: { service: 'online', state: connected(5, null) },
    });
    state = reduceWorldVoiceState(state, { type: 'begin-move', roomKey });
    state = reduceWorldVoiceState(state, { type: 'voice-state', state: connected(4, roomKey) });
    expect(state.voiceState?.channelKey).toBeNull();
    expect(state.pending).toEqual({ type: 'move', roomKey });

    state = reduceWorldVoiceState(state, { type: 'voice-state', state: connected(6, roomKey) });
    expect(state.voiceState?.channelKey).toBe(roomKey);
    expect(state.pending).toBeNull();
  });

  it('keeps the last known call when the bridge drops and records the reconnect notice', () => {
    const roomKey = `c_${'b'.repeat(43)}`;
    let state = reduceWorldVoiceState(INITIAL_WORLD_VOICE_STATE, {
      type: 'resolved',
      response: { service: 'online', state: connected(2, roomKey) },
    });
    state = reduceWorldVoiceState(state, { type: 'service', service: 'offline' });
    expect(state.voiceState?.channelKey).toBe(roomKey);

    state = reduceWorldVoiceState(state, { type: 'begin-disconnect' });
    state = reduceWorldVoiceState(state, {
      type: 'resolved',
      response: { service: 'online', state: connected(3, null) },
    });
    expect(state.notice).toMatch(/Reconnect in Discord/u);
  });

  it('does not let an older command response roll back a realtime update', () => {
    const roomKey = `c_${'c'.repeat(43)}`;
    let state = reduceWorldVoiceState(INITIAL_WORLD_VOICE_STATE, {
      type: 'resolved',
      response: { service: 'online', state: connected(7, null) },
    });
    state = reduceWorldVoiceState(state, { type: 'begin-move', roomKey });
    state = reduceWorldVoiceState(state, { type: 'voice-state', state: connected(9, roomKey) });
    state = reduceWorldVoiceState(state, {
      type: 'resolved',
      response: { service: 'online', state: connected(8, null) },
    });

    expect(state.voiceState?.revision).toBe(9);
    expect(state.voiceState?.channelKey).toBe(roomKey);
    expect(state.pending).toBeNull();
  });

  it('keeps an accepted mutation pending until an event or reconciliation confirms it', () => {
    const roomKey = `c_${'d'.repeat(43)}`;
    let state = reduceWorldVoiceState(INITIAL_WORLD_VOICE_STATE, {
      type: 'resolved',
      response: { service: 'online', state: connected(2, null) },
    });
    const pending = { type: 'move', roomKey } as const;
    state = reduceWorldVoiceState(state, { type: 'begin-move', roomKey });
    state = reduceWorldVoiceState(state, {
      type: 'resolved',
      response: { service: 'online', state: null },
    });

    expect(state.pending).toEqual(pending);
    state = reduceWorldVoiceState(state, {
      type: 'failed',
      message: 'A background refresh failed.',
    });
    expect(state.pending).toEqual(pending);
    state = reduceWorldVoiceState(state, {
      type: 'reconciliation-finished',
      pending,
      message: 'Could not confirm the room.',
    });
    expect(state.pending).toBeNull();
    expect(state.error).toBe('Could not confirm the room.');
  });
});
