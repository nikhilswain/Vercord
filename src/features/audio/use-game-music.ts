import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_GAME_SETTINGS } from '../settings/game-settings';
import { setBackgroundVolume, useGameSettings } from '../settings/use-game-settings';
import { BackgroundMusic } from './background-music';
import { DEFAULT_BACKGROUND_TRACK, type MusicTrackId } from './music-catalog';

export function useGameMusic(demo: boolean) {
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
    const gesture = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)
      )
        return;
      player.activate();
    };
    visibility();
    window.addEventListener('pointerup', gesture);
    window.addEventListener('keydown', gesture);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', visibility);
    return () => {
      window.removeEventListener('pointerup', gesture);
      window.removeEventListener('keydown', gesture);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', visibility);
      player.dispose();
    };
  }, [player]);

  useEffect(() => {
    if (volume > 0) lastVolume.current = volume;
    player.configure(trackId, volume, true);
  }, [player, trackId, volume]);

  const setVolume = useCallback(
    (value: number) => {
      // Apply synchronously so a mute click cannot start music before React's next effect.
      player.configure(trackId, value, true);
      setBackgroundVolume(value);
    },
    [player, trackId],
  );

  const selectTrack = useCallback(
    (id: MusicTrackId) => {
      if (!demo) return;
      player.configure(id, volume, true);
      player.activate();
      setDemoTrack(id);
    },
    [demo, player, volume],
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
