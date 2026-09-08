import { describe, expect, it } from 'vitest';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import { parseWorldDocument } from '../../../src/domain/world/document';
import { footprint, overlaps, sceneIsReachable } from '../../../src/domain/world/geometry';
import { generateStreetDocument } from '../../../src/domain/world/streets';
import { RpgSimulation } from '../../../src/features/rpg/simulation';

const worldId = 'c41ec8ec-0606-47ed-9dcc-87a1c5535ab1';
const seed = 'e66d39d2-9139-49da-8e41-000000000001';
const streetSeeds = ['elm', 'birch', 'ash', 'pine'];
const themes = ['village', 'norse'] as const;
const houseIds = ['house:0', 'house:1', 'house:2', 'house:3', 'house:4', 'house:5'];

describe('saved neighborhood streets', () => {
  it.each(themes)('saves six physical %s homes without changing the original world', (themeId) => {
    const base = generateWorldDocument({ worldId, seed, themeId });
    const original = structuredClone(base);
    const document = generateStreetDocument(base, streetSeeds[0]!);
    const scene = document.scenes.overworld;

    expect(base).toEqual(original);
    expect({ ...document, scenes: original.scenes }).toEqual(original);
    expect(document.scenes.dungeon).toEqual(original.scenes.dungeon);
    expect(scene).not.toEqual(original.scenes.overworld);
    expect(parseWorldDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
    expect(generateStreetDocument(base, streetSeeds[0]!)).toEqual(document);
    expect(scene.npcs).toEqual([]);
    expect(scene.landmarks.filter(({ id }) => id.startsWith('house:')).map(({ id }) => id)).toEqual(
      houseIds,
    );
    const buildings = scene.stamps.filter(({ texture, frame }) =>
      themeId === 'village'
        ? (texture === 'lpc-house-hall' && frame === 'main') ||
          texture === 'lpc-house-brick' ||
          texture === 'lpc-house-paneled'
        : ['norse-longhouse', 'norse-cottage', 'norse-smithy'].includes(texture),
    );
    expect(buildings).toHaveLength(6);
    expect(new Set(buildings.map(({ texture }) => texture)).size).toBe(3);
    expect(scene.landmarks.find(({ id }) => id === 'town-square')).toMatchObject({ kind: 'sign' });
    expect(
      scene.landmarks.some(
        ({ kind, destination }) => kind === 'portal' && destination === 'dungeon',
      ),
    ).toBe(true);
    expect(scene.bounds.width).toBeLessThanOrEqual(2048);
    expect(scene.bounds.height).toBeLessThanOrEqual(2048);
    expect(scene.bounds.width * scene.bounds.height).toBeLessThanOrEqual(3_000_000);
    expect(scene.stamps.length).toBeLessThanOrEqual(6000);
    const entries = [...scene.stamps, ...scene.colliders, ...scene.lights, ...scene.landmarks];
    expect(new Set(entries.map(({ id }) => id)).size).toBe(entries.length);
    expect(
      Math.min(
        ...scene.landmarks
          .filter(({ id }) => id.startsWith('house:'))
          .map((house) => Math.hypot(house.x - scene.spawn.x, house.y - scene.spawn.y)),
      ),
    ).toBeLessThan(240);

    document.scenes.dungeon.stamps[0]!.x += 32;
    scene.stamps[0]!.x += 32;
    expect(base).toEqual(original);
    expect(generateStreetDocument(base, streetSeeds[0]!)).not.toEqual(document);
  });

  it.each(themes)('varies %s streets while keeping roads clear of every solid base', (themeId) => {
    const base = generateWorldDocument({ worldId, seed, themeId });
    const scenes = streetSeeds.map(
      (streetSeed) => generateStreetDocument(base, streetSeed).scenes.overworld,
    );
    const houses = scenes.map((scene) =>
      scene.landmarks.filter(({ id }) => id.startsWith('house:')).map(({ id, x, y }) => [id, x, y]),
    );
    const roads = scenes.map((scene) =>
      scene.stamps.filter(({ id }) => id.startsWith('overworld:road:')),
    );
    expect(new Set(houses.map((placements) => JSON.stringify(placements))).size).toBe(4);
    expect(
      new Set(roads.map((stamps) => JSON.stringify(stamps.map(({ x, y }) => [x, y])))).size,
    ).toBe(4);
    scenes.forEach((scene, index) => {
      expect(roads[index]!.length).toBeGreaterThan(100);
      for (const road of roads[index]!) {
        expect(
          scene.colliders.some((box) => overlaps({ ...road, width: 32, height: 32 }, box)),
          road.id,
        ).toBe(false);
      }
    });
  });

  it.each(themes)(
    'reaches every %s doorway, sign and stair with the real player footprint',
    (themeId) => {
      const base = generateWorldDocument({ worldId, seed, themeId });
      for (const streetSeed of streetSeeds.slice(0, 3)) {
        const scene = generateStreetDocument(base, streetSeed).scenes.overworld;
        expect(sceneIsReachable(scene)).toBe(true);
        for (const target of [scene.spawn, ...scene.landmarks]) {
          const simulation = new RpgSimulation(scene);
          simulation.navigate(target);
          for (let frame = 0; frame < 550; frame++) {
            simulation.tick(0.05, { x: 0, y: 0, moving: false, sprinting: false });
            expect(scene.colliders.some((box) => overlaps(footprint(simulation.player), box))).toBe(
              false,
            );
          }
          expect(
            Math.hypot(simulation.player.x - target.x, simulation.player.y - target.y),
          ).toBeLessThan(32);
          if ('id' in target && typeof target.id === 'string')
            expect(simulation.nearby()?.ui.id, target.id).toBe(target.id);
        }
      }
    },
    30_000,
  );
});
