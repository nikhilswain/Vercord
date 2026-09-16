import { describe, expect, it } from 'vitest';
import { steppedZoom, wheelZoom } from '../../../src/features/rpg/camera-zoom';

describe('RPG wheel zoom', () => {
  it('handles fine trackpad deltas without jumping an entire zoom level', () => {
    const event = { deltaY: -2, deltaMode: 0, ctrlKey: false };
    expect(wheelZoom(1, event, 900, 0.25, 4)).toBeGreaterThan(1);
    expect(wheelZoom(1, event, 900, 0.25, 4)).toBeLessThan(1.01);
    const zoomed = wheelZoom(1, event, 900, 0.25, 4);
    expect(wheelZoom(zoomed, { ...event, deltaY: 2 }, 900, 0.25, 4)).toBeCloseTo(1);
  });

  it('normalizes line scrolling, handles pinch, and clamps extreme gestures', () => {
    const zoom = (deltaY: number, deltaMode = 0, ctrlKey = false) =>
      wheelZoom(1, { deltaY, deltaMode, ctrlKey }, 900, 0.25, 4);
    expect(zoom(3, 1)).toBe(zoom(48));
    expect(zoom(-4, 0, true)).toBeGreaterThan(zoom(-4));
    expect(zoom(10000)).toBe(zoom(160));
    expect(wheelZoom(4, { deltaY: -100, deltaMode: 0, ctrlKey: false }, 900, 0.25, 4)).toBe(4);
    expect(wheelZoom(0.25, { deltaY: 100, deltaMode: 0, ctrlKey: false }, 900, 0.25, 4)).toBe(0.25);
  });

  it('keeps button zoom working after a fractional wheel zoom and on small viewports', () => {
    expect(steppedZoom(1.12, 2, 0.17, 4)).toBe(1.5);
    expect(steppedZoom(1.12, 0.5, 0.17, 4)).toBe(1);
    expect(steppedZoom(0.25, 0.5, 0.17, 4)).toBe(0.17);
    expect(steppedZoom(3, 2, 0.25, 3)).toBe(3);
  });
});
