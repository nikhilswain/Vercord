import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_GAME_SETTINGS } from '../settings/game-settings';
import { setBackgroundVolume, useGameSettings } from '../settings/use-game-settings';
import { BackgroundMusic } from './background-music';
import { DEFAULT_BACKGROUND_TRACK, type MusicTrackId } from './music-catalog';

export function useGameMusic(demo: boolean, worldReady: boolean) {
  const settings = useGameSettings();
  const volume = settings.audio.backgroundVolume;
  const [player] = useState(() => new BackgroundMusic());
  const [demoTrack, setDemoTrack] = useState<MusicTrackId>(DEFAULT_BACKGROUND_TRACK);
  const trackId = demo ? demoTrack : DEFAULT_BACKGROUND_TRACK;
  const lastVolume = useRef(volume || DEFAULT_GAME_SETTINGS.audio.backgroundVolume);
  const status = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);

  useEffect(() => {
    const visibility = () => player.setVisible(!document.hidden);
    const hide = () => player.setVisible(false);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', visibility);
      player.dispose();
    };
  }, [player]);

  useEffect(() => {
    if (volume > 0) lastVolume.current = volume;
    player.configure(trackId, volume, worldReady);
  }, [player, trackId, volume, worldReady]);

  useEffect(() => {
    // World loading, not movement or page mounting, owns automatic playback.
    if (worldReady) player.activate();
  }, [player, worldReady]);

  const setVolume = useCallback(
    (value: number) => {
      // Apply synchronously so a mute click cannot start music before React's next effect.
      player.configure(trackId, value, worldReady);
      if (value > 0 && worldReady) player.activate();
      setBackgroundVolume(value);
    },
    [player, trackId, worldReady],
  );

  const selectTrack = useCallback(
    (id: MusicTrackId) => {
      if (!demo) return;
      player.configure(id, volume, worldReady);
      if (worldReady) player.activate();
      setDemoTrack(id);
    },
    [demo, player, volume, worldReady],
  );

  return {
    volume,
    status,
    trackId,
    setVolume,
    selectTrack,
    toggleMute: () => setVolume(volume > 0 ? 0 : lastVolume.current),
    retry: player.retry,
  };
}

export type GameMusicControls = ReturnType<typeof useGameMusic>;
