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

it('holds a conversation in place facing the player and resumes its route without a jump', () => {
  const sample = world('village').scenes.overworld;
  const simulation = new AmbientSimulation(sample, seed);
  const control = new AmbientSimulation(sample, seed);
  let time = 10_000;
  for (; time < 30_000; time += 100) {
    simulation.update(time);
    if (
      simulation.entities.some((entity) => entity.kind === 'humanoid' && entity.action === 'walk')
    )
      break;
  }
  const entity = simulation.entities.find(
    (candidate) => candidate.kind === 'humanoid' && candidate.action === 'walk',
  )!;
  const position = { x: entity.x, y: entity.y };
  expect(simulation.hold(entity.id, { facing: { x: entity.x - 40, y: entity.y } })).toBe(true);
  expect(entity).toMatchObject({
    ...position,
    action: 'idle',
    direction: 'left',
    interaction: { kind: 'talk' },
  });
  simulation.update(time + 60_000);
  control.update(time + 60_000);
  expect(entity).toMatchObject({ ...position, action: 'idle', direction: 'left' });
  const other = simulation.entities.find((candidate) => candidate.id !== entity.id)!;
  expect(other).toEqual(control.entities.find((candidate) => candidate.id === other.id));
  expect(simulation.release(entity.id)).toBe(true);
  expect(entity).toMatchObject(position);
  simulation.update(time + 60_100);
  expect(Math.hypot(entity.x - position.x, entity.y - position.y)).toBeGreaterThan(0);
  expect(Math.hypot(entity.x - position.x, entity.y - position.y)).toBeLessThanOrEqual(4.801);
});

it('expires pet holds during reduced motion and resumes from the frozen point', () => {
  const sample = world('village').scenes.overworld;
  const simulation = new AmbientSimulation(sample, seed);
  const control = new AmbientSimulation(sample, seed);
  simulation.update(10_000);
  const entity = simulation.entities.find((candidate) => candidate.kind === 'dog')!;
  const position = { x: entity.x, y: entity.y };
  expect(entity.interaction).toEqual({ kind: 'pet', durationMs: 1400 });
  expect(simulation.hold(entity.id)).toBe(true);
  simulation.update(11_000, true);
  expect(entity).toMatchObject({ ...position, action: 'idle' });
  simulation.update(12_000, true);
  expect(simulation.release(entity.id)).toBe(false);
  simulation.update(12_000);
  expect(entity).toMatchObject(position);
  simulation.update(12_100);
  control.update(10_100);
  expect(entity).toEqual(control.entities.find((candidate) => candidate.id === entity.id));
});

it.each(['village', 'norse'] as const)(
  'spreads a bounded population across a 1000-house %s town and keeps its routes safe',
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
    expect(simulation.entities).toHaveLength(32);
    const homes = sample.landmarks.filter((landmark) => landmark.id.startsWith('house:'));
    for (const axis of ['x', 'y'] as const) {
      const extent =
        Math.max(...homes.map((point) => point[axis])) -
        Math.min(...homes.map((point) => point[axis]));
      const populated =
        Math.max(...simulation.entities.map((point) => point[axis])) -
        Math.min(...simulation.entities.map((point) => point[axis]));
      expect(populated).toBeGreaterThan(extent * 0.65);
    }
    expect(
      simulation.entities.filter(
        (entity) => Math.hypot(entity.x - sample.spawn.x, entity.y - sample.spawn.y) < 420,
      ).length,
    ).toBeLessThanOrEqual(3);
    let previous = structuredClone(simulation.entities);
    const idleStarted = new Map<string, number>();
    for (let time = 0; time <= 180_000; time += 200) {
      simulation.update(time);
      for (const [index, entity] of simulation.entities.entries()) {
        const feet = footprint(entity);
        expect(containsRect(sample.bounds, feet)).toBe(true);
        expect(geometry.queryColliders(feet).some((box) => overlaps(box, feet))).toBe(false);
        expect(
          Math.hypot(entity.x - sample.spawn.x, entity.y - sample.spawn.y),
        ).toBeGreaterThanOrEqual(40);
        if (time > 0)
          expect(
            Math.hypot(entity.x - previous[index]!.x, entity.y - previous[index]!.y),
          ).toBeLessThanOrEqual(ENTITY_DEFINITIONS[entity.kind].navigation.speed / 5 + 0.001);
        const [minimumPause, maximumPause] = ENTITY_DEFINITIONS[entity.kind].navigation.pauseMs;
        if (entity.action === 'idle' && previous[index]?.action === 'walk')
          idleStarted.set(entity.id, time);
        const since = idleStarted.get(entity.id);
        if (since !== undefined) {
          expect(time - since).toBeLessThanOrEqual(maximumPause + 200);
          if (entity.action === 'walk') {
            expect(time - since).toBeGreaterThanOrEqual(minimumPause - 200);
            idleStarted.delete(entity.id);
          }
        }
      }
      previous = structuredClone(simulation.entities);
    }
  },
  20_000,
);
