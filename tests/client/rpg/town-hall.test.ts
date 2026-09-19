import { expect, it } from 'vitest';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import {
  extendTownLayout,
  generateContinuousTownDocument,
} from '../../../src/domain/world/continuous-town';
import { hasTownHall, withTownHall } from '../../../src/domain/world/town-hall';
import { parseWorldDocument } from '../../../src/domain/world/document';

it('upgrades the civic plot once while retaining every channel house and the vault route', () => {
  const seed = 'e66d39d2-9139-49da-8e41-000000000001';
  const base = generateWorldDocument({
    worldId: 'c41ec8ec-0606-47ed-9dcc-87a1c5535ab1',
    seed,
    themeId: 'village',
  });
  const current = generateContinuousTownDocument(
    base,
    extendTownLayout(null, [{ key: 'room', rooms: [{ key: 'one' }, { key: 'two' }] }], seed),
  );
  const legacy = structuredClone(current),
    scene = legacy.scenes.overworld;
  const hall = scene.landmarks.find((l) => l.id === 'town-hall')!;
  scene.stamps.forEach((s) => {
    s.id = s.id.replace('town-hall-v2:', 'town-hall-v1:');
  });
  scene.colliders.forEach((s) => {
    s.id = s.id.replace('town-hall-v2:', 'town-hall-v1:');
  });
  hall.kind = 'view';
  delete hall.destination;
  scene.landmarks.push({
    id: 'town-vault',
    name: 'Lantern Vault',
    description: 'Old exterior cellar stairs.',
    kind: 'portal',
    destination: 'dungeon',
    radius: 40,
    x: hall.x + 144,
    y: hall.y - 4,
  });
  scene.stamps.push({
    id: 'overworld:town-hall-v1:old-stair',
    texture: 'lpc-stairs',
    frame: 'down',
    x: hall.x + 128,
    y: hall.y - 80,
    depth: -25,
  });
  scene.terrain!.roads.push({ x: hall.x + 128, y: hall.y - 16, width: 32, height: 160 });
  parseWorldDocument(legacy);
  const before = structuredClone(legacy);
  const upgraded = withTownHall(legacy);
  expect(legacy).toEqual(before);
  expect(parseWorldDocument(upgraded)).toEqual(upgraded);
  expect(hasTownHall(upgraded)).toBe(true);
  expect(withTownHall(upgraded)).toBe(upgraded);
  expect(upgraded.scenes.overworld.landmarks.some((l) => l.id === 'town-vault')).toBe(false);
  expect(upgraded.scenes.overworld.stamps.some((s) => s.id.includes('old-stair'))).toBe(false);
  expect(upgraded.scenes.overworld.landmarks.find((l) => l.id === 'town-hall')).toMatchObject({
    kind: 'portal',
    destination: 'town-hall',
  });
  expect(upgraded.scenes.dungeon).toEqual(before.scenes.dungeon);
  for (const collection of ['stamps', 'colliders', 'landmarks'] as const) {
    const houses = (entries: (typeof scene)[typeof collection]) =>
      entries.filter((e) => e.id.includes('house:'));
    expect(houses(upgraded.scenes.overworld[collection])).toEqual(
      houses(before.scenes.overworld[collection]),
    );
  }
});
