export interface MusicOutput {
  media: HTMLAudioElement;
  setVolume(value: number): void;
  resume(): Promise<void>;
  dispose(): void;
}

/** Stream a single track; the gain node makes volume work on mobile WebKit too. */
export function createMusicOutput(): MusicOutput {
  const media = new Audio();
  media.loop = true;
  media.preload = 'none';
  const context = new AudioContext();
  const source = context.createMediaElementSource(media);
  const gain = context.createGain();
  source.connect(gain);
  gain.connect(context.destination);
  return {
    media,
    setVolume(value) {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(value, context.currentTime, 0.02);
    },
    resume: () => context.resume(),
    dispose() {
      media.pause();
      media.removeAttribute('src');
      media.load();
      source.disconnect();
      gain.disconnect();
      void context.close().catch(() => {});
    },
  };
}
