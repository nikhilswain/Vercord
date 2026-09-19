import { describe, expect, it } from 'vitest';
import {
  FOREST_LINKS,
  FOREST_REGIONS,
  FOREST_REGION_IDS,
  forestNeighbors,
  forestSceneId,
} from '../../../src/domain/world/forest/catalog';
import { buildForestLayout, townForestEntrance } from '../../../src/domain/world/forest/layout';
import {
  containsRect,
  footprint,
  overlaps,
  WORLD_PLAYER_FEET,
} from '../../../src/domain/world/geometry';
import { RpgPathfinder } from '../../../src/features/rpg/pathfinding';
import { buildVillage } from '../../../src/domain/world/content/v1/village';
import { AdventureJourney } from '../../../src/features/rpg/adventure/journey';
import {
  presentForest,
  PREVIEW_FOREST_SEED,
  withForestTrail,
} from '../../../src/features/rpg/forest/presentation';
import { readRpgRoute, writeRpgRoute, resolveRpgTravel } from '../../../src/features/rpg/themes';
import { rpgLocationSchema } from '../../../src/domain/presence/rpg-protocol';
import { populateForest } from '../../../src/features/rpg/forest/population';
import {
  extendTownLayout,
  generateContinuousTownDocument,
} from '../../../src/domain/world/continuous-town';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import {
  forestGateClearance,
  townForestTrail,
} from '../../../src/domain/world/forest/town-entrance';

