import { afterEach, describe, expect, it, vi } from 'vitest';

// The scene's real input lifecycle runs with only its graphics backend replaced.
vi.mock('phaser', () => ({
  Scene: class {
    game = { canvas: document.createElement('canvas') };
    cameras = { main: { centerOn() {}, zoom: 1 } };
    events = { once() {} };
  },
  Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
}));
vi.mock('../../../src/features/rpg/sample-renderer', () => ({
  registerRpgFrames() {},
  preloadRpgWorlds() {},
  RpgSampleRenderer: class {},
}));

import { RpgScene } from '../../../src/features/rpg/rpg-scene';
import { getRpgSample } from '../../../src/features/rpg/sample-worlds';

afterEach(() => vi.restoreAllMocks());

describe('RPG pause presence', () => {
  it.each(['blur', 'visibilitychange'] as const)(
    'publishes the latest stopped position on %s before another frame can run',
    (event) => {
      const sample = {
        ...getRpgSample('village'),
        spawn: { x: 104, y: 104 },
        colliders: [],
        npcs: [],
      };
      const onMove = vi.fn();
      const scene = new RpgScene(
        sample,
        {
          onReady() {},
          onError() {},
          onUi() {},
          onDialogue() {},
          onTravel() {},
          onMove,
        },
        [sample],
        'world/village',
        new Map(),
      );
      vi.spyOn(scene as unknown as { renderSample(): void }, 'renderSample').mockImplementation(
        () => {},
      );
      const pause = () =>
        event === 'blur'
          ? window.dispatchEvent(new Event(event))
          : document.dispatchEvent(new Event(event));
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      scene.create();
      try {
        pause();
        expect(onMove).not.toHaveBeenCalled();
        scene.setPlayerPosition({
          ...sample.spawn,
          direction: 'down',
          action: 'idle',
          scene: 'overworld',
          revision: 0,
        });
        scene['simulation'].tick(0.05, { x: 1, y: 0, moving: true, sprinting: true });
        // No animation frame or 100ms publisher interval elapses before the browser pauses.
        pause();
        expect(onMove).toHaveBeenCalledExactlyOnceWith({
          x: expect.closeTo(112.7),
          y: 104,
          direction: 'right',
          action: 'idle',
          scene: 'overworld',
          revision: 0,
        });
        pause();
        expect(onMove).toHaveBeenCalledTimes(1);
      } finally {
        scene.dispose();
      }
      scene['simulation'].tick(0.05, { x: 1, y: 0, moving: true, sprinting: true });
      pause();
      expect(onMove).toHaveBeenCalledTimes(1);
    },
  );
});
