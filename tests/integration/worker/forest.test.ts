import { env, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { generateWorldDocument } from '../../../src/domain/world/generate';
import { buildForestLayout, townForestEntrance } from '../../../src/domain/world/forest/layout';
import { ForestStore } from '../../../worker/worlds/forest-store';
import { RpgPresenceState, sameRpgPartition } from '../../../worker/presence/rpg-state';
import { buildForestAreaLayout } from '../../../src/domain/world/forest/temple';
import { forestSceneId, type ForestAreaId } from '../../../src/domain/world/forest/catalog';

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

it('pins forest identity once without changing a town and rejects corrupt saved identity', async () => {
  await runInDurableObject(env.WORLD_PRESENCE.getByName(crypto.randomUUID()), async (_, state) => {
    const store = new ForestStore(state.storage),
      before = JSON.stringify(document);
    const first = await store.load(document, 'verge');
    expect(await new ForestStore(state.storage).load(document, 'moonmere')).toEqual({
      ...first,
      region: 'moonmere',
    });
    expect(JSON.stringify(document)).toBe(before);
    await state.storage.put(`forest:${document.worldId}`, { ...first, contentVersion: 'broken' });
    await expect(store.load(document, 'verge')).rejects.toThrow();
    expect(
      (await state.storage.get<{ contentVersion: string }>(`forest:${document.worldId}`))
        ?.contentVersion,
    ).toBe('broken');
  });
});

it('admits neighboring forest regions at their connecting trail and returns to town after hibernation', async () => {
  await runInDurableObject(env.WORLD_PRESENCE.getByName(crypto.randomUUID()), async (_, state) => {
    const store = new ForestStore(state.storage);
    const verge = await store.load(document, 'verge'),
      alder = await store.load(document, 'alder-run');
    const create = () => new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
    const presence = create();
    presence.register({ document, checksum: partition.checksum, bindings: [], forest: verge });
    await presence.restore(partition, 'one', 1000);
    const vp = { ...partition, scene: 'forest:verge' as const };
    const arrival = await presence.restore(vp, 'one', 2000);
    const townExit = buildForestLayout(document.seed, 'verge').portals.find(
      (p) => p.target === 'town',
    )!;
    expect(arrival).toMatchObject({ x: townExit.x, y: townExit.y + 24 });
    presence.register({ document, checksum: partition.checksum, bindings: [], forest: alder });
    const ap = { ...partition, scene: 'forest:alder-run' as const };
    const next = await presence.restore(ap, 'one', 3000);
    const vergeExit = buildForestLayout(document.seed, 'alder-run').portals.find(
      (p) => p.target === 'verge',
    )!;
    expect(next).toMatchObject({ x: vergeExit.x, y: vergeExit.y + 24 });
    expect(sameRpgPartition(vp, ap)).toBe(false);
    expect(
      presence.move(
        arrival,
        {
          x: arrival.x,
          y: arrival.y,
          scene: 'forest:alder-run',
          action: 'idle',
          direction: 'down',
        },
        3100,
      ).accepted,
    ).toBe(false);
    await presence.restore(vp, 'one', 4000);
    const cold = create();
    cold.register({ document, checksum: partition.checksum, bindings: [] });
    expect(await cold.restore(partition, 'one', 5000)).toMatchObject(
      townForestEntrance(document.scenes.overworld),
    );
    expect(await cold.restore(partition, 'two', 5000)).toMatchObject(
      document.scenes.overworld.spawn,
    );
  });
});

it('restores a safe same-region position without resetting it on reconnect', async () => {
  await runInDurableObject(env.WORLD_PRESENCE.getByName(crypto.randomUUID()), async (_, state) => {
    const forest = await new ForestStore(state.storage).load(document, 'verge');
    const camp = buildForestLayout(document.seed, 'verge').camp;
    const fp = { ...partition, scene: 'forest:verge' as const };
    const create = () => {
      const p = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
      p.register({ document, checksum: partition.checksum, bindings: [], forest });
      return p;
    };
    const presence = create(),
      first = await presence.restore(fp, 'one', 1000);
    await presence.save('one', { ...first, ...camp }, 2000, true);
    expect(await create().restore(fp, 'one', 3000)).toMatchObject(camp);
    expect(await create().restore(fp, 'two', 3000)).not.toMatchObject(camp);
  });
});

it('admits the temple, sanctuary and return passages with matching geometry after hibernation', async () => {
  await runInDurableObject(env.WORLD_PRESENCE.getByName(crypto.randomUUID()), async (_, state) => {
    const store = new ForestStore(state.storage);
    let from: ForestAreaId | undefined;
    for (const [index, area] of (
      ['rootbound-reach', 'temple', 'temple-interior', 'temple', 'rootbound-reach'] as const
    ).entries()) {
      // Re-create presence each time, as after a durable-object hibernation.
      const presence = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
      const forest = await store.load(document, area);
      presence.register({ document, checksum: partition.checksum, bindings: [], forest });
      const scene = forestSceneId(area),
        now = 1000 * (index + 1);
      const admitted = await presence.restore({ ...partition, scene }, 'temple-traveler', now);
      const layout = buildForestAreaLayout(document.seed, area);
      const portal = layout.portals.find((p) => p.target === from);
      expect(admitted).toMatchObject(
        portal ? { x: portal.x, y: portal.y + 24 } : layout.scene.spawn,
      );
      expect(
        presence.move(
          admitted,
          { x: admitted.x, y: admitted.y, scene, action: 'idle', direction: 'down' },
          now + 100,
        ).accepted,
      ).toBe(true);
      expect(
        presence.move(
          admitted,
          { x: admitted.x, y: admitted.y, scene: 'overworld', action: 'idle', direction: 'down' },
          now + 200,
        ).accepted,
      ).toBe(false);
      from = area;
    }
  });
});
