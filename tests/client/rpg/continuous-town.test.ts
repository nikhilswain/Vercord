import { describe, expect, it } from 'vitest';
import {
  extendTownLayout,
  generateContinuousTownDocument,
  parseContinuousTownLayout,
} from '../../../src/domain/world/continuous-town';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import { parseWorldDocument, type WorldScene } from '../../../src/domain/world/document';
import { containsRect, footprint, overlaps } from '../../../src/domain/world/geometry';
import type { Point, Rect } from '../../../src/domain/world/content/v1/types';

const worldId = 'c41ec8ec-0606-47ed-9dcc-87a1c5535ab1';
const seed = 'e66d39d2-9139-49da-8e41-000000000001';
const themes = ['village', 'norse'] as const;
const request = (key: string, count: number) => ({
  key,
  rooms: Array.from({ length: count }, (_, index) => ({ key: `${key}-room-${index}` })),
});

/** Traverse road rectangles, not every tile of a potentially 32k world. */
function connectedRoads(scene: WorldScene): Rect[] {
  const roads = scene.terrain!.roads;
  const connected = roads.filter((road) => containsRect(road, footprint(scene.spawn)));
  const remaining = new Set(roads.filter((road) => !connected.includes(road)));
  for (let index = 0; index < connected.length; index++) {
    const road = connected[index]!;
    for (const other of remaining) {
      // A 32px seam remains wide enough for the real player footprint.
      const width =
        Math.min(road.x + road.width, other.x + other.width) - Math.max(road.x, other.x);
      const height =
        Math.min(road.y + road.height, other.y + other.height) - Math.max(road.y, other.y);
      if (width >= 32 && height >= 32) {
        connected.push(other);
        remaining.delete(other);
      }
    }
  }
  expect(remaining.size).toBe(0);
  return connected;
}

function sweptFeet(from: Point, to: Point): Rect {
  return {
    x: Math.min(from.x, to.x) - 9,
    y: Math.min(from.y, to.y) - 12,
    width: Math.abs(from.x - to.x) + 18,
    height: Math.abs(from.y - to.y) + 12,
  };
}

