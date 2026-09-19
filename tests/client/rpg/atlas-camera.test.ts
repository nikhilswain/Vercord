import { describe, expect, it, vi } from 'vitest';
import { AtlasCamera } from '../../../src/features/rpg/atlas/camera';
import { AtlasController } from '../../../src/features/rpg/atlas/controller';
import { getAtlasModel } from '../../../src/features/rpg/atlas/model';
import { getRpgSample } from '../../../src/features/rpg/sample-worlds';
import {
  flushAnimationFrames,
  setBrowserMediaState,
  setElementRect,
  triggerResize,
} from '../helpers/browser-api-mocks';

describe('atlas opening zoom', () => {
  it('keeps a requested player focus when ResizeObserver reports the initial unchanged size', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    setElementRect(svg, { width: 960, height: 640 });
    const camera = new AtlasCamera(svg, { x: 0, y: 0, width: 8000, height: 6000 });
    try {
      camera.moveTo({ x: 1200, y: 1700, width: 1800 });
      triggerResize(svg, 960, 640);
      expect(camera.target).toEqual({ x: 1200, y: 1700, width: 1800 });
      triggerResize(svg, 640, 960);
      expect(camera.aspect).toBeCloseTo(2 / 3);
      expect(camera.pixelWidth).toBe(640);
    } finally {
      camera.destroy();
    }
  });
});

describe('atlas stepped dismissal', () => {
  it('zooms out again if a pin editor interrupted the previous return to overview', () => {
    setBrowserMediaState({ reducedMotion: true });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    setElementRect(svg, { width: 960, height: 640 });
    const sample = getRpgSample('village');
    const controller = new AtlasController(svg, getAtlasModel(sample), {
      selection: vi.fn(),
      pin: vi.fn(),
      destination: vi.fn(),
      zoom: vi.fn(),
    });
    try {
      controller.locate(sample.spawn);
      flushAnimationFrames(performance.now() + 40);
      expect(controller.camera.view.width).toBeLessThan(controller.camera.baseWidth);
      expect(controller.back()).toBe(true);
      // Opening a nested editor freezes a camera tween at its visible zoom.
      controller.setEnabled(false);
      const paused = { ...controller.camera.view };
      expect(controller.back()).toBe(true);
      expect(controller.camera.target).toEqual(paused);
      controller.setEnabled(true);
      expect(controller.back()).toBe(true);
      expect(controller.camera.target).toEqual(controller.camera.overview);
      // A second deliberate Escape may close without waiting for the tween.
      expect(controller.back()).toBe(false);
    } finally {
      controller.destroy();
    }
  });
});