const seed = PREVIEW_FOREST_SEED;
describe('forest hunting grounds', () => {
  it.each(FOREST_REGION_IDS)(
    '%s has frequent small fights on roads and in woods, away from safe arrivals',
    (region) => {
      const layout = buildForestLayout(seed, region);
      const content = populateForest(layout, seed);
      const slimes = content.enemies.filter((e) => e.kind === 'slime');
      const guardians = content.enemies.filter((e) => e.kind === 'guardian');
      expect(content.enemies.length).toBeGreaterThan(125);
      expect(content.enemies.length).toBeLessThan(210);
      expect(slimes.length).toBeGreaterThan(40);
      expect(guardians.length).toBeGreaterThanOrEqual(2);
      expect(guardians.length).toBeLessThanOrEqual(3);
      for (const kind of ['forest-brute', 'forest-skirmisher', 'venus-trap', 'blue-death'])
        expect(content.enemies.some((e) => e.kind === kind)).toBe(true);
      const offpath = content.enemies.filter(
        (e) => !layout.scene.terrain!.roads.some((r) => overlaps(footprint(e), r)),
      );
      const hostile = content.enemies.filter((e) => !e.kind.startsWith('wild-'));
      const roadGuards = content.enemies.filter((e) => e.encounter === 'road');
      expect(roadGuards.length).toBeGreaterThan(45);
      expect(roadGuards.length / hostile.length).toBeGreaterThan(0.44);
      expect(roadGuards.length / hostile.length).toBeLessThan(0.7);
      expect(new Set(roadGuards.map((e) => e.kind)).size).toBeGreaterThanOrEqual(5);
      expect(
        roadGuards.every((e) => layout.scene.terrain!.roads.some((r) => overlaps(footprint(e), r))),
      ).toBe(true);
      // Road guards cover different parts of the region, not just its spawn corner.
      expect(
        new Set(roadGuards.map((e) => `${Math.floor(e.x / 2048)}:${Math.floor(e.y / 1792)}`)).size,
      ).toBeGreaterThanOrEqual(14);
      // Separate rolls cannot merge into 5–8 slimes or chain into a giant brood.
      const groups = new Map<string | undefined, typeof hostile>();
      for (const e of hostile) groups.set(e.encounterId, [...(groups.get(e.encounterId) ?? []), e]);
      expect(groups.has(undefined)).toBe(false);
      expect(groups.size).toBeGreaterThan(65);
      for (const group of groups.values()) expect(group.length).toBeLessThanOrEqual(3);
      expect(
        [...groups.values()].filter((group) => group.length <= 2).length / groups.size,
      ).toBeGreaterThan(0.85);
      for (const e of hostile) {
        expect(
          hostile.filter((other) => Math.hypot(e.x - other.x, e.y - other.y) < 320).length,
        ).toBeLessThanOrEqual(3);
        for (const other of hostile) {
          if (other.encounterId === e.encounterId) continue;
          expect(Math.hypot(e.x - other.x, e.y - other.y)).toBeGreaterThan(420);
        }
      }
      // Every hostile scales slightly above the player; wildlife keeps its gentler policy.
      for (const e of content.enemies.filter((e) => !e.kind.startsWith('wild-'))) {
        expect(e.levelOffset).toBeGreaterThanOrEqual(e.elite ? 2 : 1);
        expect(e.levelOffset).toBeLessThanOrEqual(e.elite ? 3 : 2);
      }
      for (const p of [...content.enemies, ...content.flowers]) {
        expect(containsRect(layout.scene.bounds, footprint(p))).toBe(true);
        expect(layout.scene.colliders.some((r) => overlaps(r, footprint(p)))).toBe(false);
        if (!p.id.includes('-garden-'))
          expect(content.safeAreas!.some((r) => overlaps(r, footprint(p)))).toBe(false);
      }
      const finder = new RpgPathfinder(
        layout.scene.bounds,
        layout.scene.colliders,
        WORLD_PLAYER_FEET,
        layout.scene.terrain!.roads,
      );
      for (const p of [offpath[0]!, offpath[Math.floor(offpath.length / 2)]!, offpath.at(-1)!]) {
        const route = finder.findPath(layout.scene.spawn, p);
        expect(route.length, `${region}: unreachable creature at ${p.x},${p.y}`).toBeGreaterThan(0);
        expect(Math.hypot(route.at(-1)!.x - p.x, route.at(-1)!.y - p.y)).toBeLessThan(20);
      }
      expect(layout.scene.stamps.some((s) => s.texture === 'lpc-stone-floor')).toBe(false);
    },
  );
  it('keeps a population stable on reload and varies it between worlds', () => {
    const layout = buildForestLayout(seed, 'verge');
    const population = populateForest(layout, seed);
    expect(populateForest(layout, seed)).toEqual(population);
    expect(populateForest(layout, 'another-world').enemies).not.toEqual(population.enemies);
    expect(new Set(population.enemies.map((e) => e.id)).size).toBe(population.enemies.length);
  });
  it.each(['server-world-two', '1168478368061194240'])(
    'keeps encounter sizes and travel coverage balanced for another world: %s',
    (worldSeed) => {
      for (const region of FOREST_REGION_IDS) {
        const { enemies } = populateForest(buildForestLayout(worldSeed, region), worldSeed);
        const hostile = enemies.filter((e) => !e.kind.startsWith('wild-'));
        const road = hostile.filter((e) => e.encounter === 'road');
        expect(hostile.length).toBeGreaterThan(90);
        expect(hostile.length).toBeLessThan(160);
        expect(road.length / hostile.length).toBeGreaterThan(0.44);
        expect(
          new Set(road.map((e) => `${Math.floor(e.x / 2048)}:${Math.floor(e.y / 1792)}`)).size,
        ).toBeGreaterThanOrEqual(14);
        expect(hostile.filter((e) => e.kind === 'guardian').length).toBeGreaterThanOrEqual(2);
        for (const e of hostile)
          expect(
            hostile.filter((other) => Math.hypot(e.x - other.x, e.y - other.y) < 320).length,
          ).toBeLessThanOrEqual(3);
      }
    },
  );
});
describe('Mosswild geography', () => {
  it('connects every region to town with reciprocal trails and optional loops', () => {
    const reached = new Set(['verge']);
    for (let pass = 0; pass < FOREST_REGION_IDS.length; pass++)
      for (const id of FOREST_REGION_IDS)
        if (reached.has(id)) for (const neighbor of forestNeighbors(id)) reached.add(neighbor);
    expect(reached.size).toBe(12);
    expect(FOREST_LINKS.length).toBeGreaterThan(11);
    expect(FOREST_REGION_IDS.flatMap((id) => FOREST_REGIONS[id].sites)).toHaveLength(96);
  });
  for (const region of FOREST_REGION_IDS)
    it(`${region} has safe entrances, discoveries and a connected road network`, () => {
      const layout = buildForestLayout(seed, region),
        scene = layout.scene;
      expect(scene.bounds.width).toBeGreaterThan(7000);
      expect(scene.stamps.length).toBeLessThan(12000);
      for (const point of [scene.spawn, layout.camp, ...layout.sites, ...layout.portals]) {
        const feet = footprint(point);
        expect(containsRect(scene.bounds, feet), `${region}: bounds`).toBe(true);
        expect(
          scene.colliders.some((c) => overlaps(feet, c)),
          `${region}: blocked ${JSON.stringify(point)}`,
        ).toBe(false);
      }
      const roads = scene.terrain!.roads,
        connected = new Set([0]);
      for (let pass = 0; pass < roads.length; pass++) {
        let changed = false;
        for (let i = 0; i < roads.length; i++)
          if (!connected.has(i) && [...connected].some((j) => overlaps(roads[i]!, roads[j]!))) {
            connected.add(i);
            changed = true;
          }
        if (!changed) break;
      }
      expect(connected.size).toBe(roads.length);
      const pathfinder = new RpgPathfinder(scene.bounds, scene.colliders, WORLD_PLAYER_FEET, roads);
      for (const point of [...layout.sites, layout.camp, ...layout.portals]) {
        const route = pathfinder.findPath(scene.spawn, point);
        expect(route.length, `${region}: no route to ${JSON.stringify(point)}`).toBeGreaterThan(0);
        expect(Math.hypot(route.at(-1)!.x - point.x, route.at(-1)!.y - point.y)).toBeLessThan(20);
      }
      for (const neighbor of forestNeighbors(region))
        expect(layout.portals.some((p) => p.target === neighbor)).toBe(true);
    });
  it('keeps published geography deterministic and leaves saved town geometry intact', () => {
    expect(buildForestLayout(seed, 'verge')).toEqual(buildForestLayout(seed, 'verge'));
    const town = buildVillage(),
      before = JSON.stringify(town),
      projected = withForestTrail(town);
    expect(JSON.stringify(town)).toBe(before);
    expect(projected.stamps.slice(0, town.stamps.length)).toEqual(town.stamps);
    expect(projected.colliders.slice(0, town.colliders.length)).toEqual(town.colliders);
    const entrance = townForestEntrance(town);
    expect(town.colliders.some((c) => overlaps(footprint(entrance), c))).toBe(false);
    expect(projected.forestPortals?.[0]?.target).toBe('verge');
  });
});

