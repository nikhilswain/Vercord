import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import {
  generateContinuousTownDocument,
  extendTownLayout,
} from '../../../src/domain/world/continuous-town';
import { buildTownHall } from '../../../src/domain/world/content/town-hall-v1/scene';
import { RpgSimulation } from '../../../src/features/rpg/simulation';
import type { RpgMovement } from '../../../src/domain/presence/rpg-protocol';
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

it('admits a separate shared hall with safe town/cellar returns and authoritative furniture collisions', async () => {
  await runInDurableObject(env.WORLD_PRESENCE.getByName(crypto.randomUUID()), async (_, state) => {
    const presence = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
    presence.register({ document, checksum: partition.checksum, bindings: [] });
    expect(presence.has({ ...partition, scene: 'town-hall' })).toBe(false);
    const townPartition = { ...partition, checksum: 'b'.repeat(64) };
    const inside = { ...townPartition, scene: 'town-hall' as const };
    const town = generateContinuousTownDocument(
      document,
      extendTownLayout(null, [], document.seed),
    );
    presence.register({ document: town, checksum: townPartition.checksum, bindings: [] });
    expect(presence.has(inside)).toBe(true);
    const room = buildTownHall('village').scene;
    await presence.restore(townPartition, 'visitor', 1000);
    const entered = await presence.restore(inside, 'visitor', 2000);
    expect(entered).toMatchObject({ ...room.spawn, scene: 'town-hall' });
    expect(presence.move(entered, { ...entered, y: entered.y - 20 }, 2100).accepted).toBe(true);
    expect(presence.move(entered, { ...entered, scene: 'overworld' }, 2100).accepted).toBe(false);
    // A short move through a bench is rejected just as a town wall would be.
    const nearBench = { ...entered, x: 180, y: 646 };
    expect(presence.move(nearBench, { ...nearBench, y: 688 }, 2400).accepted).toBe(false);
    expect(await presence.restore(inside, 'friend', 2500)).toMatchObject(room.spawn);
    await presence.restore({ ...townPartition, scene: 'dungeon' }, 'visitor', 3000);
    const cellar = room.landmarks.find((l) => l.id === 'hall:cellar')!;
    expect(await presence.restore(inside, 'visitor', 4000)).toMatchObject({
      x: cellar.x,
      y: cellar.y + 36,
    });
    const porch = town.scenes.overworld.landmarks.find((l) => l.id === 'town-hall')!;
    expect(await presence.restore(townPartition, 'visitor', 5000)).toMatchObject({
      x: porch.x,
      y: porch.y + 32,
    });
  });
});

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

it('validates every sampled corner and charges the travelled path instead of its shortcut', async () => {
  await runInDurableObject(env.WORLD_PRESENCE.getByName(crypto.randomUUID()), async (_, state) => {
    const presence = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
    presence.register({
      document: {
        ...document,
        scenes: {
          ...document.scenes,
          overworld: {
            ...document.scenes.overworld,
            bounds: { x: 0, y: 0, width: 500, height: 500 },
            spawn: { x: 112, y: 118 },
            npcs: [],
            colliders: [{ id: 'corner', x: 125, y: 112, width: 50, height: 50 }],
          },
        },
      },
      checksum: partition.checksum,
      bindings: [],
    });
    const first = await presence.restore(partition, 'member-one', 1_000);
    const move = {
      x: 132,
      y: 102,
      scene: 'overworld' as const,
      direction: 'right' as const,
      action: 'run' as const,
      via: [{ x: 112, y: 102 }],
    };
    // The endpoint chord crosses the expanded corner; the real 36px L-shaped path is safe.
    expect(presence.move(first, { ...move, via: undefined }, 1_100).accepted).toBe(false);
    const accepted = presence.move(first, move, 1_100);
    expect(accepted.accepted).toBe(true);
    expect(accepted.next.budget).toBe(60);
    expect(presence.move({ ...first, budget: 30, budgetAt: 1_100 }, move, 1_100).accepted).toBe(
      false,
    );
    expect(presence.move(first, { ...move, via: [{ x: 132, y: 118 }] }, 1_100).accepted).toBe(
      false,
    );
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

it.each([1, 1.25])(
  'keeps auto-run at %sx in sync through corners and bunched 100ms packets',
  async (speed) => {
    await runInDurableObject(
      env.WORLD_PRESENCE.getByName(crypto.randomUUID()),
      async (_, state) => {
        const presence = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
        const scene = {
          ...document.scenes.overworld,
          bounds: { x: 0, y: 0, width: 500, height: 500 },
          spawn: { x: 112, y: 118 },
          npcs: [],
          terrain: undefined,
          colliders: [{ id: 'corner', x: 125, y: 112, width: 50, height: 50 }],
        };
        presence.register({
          document: { ...document, scenes: { ...document.scenes, overworld: scene } },
          checksum: partition.checksum,
          bindings: [],
        });
        let server = await presence.restore(partition, 'member-one', 1_000);
        const simulation = new RpgSimulation(scene);
        simulation.speedMultiplier = speed;
        simulation.setPlayerPosition(server);
        const destinations = [
          { x: 124, y: 110 },
          { x: 188, y: 110 },
          { x: 188, y: 180 },
          { x: 112, y: 180 },
          scene.spawn,
        ];
        const queue: Array<{ at: number; movement: RpgMovement }> = [];
        let destination = 0;
        let arrivedAt = 0;
        let obsoleteChordRejections = 0;
        const deliver = () => {
          const packet = queue.shift()!;
          if (!presence.move(server, { ...packet.movement, via: undefined }, packet.at).accepted)
            obsoleteChordRejections++;
          const result = presence.move(server, packet.movement, packet.at);
          expect(result.accepted).toBe(true);
          server = result.next;
        };
        simulation.navigate(destinations[destination]!);
        for (let frame = 1; frame <= 2_400; frame++) {
          if (
            simulation.player.x === destinations[destination]!.x &&
            simulation.player.y === destinations[destination]!.y
          ) {
            destination = (destination + 1) % destinations.length;
            simulation.navigate(destinations[destination]!);
          }
          simulation.tick(1 / 60, { x: 0, y: 0, moving: false, sprinting: false });
          const now = 1_000 + (frame * 1_000) / 60;
          if (frame % 6 === 0) {
            // WebSockets preserve order but scheduling/network latency can batch several messages.
            arrivedAt = Math.max(arrivedAt, now + 80 + [0, 120, 30, 70, 0][(frame / 6) % 5]!);
            queue.push({
              at: arrivedAt,
              movement: {
                ...simulation.player,
                direction: simulation.direction,
                action: simulation.action,
                scene: 'overworld',
                via: simulation.takeMovementPath(),
              },
            });
          }
          while (queue[0] && queue[0].at <= now) deliver();
        }
        while (queue.length) deliver();
        expect(obsoleteChordRejections).toBeGreaterThan(0);
        expect(server.x).toBe(simulation.player.x);
        expect(server.y).toBe(simulation.player.y);
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
