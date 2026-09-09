import { describe, expect, it } from 'vitest';
import { generateHouseInterior, parseHouseInterior } from '../../../src/domain/world/interiors';
import { RpgSimulation } from '../../../src/features/rpg/simulation';
import { footprint, overlaps } from '../../../src/domain/world/geometry';

const input = {
  worldId: 'c41ec8ec-0606-47ed-9dcc-87a1c5535ab1',
  seed: 'house-check',
  landmarkId: 'house:12',
};

describe('furnished house scenes', () => {
  it('keeps the exit and gathering areas reachable around furniture in both themes and every recipe', () => {
    for (const themeId of ['village', 'norse'] as const)
      for (const roomType of ['text', 'voice', 'forum'] as const) {
        const house = generateHouseInterior({ ...input, themeId, roomType });
        expect(generateHouseInterior({ ...input, themeId, roomType })).toEqual(house);
        const sample = { ...house.scene, sceneId: house.landmarkId };
        const simulation = new RpgSimulation(sample);
        expect(
          simulation.setPlayerPosition({
            ...sample.spawn,
            scene: 'house:13',
            direction: 'down',
            action: 'idle',
          }),
        ).toBe(false);
        for (const target of [{ x: 96, y: 432 }, { x: 672, y: 432 }, sample.landmarks[0]!]) {
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
    blockedExit.scene.colliders.push({
      id: 'blocked-exit',
      x: 320,
      y: 560,
      width: 128,
      height: 48,
    });
    expect(() => parseHouseInterior(blockedExit)).toThrow();
    expect(() => parseHouseInterior({ ...house, contentVersion: 'house-v2' })).toThrow();
  });
});