it.each(['village', 'norse'] as const)(
  'keeps the %s forest gate clear of channel houses and reachable after town growth',
  (themeId) => {
    for (let variant = 0; variant < 6; variant++) {
      const worldSeed = `e66d39d2-9139-49da-8e41-${String(variant).padStart(12, '0')}`;
      const base = generateWorldDocument({ worldId: seed, seed: worldSeed, themeId });
      let layout = extendTownLayout(null, [{ key: 'rooms', rooms: [{ key: 'one' }] }], worldSeed);
      for (const count of [1, 35]) {
        layout = extendTownLayout(
          layout,
          [
            {
              key: 'rooms',
              rooms: Array.from({ length: count }, (_, i) => ({
                key: i === 0 ? 'one' : `room-${i}`,
              })),
            },
          ],
          worldSeed,
        );
        const town = generateContinuousTownDocument(base, layout).scenes.overworld;
        const before = JSON.stringify(town),
          projected = withForestTrail(town);
        const { entrance, roads } = townForestTrail(town);
        const clearing = forestGateClearance(entrance);
        expect(JSON.stringify(town)).toBe(before);
        expect(projected.colliders.slice(0, town.colliders.length)).toEqual(town.colliders);
        expect(projected.stamps.slice(0, town.stamps.length)).toEqual(town.stamps);
        expect(
          projected.stamps.filter((s) => s.texture.startsWith('forest-waygate-')),
        ).toHaveLength(2);
        expect(projected.landmarks).toEqual(expect.arrayContaining(town.landmarks));
        expect(town.colliders.some((box) => overlaps(box, clearing))).toBe(false);
        expect(roads.some((road) => town.colliders.some((box) => overlaps(box, road)))).toBe(false);
        expect(Math.min(entrance.x, 2048 - entrance.x, entrance.y, 2048 - entrance.y)).toBeLessThan(
          320,
        );
        // Hiding private channel labels must never give two members different gate coordinates.
        expect(townForestEntrance({ ...town, landmarks: [] })).toEqual(entrance);
        const pathfinder = new RpgPathfinder(
          town.bounds,
          town.colliders,
          WORLD_PLAYER_FEET,
          projected.terrain!.roads,
        );
        const route = pathfinder.findPath(town.spawn, entrance);
        expect(route.length).toBeGreaterThan(0);
        expect(Math.hypot(route.at(-1)!.x - entrance.x, route.at(-1)!.y - entrance.y)).toBeLessThan(
          20,
        );
        expect(projected.stamps.some((s) => s.texture === 'forest-waygate-arch')).toBe(true);
      }
    }
  },
);

