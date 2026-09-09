import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VoiceApiResponse } from '../../../src/domain/voice/protocol';
import { useRpgVoice } from '../../../src/features/rpg/use-rpg-voice';
import {
  disconnectVoice,
  fetchVoiceState,
  moveVoice,
  VoiceApiError,
} from '../../../src/features/world/voice-api';

vi.mock('../../../src/features/world/voice-api', async (original) => ({
  ...(await original<typeof import('../../../src/features/world/voice-api')>()),
  disconnectVoice: vi.fn(),
  fetchVoiceState: vi.fn(),
  moveVoice: vi.fn(),
}));

function snapshot(channelKey: string | null, revision = 1): VoiceApiResponse {
  return {
    service: 'online',
    state: {
      serviceSessionId: '916bd62d-9144-4fa2-8f18-4616e2746598',
      revision,
      channelKey,
      selfMute: false,
      selfDeaf: false,
      serverMute: false,
      serverDeaf: false,
      suppress: false,
    },
  };
}

describe('RPG voice lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('locks writes until the HTTP action finishes even when the live call confirms first', async () => {
    let complete!: (response: VoiceApiResponse) => void;
    vi.mocked(moveVoice).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { result } = renderHook(() => useRpgVoice('guild-a', true));
    act(() => result.current.onVoiceSnapshot(snapshot('first')));
    let moving!: Promise<void>;
    act(() => {
      moving = result.current.move('second');
    });
    act(() => result.current.onVoiceSnapshot(snapshot('second', 2)));
    await act(async () => {
      await result.current.move('third');
      expect(await result.current.disconnect()).toMatch(/already in progress/u);
    });
    expect(moveVoice).toHaveBeenCalledTimes(1);
    expect(disconnectVoice).not.toHaveBeenCalled();
    await act(async () => {
      complete(snapshot('second', 2));
      await moving;
    });
    expect(result.current.state.voiceState?.channelKey).toBe('second');
  });

  it('reconciles an uncertain disconnect once without resending the write', async () => {
    vi.mocked(disconnectVoice).mockRejectedValueOnce(new VoiceApiError('VOICE_ACTION_TIMEOUT'));
    vi.mocked(fetchVoiceState).mockResolvedValueOnce(snapshot(null, 2));
    const { result } = renderHook(() => useRpgVoice('guild-a', true));
    act(() => result.current.onVoiceSnapshot(snapshot('first')));
    await act(async () => {
      expect(await result.current.disconnect()).toBeNull();
    });
    expect(disconnectVoice).toHaveBeenCalledTimes(1);
    expect(fetchVoiceState).toHaveBeenCalledTimes(1);
    expect(result.current.state.pending).toBeNull();
    expect(result.current.state.voiceState?.channelKey).toBeNull();
  });

  it('ignores old guild callbacks and in-flight responses after changing servers', async () => {
    let complete!: (response: VoiceApiResponse) => void;
    vi.mocked(moveVoice).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { result, rerender, unmount } = renderHook(({ guild }) => useRpgVoice(guild, true), {
      initialProps: { guild: 'guild-a' },
    });
    act(() => result.current.onVoiceSnapshot(snapshot('first')));
    const previous = result.current;
    let moving!: Promise<void>;
    act(() => {
      moving = previous.move('second');
    });
    rerender({ guild: 'guild-b' });
    act(() => result.current.onVoiceSnapshot(snapshot('current')));
    await act(async () => {
      previous.onVoiceSnapshot(snapshot('stale', 9));
      complete(snapshot('second', 2));
      await moving;
    });
    expect(result.current.state.voiceState?.channelKey).toBe('current');
    expect(fetchVoiceState).not.toHaveBeenCalled();
    unmount();
    await previous.move('third');
    expect(moveVoice).toHaveBeenCalledTimes(1);
  });
});
