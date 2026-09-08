import { describe, expect, it } from 'vitest';
import { getRpgSample } from '../../../src/features/rpg/sample-worlds';
import { RpgSimulation } from '../../../src/features/rpg/simulation';

describe('gathering hall approach', () => {
  it.each([
    ['main facade', 600, 520],
    ['front door', 560, 520],
    ['recessed wing', 672, 490],
  ] as const)('keeps a traveler visible at the %s collision boundary', (_name, x, y) => {
    const sample = getRpgSample('village');
    const simulation = new RpgSimulation(sample);
    simulation.player = { x, y };
    for (let frame = 0; frame < 120; frame++) {
      simulation.tick(1 / 60, { x: 0, y: -1, moving: true, sprinting: false });
    }
    expect(simulation.player.y).toBeLessThan(y - 20);
    expect(simulation.action).toBe('idle');

    const facades = sample.stamps.filter((stamp) => {
      if (stamp.texture !== 'lpc-house-hall' && stamp.texture !== 'lpc-door-small') return false;
      const texture = sample.textures.find((asset) => asset.key === stamp.texture)!;
      const crop = texture.frames?.[stamp.frame ?? ''];
      // The unchanged hall source sheet is 256px wide; cropped parts use their frame width.
      const width = crop?.width ?? 256;
      return x >= stamp.x && x < stamp.x + width && stamp.y < y;
    });
    expect(facades.length).toBeGreaterThan(0);
    for (const facade of facades) {
      expect(
        simulation.player.y,
        `${facade.texture} must draw behind the stopped traveler`,
      ).toBeGreaterThan(facade.depth!);
    }
  });
});

describe('signpost approach', () => {
  it.each([
    ['village', 835.2, 672],
    ['village', 1104, 896],
    ['dungeon', 768, 384],
    ['dungeon', 272, 928],
  ] as const)('stops in front of the %s sign at %s, %s', (theme, x, baseline) => {
    const simulation = new RpgSimulation(getRpgSample(theme));
    simulation.player = { x, y: baseline + 64 };
    for (let frame = 0; frame < 60; frame++) {
      simulation.tick(1 / 60, { x: 0, y: -1, moving: true, sprinting: true });
    }
    expect(simulation.player.y).toBeLessThan(baseline + 32);
    expect(simulation.player.y).toBeGreaterThan(baseline);
    expect(simulation.action).toBe('idle');
  });
});