it('preserves forest routing and never treats an arbitrary scene as a permitted region', () => {
  const route = readRpgRoute('?theme=norse&forest=moonmere&house=house:3');
  expect(route).toMatchObject({ world: 'norse', forest: 'moonmere' });
  expect(route.house).toBeUndefined();
  expect(
    readRpgRoute(writeRpgRoute(new URL('https://example.test/play/server'), route).search),
  ).toEqual(route);
  expect(resolveRpgTravel(route, 'return').forest).toBeUndefined();
  expect(readRpgRoute('?forest=unknown').forest).toBeUndefined();
  expect(
    rpgLocationSchema.safeParse({
      x: 400,
      y: 400,
      scene: forestSceneId('verge'),
      action: 'idle',
      direction: 'down',
    }).success,
  ).toBe(true);
  expect(
    rpgLocationSchema.safeParse({
      x: 400,
      y: 400,
      scene: 'forest:private',
      action: 'idle',
      direction: 'down',
    }).success,
  ).toBe(false);
});

it('carries supplies, discoveries and cleared encounters across travel and a restored visit', () => {
  const sample = presentForest({
    contentVersion: 'mosswild-v1',
    worldId: seed,
    seed,
    region: 'verge',
  });
  const journey = new AdventureJourney();
  const enter = (owner: AdventureJourney) =>
    owner.enter(
      'forest:verge',
      sample.adventure!.definition!,
      sample.colliders,
      sample.bounds,
      sample.spawn,
      sample.spawn,
      { durationMs: 700, releaseMs: 400 },
    );
  const session = enter(journey);
  session.health = 63;
  session.herbs = 8;
  session.enemies[0]!.health = 0;
  session.gathered.add(sample.adventure!.definition!.flowers[0]!.id);
  journey.visit('verge');
  journey.discover('verge-site-0');
  journey.leave();
  const resumed = new AdventureJourney({ snapshot: journey.snapshot() });
  const next = enter(resumed);
  expect(next.health).toBe(63);
  expect(next.herbs).toBe(8);
  expect(next.enemies[0]!.health).toBe(0);
  expect(next.encounterSnapshot().rewarded).toContain(next.enemies[0]!.id);
  expect(next.gathered.size).toBe(1);
  expect(resumed.exploration()).toEqual({ visited: ['verge'], discovered: ['verge-site-0'] });
});

it('shows a deep-forest boss only when nearby and keeps distant wildlife asleep', () => {
  const sample = presentForest({
    contentVersion: 'mosswild-v1',
    worldId: seed,
    seed,
    region: 'old-ward',
  });
  const journey = new AdventureJourney();
  const session = journey.enter(
    'forest:old-ward',
    sample.adventure!.definition!,
    sample.colliders,
    sample.bounds,
    sample.spawn,
    sample.spawn,
    { durationMs: 700, releaseMs: 400 },
  );
  const boss = session.enemies.find((enemy) => enemy.kind === 'root-beast')!;
  expect(boss).toBeDefined();
  const position = { x: boss.x, y: boss.y };
  session.tick(0.05, sample.spawn);
  expect({ x: boss.x, y: boss.y }).toEqual(position);
  expect(session.status().boss).toBeUndefined();
  session.tick(0, { x: boss.x, y: boss.y + 120 });
  expect(session.status().boss?.name).toBe('Root Beast');
  session.tick(0, sample.spawn);
  expect(session.status().boss).toBeUndefined();
});
