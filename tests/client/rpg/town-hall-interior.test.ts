import { describe, expect, it } from 'vitest';
import { buildTownHall, HALL_BOARDS } from '../../../src/domain/world/content/town-hall-v1/scene';
import { RpgSimulation } from '../../../src/features/rpg/simulation';
import { readRpgRoute, resolveRpgTravel, writeRpgRoute } from '../../../src/features/rpg/themes';
import { containsRect, footprint, overlaps } from '../../../src/domain/world/geometry';
import { presentTownHall } from '../../../src/features/rpg/town-hall/presentation';

describe('Town Hall', () => {
  it('keeps every board, staff member, and doorway safely reachable through the furnished hall', () => {
    const hall = presentTownHall('village');
    const simulation = new RpgSimulation(hall, 'hall', new Map());
    expect(hall.bounds.width * hall.bounds.height).toBeGreaterThan(800000);
    for (const point of [...hall.landmarks, ...hall.npcs]) {
      expect(containsRect(hall.bounds, footprint(point)), point.id).toBe(true);
      expect(
        hall.colliders.some((box) => overlaps(box, footprint(point))),
        point.id,
      ).toBe(false);
      // NPC feet are solid, so ask for a nearby approach instead of standing on them.
      const target = 'lines' in point ? { x: point.x, y: point.y + 32 } : point;
      const path = simulation.navigationPaths.findPath(hall.spawn, target);
      expect(path.length, point.id).toBeGreaterThan(0);
      expect(
        Math.hypot(path.at(-1)!.x - target.x, path.at(-1)!.y - target.y),
        point.id,
      ).toBeLessThan(24);
      simulation.player = target;
      expect(simulation.nearby()?.target.id, point.id).toBe(point.id);
    }
    expect(hall.landmarks.filter((p) => Object.hasOwn(HALL_BOARDS, p.id))).toHaveLength(4);
    expect(hall.adventure?.definition).toBeUndefined();
    expect(buildTownHall('village')).toEqual(buildTownHall('village'));
  });

  it('separates town, hall, and cellar routes and preserves their return destinations across reloads', () => {
    const town = { theme: 'village', world: 'village', street: 'square' } as const;
    const hall = resolveRpgTravel(town, 'town-hall');
    expect(hall).toEqual({ ...town, hall: true });
    const cellar = resolveRpgTravel(hall, 'dungeon');
    const reopened = readRpgRoute(
      writeRpgRoute(new URL('http://localhost/play/server'), cellar).search,
    );
    expect(resolveRpgTravel(reopened, 'return')).toEqual(hall);
    expect(resolveRpgTravel(hall, 'return')).toEqual(town);
    expect(resolveRpgTravel(hall, 'norse')).toEqual({ theme: 'norse', world: 'norse' });
    const conflicting = readRpgRoute('?place=town-hall&house=house:2&forest=verge');
    expect(conflicting).toEqual({ theme: 'village', world: 'village', hall: true });
    expect(
      writeRpgRoute(new URL('http://localhost/?house=house:2&forest=verge'), hall).search,
    ).not.toMatch(/house|forest/);
  });
});
