import assert from 'node:assert/strict';
import { BackgroundMusic } from '../src/features/audio/background-music';
import { DEFAULT_BACKGROUND_TRACK, MUSIC_TRACKS } from '../src/features/audio/music-catalog';
import { DEFAULT_GAME_SETTINGS, parseGameSettings } from '../src/features/settings/game-settings';

class FakeMedia extends EventTarget {
  src = '';
  paused = true;
  currentTime = 12;
  error: object | null = null;
  loads = 0;
  requests: { resolve(): void; reject(error: Error): void }[] = [];
  play() {
    this.paused = false;
    return new Promise<void>((resolve, reject) => this.requests.push({ resolve, reject }));
  }
  pause() {
    this.paused = true;
  }
  load() {
    this.loads++;
    this.error = null;
    this.currentTime = 0;
  }
}
const media = new FakeMedia();
let created = 0,
  disposed = 0,
  gain = 0;
const player = new BackgroundMusic(() => {
  created++;
  return {
    media: media as unknown as HTMLAudioElement,
    setVolume: (value) => {
      gain = value;
    },
    resume: () => Promise.resolve(),
    dispose: () => {
      disposed++;
      media.pause();
    },
  };
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

assert.equal(MUSIC_TRACKS.length, 2);
assert(MUSIC_TRACKS.some((track) => track.id === DEFAULT_BACKGROUND_TRACK));
for (const raw of [null, 'broken', '{}', '{"version":2}', '{"version":1,"audio":null}'])
  assert.deepEqual(parseGameSettings(raw), DEFAULT_GAME_SETTINGS);
assert.equal(
  parseGameSettings('{"version":1,"audio":{"backgroundVolume":-10}}').audio.backgroundVolume,
  0,
);
assert.equal(
  parseGameSettings('{"version":1,"audio":{"backgroundVolume":900}}').audio.backgroundVolume,
  100,
);
assert.equal(
  parseGameSettings('{"version":1,"audio":{"backgroundVolume":"20"}}').audio.backgroundVolume,
  35,
);
assert.equal(
  parseGameSettings('{"version":1,"audio":{"backgroundVolume":0}}').audio.backgroundVolume,
  0,
);

player.configure('peaceful-village', 35, true);
assert.equal(created, 0, 'no download/audio context before interaction');
assert.equal(player.getSnapshot(), 'waiting');
player.activate();
player.activate();
assert.equal(created, 1);
assert.equal(media.requests.length, 1, 'repeated gestures never stack pending play attempts');
assert.equal(gain, 0.35);
media.requests[0]!.resolve();
await flush();
assert.equal(player.getSnapshot(), 'playing');
player.configure('peaceful-village', 18, true);
assert.equal(gain, 0.18);
assert.equal(media.requests.length, 1, 'volume/scene renders do not restart a track');
assert.equal(media.currentTime, 12);

player.configure('sunset-plains', 18, true);
assert.equal(media.src, MUSIC_TRACKS[1].url);
assert.equal(media.requests.length, 2);
player.configure('peaceful-village', 18, true);
assert.equal(media.requests.length, 3);
media.requests[1]!.reject(new Error('stale track failure'));
await flush();
assert.equal(player.getSnapshot(), 'loading', 'old failures cannot overwrite the current track');
media.requests[2]!.resolve();
await flush();
assert.equal(player.getSnapshot(), 'playing');
assert.equal(created, 1, 'track changes reuse one output');

media.currentTime = 19;
player.setVisible(false);
assert.equal(media.paused, true);
assert.equal(player.getSnapshot(), 'paused');
player.setVisible(true);
assert.equal(media.currentTime, 19, 'returning to tab resumes at the same position');
player.setVisible(false);
media.requests.at(-1)!.resolve();
await flush();
assert.equal(player.getSnapshot(), 'paused', 'pending play cannot revive a hidden tab');

player.configure('peaceful-village', 0, true);
player.setVisible(true);
player.activate();
assert.equal(player.getSnapshot(), 'muted');
assert.equal(media.paused, true);
assert.equal(gain, 0);
player.configure('peaceful-village', 35, true);
media.requests.at(-1)!.reject(new DOMException('Needs gesture', 'NotAllowedError'));
await flush();
assert.equal(player.getSnapshot(), 'waiting', 'autoplay rejection is recoverable');
player.activate();
media.requests.at(-1)!.resolve();
await flush();
assert.equal(player.getSnapshot(), 'playing');

media.error = {};
media.dispatchEvent(new Event('error'));
assert.equal(player.getSnapshot(), 'error');
const attempts = media.requests.length;
player.activate();
assert.equal(media.requests.length, attempts, 'failed media does not retry on every movement');
player.retry();
media.requests.at(-1)!.resolve();
await flush();
assert.equal(player.getSnapshot(), 'playing');
player.configure('sunset-plains', 35, true);
player.dispose();
media.requests.at(-1)!.resolve();
await flush();
assert.equal(disposed, 1);
assert.equal(media.paused, true);
assert.equal(player.getSnapshot(), 'waiting', 'unmount invalidates pending playback');
media.error = {};
media.dispatchEvent(new Event('error'));
assert.equal(player.getSnapshot(), 'waiting', 'unmount removes media listeners');
player.configure('peaceful-village', 0, true);
player.activate();
assert.equal(created, 1, 'a muted remount allocates no audio output');
player.dispose();
console.log(
  'Game music: settings recovery, lazy audio, live gain, track races, tab pause, mute, retries and cleanup passed.',
);
