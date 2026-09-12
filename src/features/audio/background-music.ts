import { backgroundVolume, DEFAULT_GAME_SETTINGS } from '../settings/game-settings';
import { DEFAULT_BACKGROUND_TRACK, getMusicTrack, type MusicTrackId } from './music-catalog';
import { createMusicOutput, type MusicOutput } from './music-output';

export type MusicStatus = 'waiting' | 'loading' | 'playing' | 'paused' | 'muted' | 'error';

/** One owner per game page, independent of Phaser scenes, rooms, and frame updates. */
export class BackgroundMusic {
  private output: MusicOutput | null = null;
  private track: MusicTrackId = DEFAULT_BACKGROUND_TRACK;
  private volume = DEFAULT_GAME_SETTINGS.audio.backgroundVolume;
  private enabled = false;
  private visible = true;
  private unlocked = false;
  private pending = false;
  private generation = 0;
  private status: MusicStatus = 'waiting';
  private readonly listeners = new Set<() => void>();

  constructor(private readonly createOutput = createMusicOutput) {}

  getSnapshot = (): MusicStatus => this.status;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  configure(track: MusicTrackId, volume: number, enabled: boolean) {
    if (track !== this.track) {
      this.stopPending();
      this.track = track;
      if (this.output) {
        this.output.media.src = getMusicTrack(track).url;
        this.output.media.load();
      }
      this.setStatus('waiting');
    }
    this.volume = backgroundVolume(volume);
    this.enabled = enabled;
    this.output?.setVolume(this.volume / 100);
    this.reconcile();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.reconcile();
  }

  /** Called within a pointer/key event, or by the explicit Start/Retry control. */
  activate = () => {
    this.unlocked = true;
    if (this.status === 'error') return; // A failed track retries only on explicit request.
    this.reconcile();
  };

  retry = () => {
    this.stopPending();
    this.output?.media.load();
    this.setStatus('waiting');
    this.activate();
  };

  dispose() {
    this.stopPending();
    if (this.output) {
      this.output.media.removeEventListener('error', this.onError);
      this.output.media.removeEventListener('waiting', this.onWaiting);
      this.output.media.removeEventListener('playing', this.onPlaying);
      this.output.dispose();
      this.output = null;
    }
    this.unlocked = false;
    this.enabled = false;
    this.setStatus('waiting');
  }

  private canPlay() {
    return this.enabled && this.visible && this.volume > 0;
  }
  private onError = () => {
    if (this.output?.media.error) {
      this.stopPending();
      this.setStatus('error');
    }
  };
  private onWaiting = () => {
    if (this.canPlay() && this.status !== 'error') this.setStatus('loading');
  };
  private onPlaying = () => {
    if (this.canPlay() && this.status !== 'error') this.setStatus('playing');
  };

  private reconcile() {
    if (!this.canPlay()) {
      this.stopPending();
      this.setStatus(this.volume === 0 ? 'muted' : 'paused');
      return;
    }
    if (!this.unlocked) {
      this.setStatus('waiting');
      return;
    }
    if (this.pending || this.status === 'error') return;
    try {
      if (!this.output) {
        this.output = this.createOutput();
        this.output.setVolume(this.volume / 100);
        this.output.media.src = getMusicTrack(this.track).url;
        this.output.media.addEventListener('error', this.onError);
        this.output.media.addEventListener('waiting', this.onWaiting);
        this.output.media.addEventListener('playing', this.onPlaying);
      }
      if (!this.output.media.paused && this.status === 'playing') return;
      this.pending = true;
      const generation = ++this.generation;
      this.setStatus('loading');
      // Start both inside the gesture; awaiting resume first loses activation on some browsers.
      void Promise.all([this.output.resume(), this.output.media.play()])
        .then(() => {
          if (generation !== this.generation) return;
          this.pending = false;
          if (this.canPlay()) this.setStatus('playing');
        })
        .catch((error: unknown) => {
          if (generation !== this.generation) return;
          this.pending = false;
          this.output?.media.pause();
          this.setStatus(
            error instanceof Error && error.name === 'NotAllowedError' ? 'waiting' : 'error',
          );
        });
    } catch {
      this.stopPending();
      this.setStatus('error');
    }
  }

  private stopPending() {
    ++this.generation;
    this.pending = false;
    this.output?.media.pause();
  }
  private setStatus(status: MusicStatus) {
    if (status === this.status) return;
    this.status = status;
    for (const listener of this.listeners) listener();
  }
}
