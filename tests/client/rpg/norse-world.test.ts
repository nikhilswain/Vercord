import { describe, expect, it } from 'vitest';
import { getRpgSample } from '../../../src/features/rpg/sample-worlds';
import { RpgSimulation, RPG_FEET } from '../../../src/features/rpg/simulation';
import { overlaps } from '../../../src/features/world/engine/collision';
import { readRpgRoute, resolveRpgTravel, writeRpgRoute } from '../../../src/features/rpg/themes';

describe('Frosthavn exploration', () => {
  it('can reach every landmark and NPC without crossing solid scenery', () => {
    const sample = getRpgSample('norse');
    expect(sample).toBeDefined();
    for (const target of [...sample.landmarks, ...sample.npcs]) {
      const simulation = new RpgSimulation(sample);
      simulation.navigate(target);
      for (let frame = 0; frame < 400; frame++) {
        simulation.tick(0.05, { x: 0, y: 0, moving: false, sprinting: false });
        const feet = { ...RPG_FEET, x: simulation.player.x - 9, y: simulation.player.y - 12 };
        expect(
          sample.colliders.some((collider) => overlaps(feet, collider)),
          target.id,
        ).toBe(false);
      }
      expect(simulation.nearby()?.ui.id, target.id).toBe(target.id);
    }
  });

  it('keeps the traveler visible when approaching the longhouse, cottage and smithy', () => {
    const sample = getRpgSample('norse');
    expect(sample).toBeDefined();
    const buildings = sample.stamps.filter((stamp) =>
      ['norse-longhouse', 'norse-cottage', 'norse-smithy'].includes(stamp.texture),
    );
    expect(buildings.length).toBeGreaterThanOrEqual(3);
    for (const building of buildings) {
      const simulation = new RpgSimulation(sample);
      simulation.player = { x: building.x + building.width! / 2, y: building.depth! + 70 };
      for (let frame = 0; frame < 90; frame++) {
        simulation.tick(1 / 60, { x: 0, y: -1, moving: true, sprinting: false });
      }
      expect(simulation.action, building.texture).toBe('idle');
      expect(simulation.player.y, building.texture).toBeGreaterThan(building.depth!);
      expect(simulation.player.y, building.texture).toBeLessThan(building.depth! + 20);
    }
  });

  it.each(['village', 'norse'] as const)('returns to %s after a dungeon URL reload', (world) => {
    const entered = resolveRpgTravel({ world, theme: world }, 'dungeon');
    const url = writeRpgRoute(new URL('https://example.test/play/demo'), entered);
    const restored = readRpgRoute(url.search);
    expect(resolveRpgTravel(restored, 'return')).toEqual({ theme: world, world });
  });
});
