import { describe, expect, it } from 'vitest';
import { footprint, overlaps, WORLD_PLAYER_FEET } from '../../../src/domain/world/geometry';
import type { Point, Rect } from '../../../src/domain/world/content/v1/types';
import { RpgPathfinder } from '../../../src/features/rpg/pathfinding';
import { RpgSimulation } from '../../../src/features/rpg/simulation';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import {
  extendTownLayout,
  generateContinuousTownDocument,
} from '../../../src/domain/world/continuous-town';

function expectClearRoute(from: Point, route: Point[], colliders: Rect[]) {
  expect(route.length).toBeGreaterThan(0);
  let previous = from;
  for (const target of route) {
    const steps = Math.max(1, Math.ceil(Math.hypot(target.x - previous.x, target.y - previous.y)));
    for (let step = 0; step <= steps; step++) {
      const feet = footprint({
        x: previous.x + ((target.x - previous.x) * step) / steps,
        y: previous.y + ((target.y - previous.y) * step) / steps,
      });
      expect(colliders.some((box) => overlaps(feet, box))).toBe(false);
    }
    previous = target;
  }
}

describe('bounded RPG pathfinding', () => {
  it.each(['village', 'norse'] as const)(
    'drives the real simulation to a distant doorway in a thousand-house %s town',
    (themeId) => {
      const seed = 'e66d39d2-9139-49da-8e41-000000000001';
      const base = generateWorldDocument({
        worldId: 'c41ec8ec-0606-47ed-9dcc-87a1c5535ab1',
        seed,
        themeId,
      });
      const layout = extendTownLayout(
        null,
        [
          {
            key: 'town',
            rooms: Array.from({ length: 1000 }, (_, index) => ({ key: `room:${index}` })),
          },
        ],
        seed,
      );
      const scene = generateContinuousTownDocument(base, layout).scenes.overworld;
      const destination = scene.landmarks.reduce((farthest, landmark) =>
        Math.hypot(landmark.x - scene.spawn.x, landmark.y - scene.spawn.y) >
        Math.hypot(farthest.x - scene.spawn.x, farthest.y - scene.spawn.y)
          ? landmark
          : farthest,
      );
      const simulation = new RpgSimulation(scene);
      simulation.navigate(destination);
      for (let frame = 0; frame < 6500; frame++) {
        simulation.tick(0.05, { x: 0, y: 0, moving: false, sprinting: false });
        const feet = footprint(simulation.player);
        expect(scene.colliders.some((box) => overlaps(feet, box))).toBe(false);
        if (simulation.action === 'idle') break;
      }
      expect(
        Math.hypot(simulation.player.x - destination.x, simulation.player.y - destination.y),
      ).toBeLessThan(2);
    },
  );

  it('routes across a 32k town along connected roads with ten thousand colliders', () => {
    const bounds = { x: 0, y: 0, width: 32_768, height: 32_768 };
    const barrier = { x: 160, y: 160, width: 31_800, height: 31_800 };
    const colliders = Array.from({ length: 10_000 }, (_, index) => ({
      x: 320 + (index % 100) * 256,
      y: 320 + Math.floor(index / 100) * 256,
      width: 32,
      height: 32,
    }));
    const roads = [
      { x: 32, y: 32, width: 32_096, height: 96 },
      { x: 32_032, y: 32, width: 96, height: 32_096 },
    ];
    const pathfinder = new RpgPathfinder(bounds, [barrier, ...colliders], WORLD_PLAYER_FEET, roads);
    const from = { x: 64, y: 80 };
    const destination = { x: 32_080, y: 32_080 };
    const started = performance.now();
    const route = pathfinder.findPath(from, destination);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(route.at(-1)).toEqual(destination);
    expect(route.length).toBeLessThan(12);
    expectClearRoute(from, route, [barrier]);
  });

  it('fails within its visit budget when a distant safe destination is sealed off', () => {
    const pathfinder = new RpgPathfinder(
      { x: 0, y: 0, width: 32_768, height: 32_768 },
      [
        { x: 15_000, y: 15_000, width: 2000, height: 32 },
        { x: 15_000, y: 16_968, width: 2000, height: 32 },
        { x: 15_000, y: 15_000, width: 32, height: 2000 },
        { x: 16_968, y: 15_000, width: 32, height: 2000 },
      ],
      WORLD_PLAYER_FEET,
    );
    const started = performance.now();
    expect(pathfinder.findPath({ x: 100, y: 100 }, { x: 16_000, y: 16_000 }, 128)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it.each([100, 104])('smooths a narrow-wall detour and reaches the exact click at y=%s', (y) => {
    const colliders = [{ x: 110, y: 60, width: 3, height: 80 }];
    const pathfinder = new RpgPathfinder(
      { x: 0, y: 0, width: 256, height: 256 },
      colliders,
      WORLD_PLAYER_FEET,
    );
    const from = { x: 50, y: 100 };
    const destination = { x: 200, y };
    const route = pathfinder.findPath(from, destination);
    expect(route.at(-1)).toEqual(destination);
    // Approach the obstacle diagonally, with only the two necessary corner turns.
    expect(route.length).toBeLessThanOrEqual(3);
    expect(route[0]!.x).toBeGreaterThan(from.x);
    expect(route[0]!.y).toBeLessThan(from.y);
    expectClearRoute(from, route, colliders);
  });

  it('smooths road intersections without cutting across the grass between distant streets', () => {
    const roads = [
      { x: 32, y: 32, width: 672, height: 96 },
      { x: 640, y: 32, width: 592, height: 96 },
      { x: 1136, y: 32, width: 96, height: 1200 },
    ];
    const pathfinder = new RpgPathfinder(
      { x: 0, y: 0, width: 1600, height: 1600 },
      [],
      WORLD_PLAYER_FEET,
      roads,
    );
    const from = { x: 64, y: 80 };
    const destination = { x: 1184, y: 1184 };
    const route = pathfinder.findPath(from, destination);
    expect(route.at(-1)).toEqual(destination);
    expect(route).toHaveLength(2);
    let previous = from;
    for (const target of route) {
      const steps = Math.ceil(Math.hypot(target.x - previous.x, target.y - previous.y) / 4);
      for (let step = 0; step <= steps; step++) {
        const feet = footprint({
          x: previous.x + ((target.x - previous.x) * step) / steps,
          y: previous.y + ((target.y - previous.y) * step) / steps,
        });
        expect(
          roads.some(
            (road) =>
              feet.x >= road.x &&
              feet.y >= road.y &&
              feet.x + feet.width <= road.x + road.width &&
              feet.y + feet.height <= road.y + road.height,
          ),
        ).toBe(true);
      }
      previous = target;
    }
  });

  it('selects a nearby safe destination for an obstacle click and rejects nonfinite clicks', () => {
    const colliders = [{ x: 160, y: 120, width: 80, height: 80 }];
    const pathfinder = new RpgPathfinder(
      { x: 0, y: 0, width: 512, height: 512 },
      colliders,
      WORLD_PLAYER_FEET,
    );
    const from = { x: 80, y: 160 };
    const destination = { x: 200, y: 160 };
    const route = pathfinder.findPath(from, destination);
    expectClearRoute(from, route, colliders);
    expect(
      Math.hypot(route.at(-1)!.x - destination.x, route.at(-1)!.y - destination.y),
    ).toBeLessThan(96);
    expect(pathfinder.findPath(from, { x: Number.NaN, y: 100 })).toEqual([]);
    expect(pathfinder.findPath(from, { x: Number.POSITIVE_INFINITY, y: 100 })).toEqual([]);
    expect(pathfinder.findPath(from, { x: Number.MAX_VALUE, y: 100 })).toEqual([]);
  });
});