describe('continuous saved towns', () => {
  it.each(themes)(
    're-packs %s districts deterministically and keeps every channel housed as categories grow',
    (themeId) => {
      const base = generateWorldDocument({ worldId, seed, themeId });
      const original = structuredClone(base);
      const initial = extendTownLayout(null, [request('music', 2), request('games', 16)], seed);
      const saved = JSON.parse(JSON.stringify(initial));
      expect(parseContinuousTownLayout(saved)).toEqual(initial);
      const first = generateContinuousTownDocument(base, initial);
      const firstHouse = first.scenes.overworld.landmarks.find(
        ({ id }) => id === initial.entries[0]!.landmarkId,
      )!;
      expect(
        Math.hypot(
          firstHouse.x - first.scenes.overworld.spawn.x,
          firstHouse.y - first.scenes.overworld.spawn.y,
        ),
      ).toBeLessThanOrEqual(64);
      // Rebuilding from the same channels is stable and ignores private labels.
      expect(extendTownLayout(initial, [request('games', 16), request('music', 2)], seed)).toEqual(
        initial,
      );
      const labeledRequests = [request('games', 16), request('music', 2)].map((group) => ({
        ...group,
        label: 'Private category name',
        rooms: group.rooms.map((room) => ({ ...room, label: 'Private room name', type: 'text' })),
      }));
      expect(extendTownLayout(initial, labeledRequests, seed)).toEqual(initial);
      // Growing re-packs the districts but never drops a channel.
      const grown = extendTownLayout(
        initial,
        [request('games', 28), request('music', 7), request('art', 3)],
        seed,
      );
      const second = generateContinuousTownDocument(base, grown);
      expect(grown.entries).toHaveLength(38);
      expect(grown.entries.every((entry) => entry.landmarkId.startsWith('house:'))).toBe(true);
      expect(new Set(grown.entries.map((entry) => entry.channelKey)).size).toBe(38);
      expect(
        second.scenes.overworld.landmarks.filter(({ id }) => id.startsWith('house:')),
      ).toHaveLength(38);
      expect(
        extendTownLayout(
          grown,
          [request('games', 28), request('music', 7), request('art', 3)],
          seed,
        ),
      ).toEqual(grown);
      expect(first.scenes.dungeon).toEqual(original.scenes.dungeon);
      expect(base).toEqual(original);
      expect(parseWorldDocument(JSON.parse(JSON.stringify(second)))).toEqual(second);
      expect(second.scenes.overworld.npcs).toEqual([]);
      expect(JSON.stringify(second)).not.toContain('games-room-');
    },
  );

  it.each(themes)(
    'connects every %s entrance and portal without road collisions across seeds',
    (themeId) => {
      const base = generateWorldDocument({ worldId, seed, themeId });
      const scenes = ['willow', 'pine', 'oak'].map(
        (layoutSeed) =>
          generateContinuousTownDocument(
            base,
            extendTownLayout(null, [request('one', 25), request('two', 2)], layoutSeed),
          ).scenes.overworld,
      );
      expect(new Set(scenes.map((scene) => JSON.stringify(scene.terrain))).size).toBe(3);
      expect(new Set(scenes.map((scene) => JSON.stringify(scene.landmarks))).size).toBe(3);
      for (const scene of scenes) {
        const roads = connectedRoads(scene);
        for (const road of roads) {
          expect(containsRect(scene.bounds, road)).toBe(true);
          expect([road.x, road.y, road.width, road.height].every((value) => value % 32 === 0)).toBe(
            true,
          );
          expect(scene.colliders.some((box) => overlaps(road, box))).toBe(false);
        }
        for (const target of scene.landmarks) {
          expect(
            scene.colliders.some((box) => overlaps(footprint(target), box)),
            target.id,
          ).toBe(false);
          const road = roads.find((box) => containsRect(box, footprint(target)));
          expect(road, target.id).toBeDefined();
          const center = { x: target.x, y: road!.y + road!.height / 2 };
          expect(
            scene.colliders.some((box) => overlaps(sweptFeet(target, center), box)),
            target.id,
          ).toBe(false);
        }
        expect(scene.landmarks.filter(({ kind }) => kind === 'portal')).toHaveLength(1);
      }
    },
  );

  it.each(themes)(
    'fits 1000 %s homes from 100 categories in one compact saved scene',
    (themeId) => {
      const base = generateWorldDocument({ worldId, seed, themeId });
      const layout = extendTownLayout(
        null,
        Array.from({ length: 100 }, (_, index) => request(`category-${index}`, 10)),
        seed,
      );
      const document = generateContinuousTownDocument(base, layout);
      const scene = document.scenes.overworld;
      expect(scene.landmarks.filter(({ id }) => id.startsWith('house:'))).toHaveLength(1000);
      expect(
        scene.stamps.filter(
          ({ texture, frame }) =>
            (texture === 'lpc-house-hall' && frame === 'main') ||
            [
              'lpc-house-brick',
              'lpc-house-paneled',
              'norse-longhouse',
              'norse-cottage',
              'norse-smithy',
            ].includes(texture),
        ),
      ).toHaveLength(1000);
      expect(scene.bounds.width).toBeLessThanOrEqual(32768);
      expect(scene.bounds.height).toBeLessThanOrEqual(32768);
      expect(scene.stamps.length).toBeLessThan(20000);
      expect(scene.colliders.length).toBeLessThan(10000);
      expect(scene.stamps.some(({ depth }) => depth !== undefined && depth < 0)).toBe(true);
      expect(new TextEncoder().encode(JSON.stringify(document)).byteLength).toBeLessThan(2_000_000);
      expect(new Set(scene.landmarks.map(({ id }) => id)).size).toBe(1003);
      expect(scene.stamps.some(({ id }) => id.startsWith('overworld:road:'))).toBe(false);
      expect(connectedRoads(scene).length).toBeGreaterThan(1000);
    },
    20_000,
  );

  it('creates no district for an empty category and a small one when it gains a channel', () => {
    const base = generateWorldDocument({ worldId, seed, themeId: 'village' });
    const empty = extendTownLayout(null, [request('quiet', 0)], seed);
    const scene = generateContinuousTownDocument(base, empty).scenes.overworld;
    expect(empty.blocks).toHaveLength(0);
    expect(empty.entries).toHaveLength(0);
    expect(scene.stamps.some(({ texture }) => texture.startsWith('lpc-house-'))).toBe(false);
    expect(scene.landmarks.map((l) => l.id).sort()).toEqual([
      'town-hall',
      'town-noticeboard',
      'town-square',
    ]);
    connectedRoads(scene);
    const grown = extendTownLayout(empty, [request('quiet', 1)], seed);
    expect(grown.blocks).toHaveLength(1);
    expect(grown.entries).toHaveLength(1);
    expect(grown.blocks[0]!.plots).toHaveLength(1);
    expect(
      generateContinuousTownDocument(base, extendTownLayout(null, [], seed)).scenes.overworld
        .landmarks,
    ).toHaveLength(3);
  });

  it('re-packs compactly and deterministically when districts are appended', () => {
    const initial = extendTownLayout(null, [request('one', 2)], 'winding-lanes');
    const grown = extendTownLayout(
      initial,
      [request('one', 8), request('two', 4)],
      'winding-lanes',
    );
    expect(initial.blocks[0]!.roads!.length).toBeGreaterThan(0);
    expect(initial.blocks[0]!.roadStyle).toBe(2);
    // The small district is rebuilt bigger for eight channels; nothing is left behind.
    expect(grown.entries).toHaveLength(12);
    expect(grown.blocks.length).toBeGreaterThanOrEqual(2);
    expect(
      extendTownLayout(grown, [request('one', 8), request('two', 4)], 'winding-lanes'),
    ).toEqual(grown);
  });

  it('scatters trees clear of houses and roads', () => {
    const base = generateWorldDocument({ worldId, seed, themeId: 'village' });
    const layout = extendTownLayout(
      null,
      [request('a', 3), request('b', 6), request('c', 2)],
      seed,
    );
    const scene = generateContinuousTownDocument(base, layout).scenes.overworld;
    const trees = scene.stamps.filter(({ texture }) => texture === 'lpc-trees');
    expect(trees.length).toBeGreaterThan(0);
    for (const tree of trees)
      expect(
        scene.terrain!.roads.some((box) =>
          overlaps({ x: tree.x, y: tree.y, width: 32, height: 32 }, box),
        ),
      ).toBe(false);
  });

  it('retains the original geometry path for saved blocks without a road style', () => {
    const legacy = parseContinuousTownLayout({
      version: 1,
      seed,
      blocks: [
        {
          id: 0,
          categoryKey: 'old',
          x: 0,
          y: 0,
          roadY: 448,
          plots: Array.from({ length: 11 }, (_, index) => ({
            x: (6 + (index % 3) * 18) * 32,
            y: (3 + Math.floor(index / 3) * 14) * 32,
            variant: index % 3,
          })),
        },
      ],
      entries: [
        {
          categoryKey: 'old',
          channelKey: 'old-room-0',
          landmarkId: 'house:0',
          blockId: 0,
          plotIndex: 0,
        },
      ],
    });
    const base = generateWorldDocument({ worldId, seed, themeId: 'village' });
    const first = generateContinuousTownDocument(base, legacy);
    expect(first.scenes.overworld.terrain!.roads).toContainEqual({
      x: 64,
      y: 416,
      width: 1888,
      height: 96,
    });
    const next = extendTownLayout(legacy, [request('old', 1), request('new', 2)], seed);
    expect(next.blocks.every((block) => block.width !== undefined)).toBe(true);
    expect(next.entries).toHaveLength(3);
    const second = generateContinuousTownDocument(base, next);
    expect(
      second.scenes.overworld.landmarks.filter(({ id }) => id.startsWith('house:')),
    ).toHaveLength(3);
  });

  it('scales the village with guild size and keeps the chosen scale when saving', () => {
    const base = generateWorldDocument({ worldId, seed, themeId: 'village' });
    const requests = [request('a', 3), request('b', 4)];
    const small = extendTownLayout(null, requests, seed, 100);
    const large = extendTownLayout(null, requests, seed, 20_000);
    expect(small.scale).toBeDefined();
    expect(large.scale! > small.scale!).toBe(true);
    const smallScene = generateContinuousTownDocument(base, small).scenes.overworld;
    const largeScene = generateContinuousTownDocument(base, large).scenes.overworld;
    expect(largeScene.bounds.width > smallScene.bounds.width).toBe(true);
    expect(largeScene.bounds.height > smallScene.bounds.height).toBe(true);
    for (const scene of [smallScene, largeScene])
      expect(scene.landmarks.filter((landmark) => landmark.id.startsWith('house:'))).toHaveLength(
        7,
      );
    expect(parseContinuousTownLayout(JSON.parse(JSON.stringify(small))).scale).toBe(small.scale);
    // An unknown guild size keeps the original village dimensions.
    expect(extendTownLayout(null, requests, seed).scale).toBe(1);
  });

  it('rejects malformed saved layouts and terrain while retaining strict legacy world limits', () => {
    const base = generateWorldDocument({ worldId, seed, themeId: 'village' });
    const layout = extendTownLayout(null, [request('one', 2)], seed);
    const document = generateContinuousTownDocument(base, layout);
    const invalidLayouts = [
      { ...layout, version: 2 },
      { ...layout, entries: [...layout.entries, layout.entries[0]] },
      { ...layout, entries: [{ ...layout.entries[0], blockId: 999 }] },
      { ...layout, blocks: [{ ...layout.blocks[0], x: 32768 }] },
    ];
    for (const value of invalidLayouts) expect(() => parseContinuousTownLayout(value)).toThrow();
    const mutations = [
      (value: typeof document) => {
        value.scenes.overworld.terrain!.roads[0]!.width = 33;
      },
      (value: typeof document) => {
        value.scenes.overworld.terrain!.roads[0]!.x = 32768;
      },
      (value: typeof document) => {
        value.scenes.overworld.terrain!.roads[0] = {
          x: value.scenes.overworld.bounds.width - 32,
          y: 0,
          width: 32,
          height: 32,
        };
      },
      (value: typeof document) => {
        const collider = value.scenes.overworld.colliders[0]!;
        value.scenes.overworld.terrain!.roads[0] = {
          x: Math.floor(collider.x / 32) * 32,
          y: Math.floor(collider.y / 32) * 32,
          width: 32,
          height: 32,
        };
      },
      (value: typeof document) => {
        value.scenes.overworld.textures[0]!.url = 'https://external.test/asset';
      },
      (value: typeof document) => {
        delete value.scenes.overworld.terrain;
      },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(document);
      mutate(value);
      expect(() => parseWorldDocument(value)).toThrow();
    }
    expect(parseWorldDocument(base)).toEqual(base);
    const oversizedLegacy = structuredClone(base);
    oversizedLegacy.scenes.overworld.bounds.width = 3000;
    expect(() => parseWorldDocument(oversizedLegacy)).toThrow();
  });
});
