import { describe, expect, it } from 'vitest';
import { generateHouseInterior, parseHouseInterior } from '../../../src/domain/world/interiors';
import { RpgSimulation } from '../../../src/features/rpg/simulation';
import { footprint, overlaps } from '../../../src/domain/world/geometry';
import { generateHouseInterior as generateLegacy } from '../../../src/domain/world/interiors-v1';
import { presentHouse } from '../../../src/features/rpg/house/presentation';

const input = {
  worldId: 'c41ec8ec-0606-47ed-9dcc-87a1c5535ab1',
  seed: 'house-check',
  landmarkId: 'house:12',
};

describe('furnished house scenes', () => {
  it('keeps the exit and gathering areas reachable around furniture in both themes and every recipe', () => {
    for (const themeId of ['village', 'norse'] as const)
      for (let index = 0; index < 5; index++) {
        const options = {
          ...input,
          landmarkId: `house:${index}`,
          themeId,
          roomType: 'text' as const,
        };
        const house = generateHouseInterior(options);
        expect(generateHouseInterior(options)).toEqual(house);
        const sample = presentHouse(house);
        const simulation = new RpgSimulation(sample);
        expect(
          simulation.setPlayerPosition({
            ...sample.spawn,
            scene: 'house:13',
            direction: 'down',
            action: 'idle',
          }),
        ).toBe(false);
        for (const target of [...sample.landmarks, sample.spawn]) {
          simulation.navigate(target);
          for (let frame = 0; frame < 300; frame++) {
            simulation.tick(0.05, { x: 0, y: 0, moving: false, sprinting: false });
            expect(
              sample.colliders.some((box) => overlaps(footprint(simulation.player), box)),
            ).toBe(false);
          }
          expect(
            Math.hypot(simulation.player.x - target.x, simulation.player.y - target.y),
          ).toBeLessThan(2);
        }
      }
  });

  it('rejects unsafe content instead of replacing an existing room', () => {
    const house = generateHouseInterior({ ...input, themeId: 'village', roomType: 'text' });
    const badTexture = structuredClone(house);
    badTexture.scene.textures[0]!.url = 'https://example.com/foreign.svg';
    expect(() => parseHouseInterior(badTexture)).toThrow();
    const blockedExit = structuredClone(house);
    const exit = house.scene.landmarks[0]!;
    blockedExit.scene.colliders.push({
      id: 'blocked-exit',
      x: exit.x - 64,
      y: exit.y - 16,
      width: 128,
      height: 48,
    });
    expect(() => parseHouseInterior(blockedExit)).toThrow();
    expect(() => parseHouseInterior({ ...house, contentVersion: 'house-v3' })).toThrow();
  });

  it('varies neighboring text-channel houses without rerolling on channel classification changes', () => {
    for (const seed of ['spring', 'summer', 'autumn']) {
      const recipes = new Set<string>();
      for (let index = 0; index < 10; index++) {
        const options = {
          ...input,
          seed,
          landmarkId: `house:${index}`,
          themeId: 'village' as const,
          roomType: 'text' as const,
        };
        const house = generateHouseInterior(options);
        recipes.add(house.recipe);
        expect(generateHouseInterior({ ...options, roomType: 'forum' })).toEqual(house);
        expect(JSON.stringify(house).length).toBeLessThan(120_000);
      }
      expect(recipes.size).toBe(5);
    }
  });

  it('retains the pinned reader for old saved interiors', () => {
    const legacy = generateLegacy({ ...input, themeId: 'village', roomType: 'text' });
    expect(parseHouseInterior(JSON.parse(JSON.stringify(legacy)))).toEqual(legacy);
    expect(presentHouse(legacy).houseInteractions).toBeUndefined();
  });

  it('rejects altered frame crops, foreign animation textures and missing interaction targets', () => {
    const house = generateHouseInterior({ ...input, themeId: 'village', roomType: 'text' });
    const badCrop = structuredClone(house);
    Object.values(badCrop.scene.textures[0]!.frames)[0]!.x++;
    expect(() => parseHouseInterior(badCrop)).toThrow();
    const badAnimation = structuredClone(house);
    badAnimation.animations[0]!.texture = 'untrusted-texture';
    expect(() => parseHouseInterior(badAnimation)).toThrow();
    const badInteraction = structuredClone(house);
    badInteraction.interactions[0]!.id = 'missing-landmark';
    expect(() => parseHouseInterior(badInteraction)).toThrow();
  });

  it('publishes the saved interaction action when the player approaches an object', () => {
    const house = generateHouseInterior({ ...input, themeId: 'village', roomType: 'text' });
    const simulation = new RpgSimulation(presentHouse(house));
    for (const interaction of house.interactions) {
      const point = house.scene.landmarks.find((l) => l.id === interaction.id)!;
      simulation.setPlayerPosition({
        ...point,
        scene: house.landmarkId,
        direction: 'up',
        action: 'idle',
      });
      expect(simulation.nearby()?.ui).toMatchObject({
        id: interaction.id,
        action: interaction.action,
      });
    }
  });
});
