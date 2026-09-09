import { afterEach, expect, it, vi } from 'vitest';
import { AmbientSimulation } from '../../../src/features/rpg/entities/simulation';
import { RpgPathfinder } from '../../../src/features/rpg/pathfinding';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import { generateHouseInterior } from '../../../src/domain/world/interiors';
import {
  extendTownLayout,
  generateContinuousTownDocument,
} from '../../../src/domain/world/continuous-town';
import {
  containsRect,
  footprint,
  overlaps,
  WORLD_PLAYER_FEET,
} from '../../../src/domain/world/geometry';
import { ENTITY_DEFINITIONS } from '../../../src/domain/world/catalog/entities';
import { getRpgCharacter } from '../../../src/domain/world/catalog/characters';
import type { WorldThemeId } from '../../../src/domain/world/document';

const worldId = '167dcf1c-7782-4f1a-9ce4-71f19de323ef';
const seed = '89eb866b-0753-468e-9613-34ac4bd3cffa';
const world = (themeId: WorldThemeId) => generateWorldDocument({ worldId, seed, themeId });
afterEach(() => vi.restoreAllMocks());

it('reproduces independent entity locations from absolute time without ambient random state', () => {
  const sample = world('village').scenes.overworld;
  const before = JSON.stringify(sample);
  vi.spyOn(Math, 'random').mockImplementation(() => {
    throw new Error('Ambient randomness');
  });
  const first = new AmbientSimulation(sample, seed);
  first.update(1_788_888_880_000);
  first.update(1_788_888_880_250);
  const second = new AmbientSimulation(sample, seed);
  second.update(1_788_888_880_250);
  expect(first.entities).toEqual(second.entities);
  expect(first.entities).not.toBe(second.entities);
  expect(first.entities).toHaveLength(8);
  expect(new Set(first.entities.map((entity) => entity.id)).size).toBe(8);
  expect(new Set(first.entities.map((entity) => entity.kind))).toEqual(
    new Set(['humanoid', 'dog', 'cat']),
  );
  for (const entity of first.entities)
    if (entity.appearance) expect(getRpgCharacter(entity.appearance).id).toBe(entity.appearance);
  const initial = structuredClone(first.entities);
  first.update(1_788_888_890_000);
  expect(first.entities).not.toEqual(initial);
  expect(JSON.stringify(sample)).toBe(before);
});

it('plans a bounded number of short routes once and skips population for houses', () => {
  const sample = world('norse').scenes.overworld;
  const path = vi.spyOn(RpgPathfinder.prototype, 'findPath');
  const simulation = new AmbientSimulation(sample, seed);
  const count = path.mock.calls.length;
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(8 * 12);
  expect(path.mock.calls.every(([, , budget]) => budget !== undefined && budget <= 512)).toBe(true);
  for (let now = 0; now < 300_000; now += 100) simulation.update(now);
  expect(path).toHaveBeenCalledTimes(count);
  const vault = new AmbientSimulation(world('village').scenes.dungeon, seed);
  expect(vault.entities).toHaveLength(2);
  const house = generateHouseInterior({
    worldId,
    seed,
    themeId: 'village',
    landmarkId: 'house:0',
    roomType: 'text',
  });
  expect(new AmbientSimulation({ ...house.scene, sceneId: 'house:0' }, seed).entities).toEqual([]);
});

it.each(['village', 'norse'] as const)(
  'keeps a bounded population safe for five minutes in a 1000-house %s town',
  (themeId) => {
    const square = world(themeId);
    const layout = extendTownLayout(
      null,
      Array.from({ length: 20 }, (_, group) => ({
        key: `a_${group}`,
        rooms: Array.from({ length: 50 }, (_, room) => ({ key: `c_${group}_${room}` })),
      })),
      seed,
    );
    const sample = generateContinuousTownDocument(square, layout).scenes.overworld;
    const obstacles = [
      ...sample.colliders,
      ...sample.npcs.map(footprint),
      ...sample.landmarks
        .filter((landmark) => landmark.id.startsWith('house:') || landmark.kind === 'portal')
        .map((landmark) => ({ x: landmark.x - 24, y: landmark.y - 24, width: 48, height: 48 })),
    ];
    const geometry = new RpgPathfinder(sample.bounds, obstacles, WORLD_PLAYER_FEET);
    const simulation = new AmbientSimulation(sample, seed);
    expect(simulation.entities).toHaveLength(8);
    let previous = structuredClone(simulation.entities);
    const idleStarted = new Map<string, number>();
    for (let time = 0; time <= 300_000; time += 100) {
      simulation.update(time);
      for (const [index, entity] of simulation.entities.entries()) {
        const feet = footprint(entity);
        expect(containsRect(sample.bounds, feet)).toBe(true);
        expect(geometry.queryColliders(feet).some((box) => overlaps(box, feet))).toBe(false);
        expect(
          Math.hypot(entity.x - sample.spawn.x, entity.y - sample.spawn.y),
        ).toBeGreaterThanOrEqual(40);
        expect(
          Math.hypot(entity.x - sample.spawn.x, entity.y - sample.spawn.y),
        ).toBeLessThanOrEqual(420);
        if (time > 0)
          expect(
            Math.hypot(entity.x - previous[index]!.x, entity.y - previous[index]!.y),
          ).toBeLessThanOrEqual(ENTITY_DEFINITIONS[entity.kind].navigation.speed / 10 + 0.001);
        const [minimumPause, maximumPause] = ENTITY_DEFINITIONS[entity.kind].navigation.pauseMs;
        if (entity.action === 'idle' && previous[index]?.action === 'walk')
          idleStarted.set(entity.id, time);
        const since = idleStarted.get(entity.id);
        if (since !== undefined) {
          expect(time - since).toBeLessThanOrEqual(maximumPause + 100);
          if (entity.action === 'walk') {
            expect(time - since).toBeGreaterThanOrEqual(minimumPause - 100);
            idleStarted.delete(entity.id);
          }
        }
      }
      previous = structuredClone(simulation.entities);
    }
  },
  20_000,
);
