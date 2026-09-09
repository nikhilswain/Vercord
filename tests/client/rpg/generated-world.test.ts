import { describe, expect, it } from 'vitest';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import { parseWorldDocument } from '../../../src/domain/world/document';
import { RpgSimulation, RPG_FEET } from '../../../src/features/rpg/simulation';
import { overlaps } from '../../../src/features/world/engine/collision';
import { appearanceFitsTheme, WORLD_THEMES } from '../../../src/domain/world/catalog/themes';
import { rpgAppearanceSchema } from '../../../src/domain/presence/rpg-protocol';

const worldId = 'c41ec8ec-0606-47ed-9dcc-87a1c5535ab1';
const seeds = Array.from(
  { length: 8 },
  (_, index) => `e66d39d2-9139-49da-8e41-${String(index + 1).padStart(12, '0')}`,
);
const themes = ['village', 'norse'] as const;

describe('saved world generation', () => {
  it('keeps every theme default and selectable character valid for live presence', () => {
    for (const [id, theme] of Object.entries(WORLD_THEMES)) {
      expect(appearanceFitsTheme(theme.defaultAppearance, id as keyof typeof WORLD_THEMES)).toBe(
        true,
      );
      for (const appearance of theme.appearances)
        expect(rpgAppearanceSchema.safeParse(appearance).success).toBe(true);
    }
    expect(appearanceFitsTheme('rowan', 'norse')).toBe(false);
    expect(appearanceFitsTheme('sigrid', 'village')).toBe(false);
    expect(rpgAppearanceSchema.safeParse('unknown-traveler').success).toBe(false);
  });

  it('reproduces complete, independently owned documents including stable object identities', () => {
    const options = { worldId, themeId: 'village' as const, seed: seeds[0]! };
    const first = generateWorldDocument(options);
    const saved = JSON.parse(JSON.stringify(first));
    expect(parseWorldDocument(saved)).toEqual(saved);
    expect(generateWorldDocument(options)).toEqual(first);
    first.scenes.overworld.stamps[0]!.x += 100;
    expect(generateWorldDocument(options)).toEqual(saved);
    for (const scene of Object.values(saved.scenes) as (typeof first.scenes.overworld)[]) {
      const entries = [...scene.stamps, ...scene.colliders, ...scene.lights];
      expect(entries.every((entry) => typeof entry.id === 'string' && entry.id.length > 0)).toBe(
        true,
      );
      expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    }
  });

  it('changes relative landmark placement and connected road geometry across seeds in both themes', () => {
    for (const themeId of themes) {
      const scenes = seeds.map(
        (seed) => generateWorldDocument({ worldId, themeId, seed }).scenes.overworld,
      );
      const placements = scenes.map((scene) =>
        scene.landmarks.map((landmark) => [
          landmark.id,
          landmark.x - scene.spawn.x,
          landmark.y - scene.spawn.y,
        ]),
      );
      const roads = scenes.map((scene) =>
        scene.stamps
          .filter((stamp) => stamp.id.startsWith('overworld:road:'))
          .map(({ x, y }) => [x, y]),
      );
      expect(new Set(placements.map((value) => JSON.stringify(value))).size).toBeGreaterThanOrEqual(
        6,
      );
      expect(new Set(roads.map((value) => JSON.stringify(value))).size).toBeGreaterThanOrEqual(6);
      expect(roads.every((road) => road.length > 100)).toBe(true);
      for (const scene of scenes)
        for (const road of scene.stamps.filter((stamp) => stamp.id.startsWith('overworld:road:'))) {
          expect(
            scene.colliders.some((box) => overlaps({ ...road, width: 32, height: 32 }, box)),
            road.id,
          ).toBe(false);
        }
    }
  });

  it('keeps arrival, every landmark and every NPC safe and reachable with the real player footprint', () => {
    for (const themeId of themes)
      for (const seed of seeds.slice(0, 3)) {
        const document = generateWorldDocument({ worldId, themeId, seed });
        for (const scene of Object.values(document.scenes)) {
          for (const target of [scene.spawn, ...scene.landmarks, ...scene.npcs]) {
            const simulation = new RpgSimulation(scene);
            simulation.navigate(target);
            for (let frame = 0; frame < 650; frame++) {
              simulation.tick(0.05, { x: 0, y: 0, moving: false, sprinting: false });
              const feet = { ...RPG_FEET, x: simulation.player.x - 9, y: simulation.player.y - 12 };
              expect(scene.colliders.some((box) => overlaps(feet, box))).toBe(false);
            }
            expect(
              Math.hypot(simulation.player.x - target.x, simulation.player.y - target.y),
            ).toBeLessThan(48);
            if ('id' in target && typeof target.id === 'string')
              expect(simulation.nearby()?.ui.id, target.id).toBe(target.id);
          }
        }
      }
  }, 30_000);

  it('rejects corrupt versions, asset references, duplicate ids and out-of-bounds geometry', () => {
    const document = generateWorldDocument({ worldId, themeId: 'norse', seed: seeds[0]! });
    const corruptions = [
      (value: typeof document) => {
        value.schemaVersion = 2 as 1;
      },
      (value: typeof document) => {
        value.scenes.overworld.textures[0]!.url = 'https://external.test/asset';
      },
      (value: typeof document) => {
        value.scenes.overworld.stamps[0]!.texture = 'unknown';
      },
      (value: typeof document) => {
        value.scenes.overworld.stamps[0]!.frame = 999999;
      },
      (value: typeof document) => {
        value.scenes.overworld.stamps[1]!.id = value.scenes.overworld.stamps[0]!.id;
      },
      (value: typeof document) => {
        value.scenes.overworld.spawn.x = -100;
      },
      (value: typeof document) => {
        value.scenes.overworld.colliders[0]!.width = Number.POSITIVE_INFINITY;
      },
    ];
    for (const corrupt of corruptions) {
      const value = structuredClone(document);
      corrupt(value);
      expect(() => parseWorldDocument(value)).toThrow();
    }
  });
});
