import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import {
  extendTownLayout,
  generateContinuousTownDocument,
} from '../../../src/domain/world/continuous-town';
import { HouseInteriorStore } from '../../../worker/worlds/house-store';
import { worldDocumentChecksum } from '../../../worker/worlds/instance-store';
import { RpgPresenceState, type RpgPartition } from '../../../worker/presence/rpg-state';
import { RpgCollisionMap } from '../../../worker/presence/rpg-geometry';

const square = generateWorldDocument({
  worldId: '167dcf1c-7782-4f1a-9ce4-71f19de323ef',
  seed: '89eb866b-0753-468e-9613-34ac4bd3cffa',
  themeId: 'village',
});
const document = generateContinuousTownDocument(
  square,
  extendTownLayout(
    null,
    [
      {
        key: 'a_test',
        rooms: [{ key: 'c_first' }, { key: 'c_second' }],
      },
    ],
    square.seed,
  ),
);
const key = `houseInterior:${document.worldId}:house:0`;

it('saves a house once across concurrent visits, cold reloads, and town extensions', async () => {
  await runInDurableObject(env.WORLD_PRESENCE.getByName(crypto.randomUUID()), async (_, state) => {
    const store = new HouseInteriorStore(state.storage);
    const [first, second] = await Promise.all([
      store.load(document, 'house:0', 'text'),
      store.load(document, 'house:0', 'text'),
    ]);
    expect(second).toEqual(first);
    const envelope = await state.storage.get(key);
    // Later channel classification and unrelated town growth never reroll a saved interior.
    const cold = await new HouseInteriorStore(state.storage).load(
      { ...document, seed: crypto.randomUUID() },
      'house:0',
      'forum',
    );
    expect(cold).toEqual(first);
    expect(await state.storage.get(key)).toEqual(envelope);
    const otherHouse = await store.load(document, 'house:1', 'voice');
    expect(otherHouse.landmarkId).toBe('house:1');
    expect(otherHouse.scene).not.toEqual(first.scene);
    const otherWorld = await store.load(
      { ...document, worldId: crypto.randomUUID() },
      'house:0',
      'text',
    );
    expect(otherWorld.worldId).not.toBe(first.worldId);
    expect(await state.storage.list({ prefix: 'houseInterior:' })).toHaveLength(3);
  });
});

it.each(['checksum', 'version', 'identity'] as const)(
  'fails closed without replacing a saved house with a corrupt %s',
  async (damage) => {
    await runInDurableObject(
      env.WORLD_PRESENCE.getByName(crypto.randomUUID()),
      async (_, state) => {
        const store = new HouseInteriorStore(state.storage);
        await store.load(document, 'house:0', 'text');
        const envelope = (await state.storage.get<{
          version: number;
          json: string;
          checksum: string;
        }>(key))!;
        if (damage === 'checksum') envelope.checksum = '0'.repeat(64);
        if (damage === 'version') envelope.version = 2;
        if (damage === 'identity') {
          envelope.json = JSON.stringify({ ...JSON.parse(envelope.json), landmarkId: 'house:1' });
          envelope.checksum = await worldDocumentChecksum(envelope.json);
        }
        await state.storage.put(key, envelope);
        await expect(
          new HouseInteriorStore(state.storage).load(document, 'house:0', 'text'),
        ).rejects.toMatchObject({
          code: damage === 'version' ? 'WORLD_VERSION_UNSUPPORTED' : 'WORLD_SAVE_INVALID',
        });
        expect(await state.storage.get(key)).toEqual(envelope);
      },
    );
  },
);

it('uses saved house collision geometry, exact room identity, and independent outside progress', async () => {
  await runInDurableObject(env.WORLD_PRESENCE.getByName(crypto.randomUUID()), async (_, state) => {
    const interior = await new HouseInteriorStore(state.storage).load(document, 'house:0', 'text');
    const partition: RpgPartition = {
      worldId: document.worldId,
      checksum: 'a'.repeat(64),
      theme: 'village',
      scene: 'overworld',
    };
    const roomKey = `c_${'a'.repeat(43)}`;
    const otherRoom = `c_${'b'.repeat(43)}`;
    const create = () => {
      const stateManager = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
      stateManager.register({
        document,
        checksum: partition.checksum,
        interior,
        bindings: [
          { landmarkId: 'house:0', rooms: [{ key: roomKey, label: 'General', type: 'text' }] },
          { landmarkId: 'house:1', rooms: [{ key: otherRoom, label: 'Other', type: 'text' }] },
        ],
      });
      return stateManager;
    };
    const presence = create();
    const outside = await presence.restore(partition, 'member-one', 1_000);
    const door = document.scenes.overworld.landmarks.find((landmark) => landmark.id === 'house:0')!;
    const outsidePosition = { x: door.x, y: door.y + 8 };
    expect(new RpgCollisionMap(document.scenes.overworld).safe(outsidePosition)).toBe(true);
    await presence.save(
      'member-one',
      { ...outside, ...outsidePosition, direction: 'left' },
      2_000,
      true,
    );
    const house = { ...partition, scene: 'house:0' as const };
    const inside = await presence.restore(house, 'member-one', 3_000);
    // A cold, delayed close from the earlier outdoor scene cannot replace the return anchor.
    await create().save('member-one', outside, 2_000, true);
    expect(inside).toMatchObject({ ...interior.scene.spawn, scene: 'house:0' });
    expect(presence.canUseRoom(inside, roomKey)).toBe(true);
    expect(presence.canUseRoom(inside, otherRoom)).toBe(false);
    expect(presence.canOccupyScene(house, [otherRoom])).toBe(false);
    expect(presence.canOccupyScene(house, [roomKey])).toBe(true);
    expect(presence.move(inside, { ...inside, x: 0, y: 0 }, 3_100).accepted).toBe(false);
    expect(presence.move(inside, { ...inside, scene: 'overworld' }, 3_100).accepted).toBe(false);
    const moved = presence.move(
      inside,
      { ...inside, y: inside.y - 8, direction: 'up', action: 'walk' },
      3_100,
    );
    expect(moved.accepted).toBe(true);
    await presence.save('member-one', moved.next, 3_100, true);
    expect(await create().restore(house, 'member-one', 4_000)).toMatchObject({
      x: moved.next.x,
      y: moved.next.y,
    });
    expect(await create().restore(partition, 'member-one', 4_000)).toMatchObject({
      ...outsidePosition,
      direction: 'left',
    });
    expect(await create().restore(house, 'member-two', 4_000)).toMatchObject(interior.scene.spawn);
  });
});
