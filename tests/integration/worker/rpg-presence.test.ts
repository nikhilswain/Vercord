import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import {
  RpgPresenceState,
  readRpgPartition,
  rpgPartitionSchema,
} from '../../../worker/presence/rpg-state';

const document = generateWorldDocument({
  worldId: '7401b2e7-12ea-4010-b8b1-b12435612021',
  seed: '0d10f361-27b9-421f-a9b7-4f01a8872f07',
  themeId: 'village',
});
const partition = {
  theme: 'village' as const,
  worldId: document.worldId,
  checksum: 'a'.repeat(64),
  scene: 'overworld' as const,
};

it('validates an explicit complete map partition and preserves legacy absence', () => {
  expect(readRpgPartition(new URLSearchParams())).toBeUndefined();
  expect(readRpgPartition(new URLSearchParams({ theme: 'village' }))).toBeNull();
  expect(readRpgPartition(new URLSearchParams(partition))).toEqual(partition);
  expect(rpgPartitionSchema.safeParse(partition).success).toBe(true);
  expect(rpgPartitionSchema.safeParse({ ...partition, worldId: 'wrong' }).success).toBe(false);
  expect(rpgPartitionSchema.safeParse({ ...partition, scene: 'room:private' }).success).toBe(false);
});

it('restores safe per-member, per-scene positions and theme appearance', async () => {
  await runInDurableObject(env.WORLD_PRESENCE.getByName(crypto.randomUUID()), async (_, state) => {
    const presence = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
    presence.register({ document, checksum: partition.checksum, bindings: [] });
    const first = await presence.restore(partition, 'member-one', 1_000);
    expect(first).toMatchObject({ ...document.scenes.overworld.spawn, appearance: 'rowan' });
    await presence.save(
      'member-one',
      { ...first, appearance: 'ash', appearanceUpdatedAt: 2_000 },
      2_000,
      true,
    );
    const reloaded = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
    reloaded.register({ document, checksum: partition.checksum, bindings: [] });
    expect(await reloaded.restore(partition, 'member-one', 3_000)).toMatchObject({
      ...document.scenes.overworld.spawn,
      appearance: 'ash',
      action: 'idle',
    });
    expect(await reloaded.restore(partition, 'member-two', 3_000)).toMatchObject({
      appearance: 'rowan',
    });
    expect(
      await reloaded.restore({ ...partition, scene: 'dungeon' }, 'member-one', 3_000),
    ).toMatchObject({ ...document.scenes.dungeon.spawn, appearance: 'ash', scene: 'dungeon' });
  });
});

it('accepts bounded movement and corrects unsafe, excessive, and cross-scene positions', async () => {
  await runInDurableObject(env.WORLD_PRESENCE.getByName(crypto.randomUUID()), async (_, state) => {
    const presence = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
    presence.register({ document, checksum: partition.checksum, bindings: [] });
    const first = await presence.restore(partition, 'member-one', 1_000);
    const idle = {
      type: 'rpg-move' as const,
      seq: 0,
      x: first.x,
      y: first.y,
      direction: 'left' as const,
      action: 'idle' as const,
      scene: 'overworld' as const,
    };
    expect(presence.move(first, idle, 1_100).accepted).toBe(true);
    expect(presence.move(first, { ...idle, x: NaN }, 1_100).accepted).toBe(false);
    expect(presence.move(first, { ...idle, x: 0, y: 0 }, 1_100).accepted).toBe(false);
    expect(presence.move(first, { ...idle, x: first.x + 241 }, 1_100).accepted).toBe(false);
    expect(presence.move(first, { ...idle, scene: 'dungeon' }, 1_100).accepted).toBe(false);
  });
});

it('checks the swept feet between safe endpoints and discards unsafe saved progress', async () => {
  await runInDurableObject(env.WORLD_PRESENCE.getByName(crypto.randomUUID()), async (_, state) => {
    const presence = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
    const scene = {
      ...document.scenes.overworld,
      bounds: { x: 0, y: 0, width: 500, height: 500 },
      spawn: { x: 100, y: 100 },
      npcs: [],
      colliders: [{ id: 'wall', x: 130, y: 0, width: 2, height: 500 }],
    };
    presence.register({
      document: { ...document, scenes: { ...document.scenes, overworld: scene } },
      checksum: partition.checksum,
      bindings: [],
    });
    await state.storage.put(`rpgProgress:${partition.worldId}:member-one:overworld`, {
      x: 131,
      y: 100,
      direction: 'left',
      updatedAt: 1,
    });
    const restored = await presence.restore(partition, 'member-one', 1_000);
    expect(restored).toMatchObject({ x: 100, y: 100 });
    expect(
      presence.move(
        restored,
        { x: 160, y: 100, direction: 'right', action: 'walk', scene: 'overworld' },
        1_100,
      ).accepted,
    ).toBe(false);
    expect(
      presence.move(
        restored,
        { x: 100, y: 120, direction: 'down', action: 'walk', scene: 'overworld' },
        1_100,
      ).accepted,
    ).toBe(true);
  });
});

it.each([false, true])(
  'retains the latest world appearance across delayed scene closes (cold=%s)',
  async (cold) => {
    await runInDurableObject(
      env.WORLD_PRESENCE.getByName(crypto.randomUUID()),
      async (_, state) => {
        const create = () => {
          const presence = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
          presence.register({ document, checksum: partition.checksum, bindings: [] });
          return presence;
        };
        let presence = create();
        const old = await presence.restore(partition, 'member-one', 1_000);
        const dungeon = await presence.restore(
          { ...partition, scene: 'dungeon' },
          'member-one',
          1_000,
        );
        await presence.save(
          'member-one',
          { ...dungeon, appearance: 'ash', appearanceUpdatedAt: 2_000 },
          2_000,
          true,
        );
        if (cold) presence = create();
        // Appearance recency is independent from this old scene's latest movement timestamp.
        await presence.save('member-one', { ...old, appearanceUpdatedAt: 1_000 }, 3_000, true);
        expect(await create().restore(partition, 'member-one', 4_000)).toMatchObject({
          appearance: 'ash',
        });
      },
    );
  },
);

it('checks durable progress recency before a cold save and serializes overlapping scene saves', async () => {
  await runInDurableObject(env.WORLD_PRESENCE.getByName(crypto.randomUUID()), async (_, state) => {
    const create = () => {
      const presence = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
      presence.register({ document, checksum: partition.checksum, bindings: [] });
      return presence;
    };
    const first = create();
    const old = await first.restore(partition, 'member-one', 1_000);
    await first.save('member-one', { ...old, x: 200 }, 3_000, true);
    const cold = create();
    await cold.save('member-one', { ...old, x: 100 }, 1_000, true);
    const key = `rpgProgress:${partition.worldId}:member-one:overworld`;
    expect(await state.storage.get(key)).toMatchObject({ x: 200, updatedAt: 3_000 });
    await Promise.all([
      cold.save('member-one', { ...old, x: 210 }, 4_000, true),
      cold.save('member-one', { ...old, x: 110 }, 2_000, true),
    ]);
    expect(await state.storage.get(key)).toMatchObject({ x: 210, updatedAt: 4_000 });
  });
});
