import { describe, expect, it } from 'vitest';

import type { Rect } from '../../../src/domain/layout/geometry';
import {
  VIEWPORT_LIMITS,
  clampTransform,
  formatZoomPercent,
  fitTransform,
  panBy,
  resetTransform,
  zoomAtPoint,
} from '../../../src/features/map/viewport-transform';

const world: Rect = { x: 0, y: 0, width: 720, height: 480 };
const viewport = { width: 800, height: 600 };
const large: Rect = { x: 0, y: 0, width: 1_600, height: 1_200 };

describe('viewport transforms', () => {
  it('fits with 24px inset and resets to centred 1x', () => {
    expect(VIEWPORT_LIMITS).toMatchObject({
      minimumScale: 0.01,
      maximumScale: 3,
      fitInset: 24,
      recoverableMapPixels: 64,
    });
    expect(fitTransform(world, viewport)).toEqual({
      x: 24,
      y: 49.333333333333314,
      scale: 1.0444444444444445,
    });
    expect(resetTransform(world, viewport)).toEqual({ x: 40, y: 60, scale: 1 });
    expect(resetTransform(large, viewport)).toEqual({ x: -400, y: -300, scale: 1 });
  });

  it('clamps large maps to a 64px recoverable strip and centres small maps', () => {
    expect(clampTransform({ x: 1_000, y: 1_000, scale: 1 }, large, viewport)).toEqual({
      x: 736,
      y: 536,
      scale: 1,
    });
    expect(clampTransform({ x: -2_000, y: -2_000, scale: 1 }, large, viewport)).toEqual({
      x: -1_536,
      y: -1_136,
      scale: 1,
    });
    expect(clampTransform({ x: 0, y: 0, scale: 0.5 }, world, viewport)).toEqual({
      x: 220,
      y: 180,
      scale: 0.5,
    });
  });

  it('zooms around the pointer, clamps scale, and formats the readout', () => {
    const current = { x: -200, y: -100, scale: 1 };
    const anchor = { x: 300, y: 250 };
    expect(zoomAtPoint(current, anchor, 1.2, large, viewport)).toEqual({
      x: -300,
      y: -170,
      scale: 1.2,
    });
    expect(zoomAtPoint(current, anchor, 99, large, viewport).scale).toBe(3);
    expect(zoomAtPoint(current, anchor, 0.0001, large, viewport).scale).toBe(0.01);
    expect(formatZoomPercent({ x: 0, y: 0, scale: 1.204 })).toBe('120%');
  });

  it('pans and applies the same recoverable-map clamp', () => {
    expect(panBy({ x: 700, y: 500, scale: 1 }, 100, 100, large, viewport)).toEqual({
      x: 736,
      y: 536,
      scale: 1,
    });
  });
});
