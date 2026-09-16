import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameMusic } from '../../../src/features/audio/use-game-music';
import { setBackgroundVolume } from '../../../src/features/settings/use-game-settings';

const fake = vi.hoisted(() => ({ play: vi.fn(), resume: vi.fn(), create: vi.fn() }));
vi.mock('../../../src/features/audio/music-output', () => ({
  createMusicOutput: () => {
    fake.create();
    const media = Object.assign(new EventTarget(), {
      paused: true,
      src: '',
      load() {},
      play() {
        media.paused = false;
        return fake.play();
      },
      pause() {
        media.paused = true;
      },
    });
    return { media, resume: fake.resume, setVolume() {}, dispose: () => media.pause() };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  fake.play.mockResolvedValue(undefined);
  fake.resume.mockResolvedValue(undefined);
  setBackgroundVolume(35);
});

describe('game music entry', () => {
  it('waits for the world to load, then starts automatically with no player input', async () => {
    const { result, rerender } = renderHook(({ ready }) => useGameMusic(true, ready), {
      initialProps: { ready: false },
    });
    expect(fake.create).not.toHaveBeenCalled();
    expect(fake.play).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      window.dispatchEvent(new Event('pointerup'));
    });
    expect(fake.play).not.toHaveBeenCalled();
    rerender({ ready: true });
    await waitFor(() => expect(result.current.status).toBe('playing'));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      window.dispatchEvent(new Event('pointerup'));
    });
    expect(fake.play).toHaveBeenCalledTimes(1);
    rerender({ ready: true });
    expect(fake.play).toHaveBeenCalledTimes(1);
  });

  it('leaves blocked autoplay waiting until the player uses a sound control', async () => {
    fake.play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
    const { result } = renderHook(() => useGameMusic(true, true));
    await waitFor(() => expect(result.current.status).toBe('waiting'));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      window.dispatchEvent(new Event('pointerup'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fake.play).toHaveBeenCalledTimes(1);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('playing'));
    expect(fake.play).toHaveBeenCalledTimes(2);
  });

  it('respects a saved mute on entry and starts from explicit unmute', async () => {
    setBackgroundVolume(0);
    const { result } = renderHook(() => useGameMusic(true, true));
    expect(result.current.status).toBe('muted');
    expect(fake.create).not.toHaveBeenCalled();
    act(() => result.current.toggleMute());
    await waitFor(() => expect(result.current.status).toBe('playing'));
    expect(fake.play).toHaveBeenCalledTimes(1);
  });

  it('does not start early when sound settings change while the world is loading', async () => {
    const { result, rerender } = renderHook(({ ready }) => useGameMusic(true, ready), {
      initialProps: { ready: false },
    });
    act(() => {
      result.current.setVolume(60);
      result.current.selectTrack('sunset-plains');
      result.current.retry();
    });
    expect(fake.play).not.toHaveBeenCalled();
    rerender({ ready: true });
    await waitFor(() => expect(result.current.status).toBe('playing'));
    expect(result.current.trackId).toBe('sunset-plains');
    expect(result.current.volume).toBe(60);
    expect(fake.play).toHaveBeenCalledTimes(1);
  });
});
