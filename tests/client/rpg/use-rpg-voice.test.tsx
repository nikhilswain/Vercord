import { act, renderHook, waitFor } from '@testing-library/react';
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
  beforeEach(() => vi.resetAllMocks());

  it('keeps the first join in Discord, then automatically follows admitted voice houses', async () => {
    vi.mocked(moveVoice).mockResolvedValueOnce(snapshot('second', 3));
    const { result } = renderHook(() => useRpgVoice('guild-a', true));
    act(() => {
      result.current.followRoom('house:0', 'first', true);
      result.current.onVoiceSnapshot(snapshot(null));
    });
    expect(moveVoice).not.toHaveBeenCalled();
    act(() => result.current.onVoiceSnapshot(snapshot('first', 2)));
    expect(moveVoice).not.toHaveBeenCalled();
    act(() => result.current.followRoom('house:1', 'second', false));
    expect(moveVoice).not.toHaveBeenCalled();
    act(() => result.current.followRoom('house:1', 'second', true));
    await waitFor(() => expect(result.current.state.pending).toBeNull());
    expect(moveVoice).toHaveBeenCalledExactlyOnceWith('guild-a', 'second');
    expect(result.current.state.voiceState?.channelKey).toBe('second');
    act(() => {
      result.current.followRoom(null, null, true);
      result.current.followRoom('house:2', null, true); // Text houses preserve the call.
    });
    expect(moveVoice).toHaveBeenCalledTimes(1);
    expect(disconnectVoice).not.toHaveBeenCalled();
  });

  it('does not pull a manual Discord switch back until the player enters another house', async () => {
    vi.mocked(moveVoice).mockResolvedValueOnce(snapshot('first', 3));
    const { result } = renderHook(() => useRpgVoice('guild-a', true));
    act(() => {
      result.current.onVoiceSnapshot(snapshot('first'));
      result.current.followRoom('house:0', 'first', true);
    });
    act(() => result.current.onVoiceSnapshot(snapshot('elsewhere', 2)));
    act(() => result.current.followRoom('house:0', 'first', false));
    act(() => result.current.followRoom('house:0', 'first', true));
    expect(moveVoice).not.toHaveBeenCalled();
    act(() => result.current.followRoom(null, null, true));
    act(() => result.current.followRoom('house:0', 'first', true));
    await waitFor(() => expect(result.current.state.pending).toBeNull());
    expect(moveVoice).toHaveBeenCalledExactlyOnceWith('guild-a', 'first');
  });

  it('queues only the latest admitted house behind an unfinished HTTP move', async () => {
    let complete!: (response: VoiceApiResponse) => void;
    vi.mocked(moveVoice)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValueOnce(snapshot('fourth', 3));
    const { result } = renderHook(() => useRpgVoice('guild-a', true));
    act(() => {
      result.current.onVoiceSnapshot(snapshot('first'));
      result.current.followRoom('house:1', 'second', true);
    });
    act(() => result.current.onVoiceSnapshot(snapshot('second', 2)));
    act(() => result.current.followRoom('house:2', 'third', true));
    act(() => result.current.followRoom('house:3', 'fourth', true));
    expect(moveVoice).toHaveBeenCalledTimes(1);
    await act(async () => complete(snapshot('second', 2)));
    await waitFor(() => expect(result.current.state.pending).toBeNull());
    expect(vi.mocked(moveVoice).mock.calls).toEqual([
      ['guild-a', 'second'],
      ['guild-a', 'fourth'],
    ]);
  });

  it('cancels a queued destination on exit, and never reconnects a disconnected caller', async () => {
    let complete!: (response: VoiceApiResponse) => void;
    vi.mocked(moveVoice).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { result } = renderHook(() => useRpgVoice('guild-a', true));
    act(() => {
      result.current.onVoiceSnapshot(snapshot('first'));
      result.current.followRoom('house:1', 'second', true);
    });
    act(() => result.current.followRoom('house:2', 'third', true));
    act(() => result.current.followRoom(null, null, true));
    await act(async () => complete(snapshot('second', 2)));
    expect(moveVoice).toHaveBeenCalledTimes(1);
    act(() => result.current.followRoom('house:2', 'third', false));
    act(() => result.current.onVoiceSnapshot(snapshot(null, 3)));
    act(() => result.current.followRoom('house:2', 'third', true));
    act(() => result.current.onVoiceSnapshot(snapshot('elsewhere', 4)));
    expect(moveVoice).toHaveBeenCalledTimes(1);
  });

  it('waits for fresh call state after an outage and does not loop on permission failures', async () => {
    vi.mocked(moveVoice).mockRejectedValueOnce(new VoiceApiError('VOICE_ROOM_FORBIDDEN'));
    let refresh!: (response: VoiceApiResponse) => void;
    vi.mocked(fetchVoiceState).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          refresh = resolve;
        }),
    );
    const { result } = renderHook(() => useRpgVoice('guild-a', true));
    act(() => result.current.onVoiceSnapshot(snapshot('first')));
    act(() => result.current.onVoiceService('offline'));
    act(() => result.current.followRoom('house:1', 'second', true));
    act(() => result.current.onVoiceService('online'));
    expect(moveVoice).not.toHaveBeenCalled();
    await act(async () => refresh(snapshot('first', 2)));
    await waitFor(() => expect(result.current.state.error).not.toBeNull());
    expect(moveVoice).toHaveBeenCalledTimes(1);
    act(() => result.current.onVoiceSnapshot(snapshot('first', 3)));
    act(() => result.current.followRoom('house:1', 'second', true));
    expect(moveVoice).toHaveBeenCalledTimes(1);
  });

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
