import { env } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { createWorker } from '../../../worker';
import migration from '../../../migrations/0003_world_instances.sql?raw';
import townMigration from '../../../migrations/0004_world_neighborhoods.sql?raw';
import continuousMigration from '../../../migrations/0005_continuous_towns.sql?raw';
import compressedMigration from '../../../migrations/0006_compressed_town_documents.sql?raw';
import authMigration from '../../../migrations/0001_auth.sql?raw';
import { createD1AuthRepository } from '../../../worker/auth/repository';
import { encryptSessionValue, hashOpaqueToken } from '../../../worker/auth/crypto';
import { decodeBase64UrlSecret } from '../../../worker/config/runtime';
import { createD1WorldRepository } from '../../../worker/worlds/repository';
import { WorldInstanceStore, worldDocumentChecksum } from '../../../worker/worlds/instance-store';
import { createWorldInstanceRepository } from '../../../worker/worlds/instance-repository';
import { projectWorldBindings } from '../../../worker/worlds/bindings';
import type { MapSnapshot } from '../../../src/domain/map/snapshot';
import { savedWorldResponseSchema } from '../../../src/domain/world/protocol';
import { TownStore } from '../../../worker/worlds/town-store';
import { ContinuousTownStore } from '../../../worker/worlds/continuous-town-store';
import { createContinuousTownRepository } from '../../../worker/worlds/continuous-town-repository';

const guildId = '100000000000000001';
const sessionSecret = 'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM';

beforeEach(async () => {
  await env.AUTH_DB.exec(
    'CREATE TABLE IF NOT EXISTS worlds (guild_id TEXT PRIMARY KEY,map_slug TEXT UNIQUE,visibility TEXT,created_at INTEGER,updated_at INTEGER,last_synced_at INTEGER)',
  );
  // Exercise the actual production migration, including its uniqueness and document-size constraints.
  for (const statement of (migration + '\n' + townMigration + '\n' + continuousMigration)
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean))
    await env.AUTH_DB.prepare(statement).run();
  const columns = await env.AUTH_DB.prepare('PRAGMA table_info(world_towns)').all<{
    name: string;
  }>();
  if (!columns.results.some((column) => column.name === 'document_gzip'))
    await env.AUTH_DB.prepare(compressedMigration).run();
  await env.AUTH_DB.exec(
    'DELETE FROM world_towns; DELETE FROM world_channel_addresses; DELETE FROM world_streets; DELETE FROM world_instances',
  );
  await createD1WorldRepository(env.AUTH_DB).recordSync(guildId, 'saved-world-test', 0);
});

it('requires a member session before opening a saved server world', async () => {
  const response = await createWorker().fetch!(
    new Request('https://dmap.test/api/auth/guilds/100000000000000001/rpg/village', {
      method: 'POST',
      headers: { origin: 'https://dmap.test' },
    }),
    env,
    {} as ExecutionContext,
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: { code: 'UNAUTHENTICATED' } });
});

it.each(['denied', 'allowed'] as const)(
  'honors %s membership and validates the signed player response',
  async (access) => {
    for (const statement of authMigration
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean))
      await env.AUTH_DB.prepare(statement).run();
    const token = 't'.repeat(43);
    const encrypted = await encryptSessionValue(
      'invented-access-token',
      decodeBase64UrlSecret(sessionSecret),
    );
    const now = Math.floor(Date.now() / 1_000);
    await createD1AuthRepository(env.AUTH_DB).deleteSession(await hashOpaqueToken(token));
    await createD1AuthRepository(env.AUTH_DB).createSession({
      idHash: await hashOpaqueToken(token),
      userId: '300000000000000003',
      username: 'invented',
      displayName: ' Invented traveler ',
      avatarHash: null,
      accessTokenCiphertext: encrypted.ciphertext,
      accessTokenIv: encrypted.iv,
      refreshTokenCiphertext: null,
      refreshTokenIv: null,
      tokenType: 'Bearer',
      scope: 'identify',
      tokenExpiresAt: now + 3600,
      sessionExpiresAt: now + 3600,
      createdAt: now,
      lastSeenAt: now,
    });
    const response = await createWorker().fetch!(
      new Request(`https://dmap.test/api/auth/guilds/${guildId}/rpg/norse`, {
        method: 'POST',
        headers: { origin: 'https://dmap.test', cookie: `__Host-dmap_session=${token}` },
      }),
      {
        ...env,
        DISCORD_CLIENT_ID: '100000000000000002',
        DISCORD_CLIENT_SECRET: 'invented-client-secret-not-real',
        AUTH_SESSION_SECRET: sessionSecret,
        WORLD_PRESENCE: {
          getByName: () => ({
            fetch: async () =>
              access === 'denied'
                ? Response.json({ error: { code: 'GUILD_MEMBERSHIP_REQUIRED' } }, { status: 403 })
                : Response.json({
                    ...(await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'norse')),
                    server: { displayName: 'Test guild' },
                    bindings: [],
                  }),
          }),
        } as unknown as Env['WORLD_PRESENCE'],
      },
      {} as ExecutionContext,
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    if (access === 'denied') {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: { code: 'GUILD_MEMBERSHIP_REQUIRED' } });
      expect(
        await env.AUTH_DB.prepare('SELECT COUNT(*) AS total FROM world_instances').first('total'),
      ).toBe(0);
    } else {
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(savedWorldResponseSchema.safeParse(payload).success).toBe(true);
      expect(payload).toMatchObject({ player: { displayName: 'Invented traveler' } });
    }
  },
);

it('commits one complete map across concurrent creators and reuses it after Discord sync', async () => {
  const visits = await Promise.all(
    Array.from({ length: 5 }, () => new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village')),
  );
  const first = visits[0]!;
  expect(new Set(visits.map((value) => value.document.worldId)).size).toBe(1);
  expect(new Set(visits.map((value) => value.checksum)).size).toBe(1);
  expect(
    await env.AUTH_DB.prepare('SELECT COUNT(*) AS total FROM world_instances').first('total'),
  ).toBe(1);
  await createD1WorldRepository(env.AUTH_DB).recordSync(guildId, 'saved-world-test', 99);
  expect(await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village')).toEqual(first);

  const norse = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'norse');
  expect(norse.document.worldId).not.toBe(first.document.worldId);
  expect(norse.document.themeId).toBe('norse');
  expect(await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village')).toEqual(first);
});

it('resumes an interrupted reservation with its original identity and seed', async () => {
  const repository = createWorldInstanceRepository(env.AUTH_DB);
  const seed = '403651c1-a109-41b0-8565-d7da9405bc0f';
  const worldId = '8cbb91f1-c740-43f0-a649-6eac728cccd8';
  await repository.reserve({
    world_id: worldId,
    guild_id: guildId,
    theme_id: 'norse',
    seed,
    schema_version: 1,
    generator_version: 1,
    content_version: 'rpg-v1',
    geometry_revision: 1,
    created_at: 123,
  });
  const saved = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'norse');
  expect(saved.document.seed).toBe(seed);
  expect(saved.document.worldId).toBe(worldId);
  expect(saved.createdAt).toBe(123);
});

it('loads stored output exactly and never overwrites corrupt or unsupported completed saves', async () => {
  const original = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village');
  const document = structuredClone(original.document);
  document.scenes.overworld.subtitle = 'A saved change that no generator can reproduce';
  const json = JSON.stringify(document);
  const checksum = await worldDocumentChecksum(json);
  await env.AUTH_DB.prepare(
    'UPDATE world_instances SET document_json = ?, checksum = ? WHERE guild_id = ?',
  )
    .bind(json, checksum, guildId)
    .run();
  expect((await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village')).document).toEqual(
    document,
  );

  await env.AUTH_DB.prepare("UPDATE world_instances SET checksum = 'corrupt' WHERE guild_id = ?")
    .bind(guildId)
    .run();
  await expect(new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village')).rejects.toMatchObject({
    code: 'WORLD_SAVE_INVALID',
  });
  expect(
    await env.AUTH_DB.prepare('SELECT document_json FROM world_instances WHERE guild_id = ?')
      .bind(guildId)
      .first('document_json'),
  ).toBe(json);

  await env.AUTH_DB.prepare('UPDATE world_instances SET generator_version = 99 WHERE guild_id = ?')
    .bind(guildId)
    .run();
  await expect(new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village')).rejects.toMatchObject({
    code: 'WORLD_VERSION_UNSUPPORTED',
  });
  expect(
    await env.AUTH_DB.prepare('SELECT checksum FROM world_instances WHERE guild_id = ?')
      .bind(guildId)
      .first('checksum'),
  ).toBe('corrupt');
});

it('projects only authorized channel bindings without changing geometry or other anchors', async () => {
  const saved = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'norse');
  const before = JSON.stringify(saved.document);
  const snapshot: MapSnapshot = {
    schemaVersion: 1,
    slug: 'saved-world-test',
    generatedAt: new Date().toISOString(),
    server: { displayName: 'Example server' },
    areas: [
      {
        key: 'a_common',
        label: 'Common',
        order: 0,
        rooms: [
          { key: 'c_common', label: 'campfire', type: 'text', order: 0 },
          { key: 'c_private', label: 'private-room', type: 'voice', order: 1 },
        ],
      },
    ],
  };
  const first = projectWorldBindings(saved.document, snapshot);
  const filtered = structuredClone(snapshot);
  filtered.areas[0]!.rooms.pop();
  filtered.areas[0]!.rooms[0]!.label = 'renamed-campfire';
  const second = projectWorldBindings(saved.document, filtered);
  expect(second.flatMap((anchor) => anchor.rooms).map((room) => room.key)).toEqual(['c_common']);
  expect(second.find((anchor) => anchor.rooms.length)?.landmarkId).toBe(
    first.find((anchor) => anchor.rooms.some((room) => room.key === 'c_common'))?.landmarkId,
  );
  expect(JSON.stringify(saved.document)).toBe(before);
});

function townSnapshot(count = 8): MapSnapshot {
  return {
    schemaVersion: 1,
    slug: 'saved-world-test',
    generatedAt: new Date().toISOString(),
    server: { displayName: 'Bramblewatch' },
    areas: [
      {
        key: 'a_common',
        label: 'Around the hearth',
        order: 0,
        rooms: Array.from({ length: count }, (_, index) => ({
          key: `c_room_${index}`,
          label: `gathering-${index}`,
          type: index % 2 ? 'voice' : 'text',
          order: index,
        })),
      },
    ],
  };
}

it('concurrent town visits allocate unique permanent houses and save only the active street', async () => {
  const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village');
  const snapshot = townSnapshot(14);
  const visits = await Promise.all(
    Array.from({ length: 4 }, async () =>
      (await new TownStore(env.AUTH_DB).prepare(square, snapshot)).project(snapshot),
    ),
  );
  expect(new Set(visits.map((visit) => visit.checksum)).size).toBe(1);
  expect(
    visits.every((visit) => JSON.stringify(visit.town) === JSON.stringify(visits[0]!.town)),
  ).toBe(true);
  const district = visits[0]!.town.districts[0]!;
  expect(district.streets.map((street) => street.rooms.length)).toEqual([6, 6, 2]);
  expect(
    visits[0]!.document.scenes.overworld.landmarks.filter((landmark) =>
      landmark.id.startsWith('house:'),
    ),
  ).toHaveLength(6);
  expect(
    await env.AUTH_DB.prepare(
      'SELECT COUNT(*) AS count FROM world_streets WHERE document_json IS NOT NULL',
    ).first('count'),
  ).toBe(1);
  expect(
    await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM world_channel_addresses').first(
      'count',
    ),
  ).toBe(14);
  expect((await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village')).checksum).toBe(
    square.checksum,
  );
});

it('keeps house and street coordinates through rename, reorder, channel additions and theme separation', async () => {
  const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'norse');
  const snapshot = townSnapshot();
  const store = new TownStore(env.AUTH_DB);
  const first = (await store.prepare(square, snapshot)).project(snapshot);
  const home = first.town.districts[0]!.streets[0]!.rooms[0]!;
  const changed = townSnapshot(15);
  changed.areas[0]!.label = 'Hearth & harbour';
  changed.areas[0]!.rooms[0]!.label = 'renamed-港';
  changed.areas[0]!.rooms.reverse();
  changed.areas[0]!.rooms.forEach((room, index) => (room.order = index));
  const second = (
    await new TownStore(env.AUTH_DB).prepare(square, changed, first.town.activeStreetId!)
  ).project(changed);
  expect(second.checksum).toBe(first.checksum);
  expect(second.document).toEqual(first.document);
  expect(second.town.districts[0]!.label).toBe('Hearth & harbour');
  const sameHome = second.bindings
    .flatMap((binding) =>
      binding.rooms.map((room) => ({ ...room, landmarkId: binding.landmarkId })),
    )
    .find((room) => room.key === home.key)!;
  expect(sameHome.landmarkId).toBe(home.landmarkId);
  expect(sameHome.label).toBe('renamed-港');
  expect(JSON.stringify(second.document)).not.toContain('renamed-港');
  const village = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village');
  await expect(store.prepare(village, snapshot, first.town.activeStreetId!)).rejects.toMatchObject({
    status: 403,
  });
});

it('projects fresh category/channel permissions and refuses a street after its last visible room is revoked', async () => {
  const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village');
  const full = townSnapshot();
  full.areas[0]!.rooms[1]!.label = 'private-staff-room';
  const store = new TownStore(env.AUTH_DB);
  const prepared = await store.prepare(square, full);
  const all = prepared.project(full);
  const filtered = structuredClone(full);
  filtered.areas[0]!.rooms = [filtered.areas[0]!.rooms[0]!];
  const visible = prepared.project(filtered);
  expect(visible.document).toEqual(all.document);
  expect(JSON.stringify(visible)).not.toContain('private-staff-room');
  expect(JSON.stringify(visible)).not.toContain('c_room_1');
  expect(visible.town.districts[0]!.streets).toHaveLength(1);
  expect(visible.bindings).toHaveLength(1);
  await expect(
    store.prepare(square, filtered, all.town.districts[0]!.streets[1]!.id),
  ).rejects.toMatchObject({ status: 403 });
  expect(() => prepared.project({ ...filtered, areas: [] })).toThrow();
});

it('saves overflow streets once and does not overwrite a corrupt saved street', async () => {
  const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village');
  const snapshot = townSnapshot();
  const store = new TownStore(env.AUTH_DB);
  const first = (await store.prepare(square, snapshot)).project(snapshot);
  const streetId = first.town.districts[0]!.streets[1]!.id;
  const next = (await store.prepare(square, snapshot, streetId)).project(snapshot);
  expect(next.town.activeStreetId).toBe(streetId);
  expect(next.checksum).not.toBe(first.checksum);
  expect(next.bindings).toHaveLength(2);
  expect(
    (await new TownStore(env.AUTH_DB).prepare(square, snapshot, streetId)).project(snapshot)
      .document,
  ).toEqual(next.document);
  await env.AUTH_DB.prepare("UPDATE world_streets SET checksum = 'corrupt' WHERE street_id = ?")
    .bind(streetId)
    .run();
  await expect(store.prepare(square, snapshot, streetId)).rejects.toMatchObject({
    code: 'WORLD_SAVE_INVALID',
  });
  expect(
    await env.AUTH_DB.prepare('SELECT checksum FROM world_streets WHERE street_id = ?')
      .bind(streetId)
      .first('checksum'),
  ).toBe('corrupt');
});

it('retains the original square for empty guilds and explicit square travel', async () => {
  const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village');
  const store = new TownStore(env.AUTH_DB);
  for (const snapshot of [townSnapshot(0), townSnapshot()]) {
    const view = (await store.prepare(square, snapshot, 'square')).project(snapshot);
    expect(view.town.activeStreetId).toBeNull();
    expect(view.checksum).toBe(square.checksum);
    expect(view.document).toEqual(square.document);
  }
  const empty = townSnapshot(0);
  expect((await store.prepare(square, empty)).project(empty).town.activeStreetId).toBeNull();
});

it('retains category-specific addresses when a channel moves away and back', async () => {
  const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village');
  const snapshot = townSnapshot(1);
  const store = new TownStore(env.AUTH_DB);
  const first = (await store.prepare(square, snapshot)).project(snapshot);
  const moved = structuredClone(snapshot);
  moved.areas[0]!.key = 'a_garden';
  moved.areas[0]!.label = 'Garden';
  const second = (await store.prepare(square, moved)).project(moved);
  expect(second.town.activeStreetId).not.toBe(first.town.activeStreetId);
  expect(second.town.districts[0]!.label).toBe('Garden');
  const restored = (await store.prepare(square, snapshot)).project(snapshot);
  expect(restored.town).toEqual(first.town);
  expect(restored.document).toEqual(first.document);
  expect(
    await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM world_channel_addresses').first(
      'count',
    ),
  ).toBe(2);
});

it('supports the full directory limit with bounded SQL batches and one generated street', async () => {
  const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village');
  const snapshot = townSnapshot(0);
  snapshot.areas = Array.from({ length: 100 }, (_, area) => ({
    key: `a_${area}`,
    label: `Neighborhood ${area}`,
    order: area,
    rooms: Array.from({ length: 10 }, (_, room) => ({
      key: `c_${area}_${room}`,
      label: `channel-${area}-${room}`,
      type: 'text' as const,
      order: room,
    })),
  }));
  const view = (await new TownStore(env.AUTH_DB).prepare(square, snapshot)).project(snapshot);
  expect(view.town.districts).toHaveLength(100);
  expect(
    view.town.districts.flatMap((district) => district.streets.flatMap((street) => street.rooms)),
  ).toHaveLength(1000);
  expect(
    savedWorldResponseSchema.safeParse({
      ...view,
      player: { displayName: 'Traveler', memberKey: `m_${'a'.repeat(43)}` },
    }).success,
  ).toBe(true);
  expect(
    await env.AUTH_DB.prepare(
      'SELECT COUNT(*) AS count FROM world_streets WHERE document_json IS NOT NULL',
    ).first('count'),
  ).toBe(1);
});

it.each(['village', 'norse'] as const)(
  'saves every channel in one continuous %s town and keeps old homes fixed',
  async (theme) => {
    const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, theme);
    const snapshot = townSnapshot(17);
    snapshot.areas.push({
      key: 'a_voice',
      label: 'Voice gardens',
      order: 1,
      rooms: [{ key: 'c_lounge', label: 'Evening lounge', type: 'voice', order: 0 }],
    });
    const store = new ContinuousTownStore(env.AUTH_DB);
    const first = (await store.prepare(square, snapshot)).project(snapshot);
    expect(first.town.continuous).toBe(true);
    expect(first.town.activeStreetId).toBeNull();
    expect(first.bindings).toHaveLength(18);
    expect(
      first.document.scenes.overworld.landmarks.filter((point) => point.id.startsWith('house:')),
    ).toHaveLength(18);
    expect(
      savedWorldResponseSchema.safeParse({
        ...first,
        player: { displayName: 'Traveler', memberKey: `m_${'a'.repeat(43)}` },
      }).success,
    ).toBe(true);
    const renamed = structuredClone(snapshot);
    renamed.areas[0]!.rooms.reverse();
    renamed.areas[0]!.rooms[0]!.label = 'Renamed gathering';
    const reload = (await new ContinuousTownStore(env.AUTH_DB).prepare(square, renamed)).project(
      renamed,
    );
    expect(reload.document).toEqual(first.document);
    expect(reload.checksum).toBe(first.checksum);
    const expanded = structuredClone(snapshot);
    expanded.areas[0]!.rooms.push({ key: 'c_new', label: 'New home', type: 'text', order: 18 });
    const next = (await store.prepare(square, expanded)).project(expanded);
    expect(next.bindings).toHaveLength(19);
    for (const old of first.document.scenes.overworld.landmarks.filter((point) =>
      point.id.startsWith('house:'),
    ))
      expect(next.document.scenes.overworld.landmarks.find((point) => point.id === old.id)).toEqual(
        old,
      );
    expect((await new WorldInstanceStore(env.AUTH_DB).load(guildId, theme)).checksum).toBe(
      square.checksum,
    );
  },
);

it('continuous towns project fresh permissions and preserve corrupt saves without replacing them', async () => {
  const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village');
  const snapshot = townSnapshot(9);
  snapshot.areas[0]!.rooms[8]!.label = 'Private planning';
  const store = new ContinuousTownStore(env.AUTH_DB);
  const prepared = await store.prepare(square, snapshot);
  const restricted = structuredClone(snapshot);
  restricted.areas[0]!.rooms = restricted.areas[0]!.rooms.slice(0, 1);
  const visible = prepared.project(restricted);
  expect(visible.bindings).toHaveLength(1);
  expect(JSON.stringify(visible)).not.toContain('Private planning');
  expect(JSON.stringify(visible)).not.toContain('c_room_8');
  expect(prepared.project({ ...snapshot, areas: [] }).bindings).toHaveLength(0);
  const oldStreetId = visible.town.districts[0]!.streets[0]!.id;
  expect((await store.prepare(square, restricted, oldStreetId)).project(restricted).checksum).toBe(
    visible.checksum,
  );
  await env.AUTH_DB.prepare("UPDATE world_towns SET checksum = 'corrupt' WHERE world_id = ?")
    .bind(square.document.worldId)
    .run();
  await expect(store.prepare(square, snapshot)).rejects.toMatchObject({
    code: 'WORLD_SAVE_INVALID',
  });
  expect(
    await env.AUTH_DB.prepare('SELECT checksum FROM world_towns WHERE world_id = ?')
      .bind(square.document.worldId)
      .first('checksum'),
  ).toBe('corrupt');
});

it('concurrent continuous town saves merge discovered channels without losing earlier houses', async () => {
  const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village');
  const left = townSnapshot(1),
    right = townSnapshot(1);
  right.areas[0]!.rooms[0]!.key = 'c_other';
  await Promise.all(
    [left, right].map(async (snapshot) =>
      (await new ContinuousTownStore(env.AUTH_DB).prepare(square, snapshot)).project(snapshot),
    ),
  );
  const combined = structuredClone(left);
  combined.areas[0]!.rooms.push(right.areas[0]!.rooms[0]!);
  const final = (await new ContinuousTownStore(env.AUTH_DB).prepare(square, combined)).project(
    combined,
  );
  expect(final.bindings).toHaveLength(2);
  expect(
    final.document.scenes.overworld.landmarks.filter((point) => point.id.startsWith('house:')),
  ).toHaveLength(2);
  expect(new Set(final.bindings.map((binding) => binding.landmarkId)).size).toBe(2);
  expect(
    await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM world_towns').first('count'),
  ).toBe(1);
});

it.each(['village', 'norse'] as const)(
  'stores and reloads a skewed 1000-channel %s town within the D1 row limit',
  async (theme) => {
    const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, theme);
    const snapshot = townSnapshot(0);
    snapshot.areas = Array.from({ length: 100 }, (_, index) => ({
      key: `a_category_${index}`,
      label: `Neighborhood ${index}`,
      order: index,
      rooms: Array.from({ length: index === 0 ? 901 : 1 }, (_, room) => ({
        key: `c_room_${index}_${room}`,
        label: `Channel ${index} ${room}`,
        type: 'text' as const,
        order: room,
      })),
    }));
    const first = (await new ContinuousTownStore(env.AUTH_DB).prepare(square, snapshot)).project(
      snapshot,
    );
    expect(first.bindings).toHaveLength(1000);
    expect(
      first.document.scenes.overworld.landmarks.filter((landmark) =>
        landmark.id.startsWith('house:'),
      ),
    ).toHaveLength(1000);
    // Keep the storage boundary exercised when generator art/terrain becomes more compact.
    // Descriptions are valid saved scene data; 1000 longer place descriptions exceed D1's row limit.
    const large = structuredClone(first.document);
    for (const landmark of large.scenes.overworld.landmarks)
      landmark.description = 'A remembered place along the village paths. '.repeat(48);
    const json = JSON.stringify(large);
    expect(new TextEncoder().encode(json).byteLength).toBeGreaterThan(2_000_000);
    const repository = createContinuousTownRepository(env.AUTH_DB);
    const row = (await repository.read(square.document.worldId))!;
    const checksum = await worldDocumentChecksum(json);
    expect(
      await repository.save(
        { ...row, document_json: json, checksum, revision: row.revision + 1 },
        row.revision,
      ),
    ).toBe(true);
    const stored = await env.AUTH_DB.prepare(
      'SELECT length(CAST(document_json AS BLOB)) + length(CAST(layout_json AS BLOB)) + length(document_gzip) AS bytes FROM world_towns WHERE world_id = ?',
    )
      .bind(square.document.worldId)
      .first<{ bytes: number }>();
    expect(stored!.bytes).toBeLessThan(1_900_000);
    const reloaded = (await new ContinuousTownStore(env.AUTH_DB).prepare(square, snapshot)).project(
      snapshot,
    );
    expect(reloaded.document).toEqual(large);
    expect(reloaded.checksum).toBe(checksum);
  },
  30_000,
);

it('reads legacy JSON towns exactly and compresses their next revision', async () => {
  const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village');
  const snapshot = townSnapshot(1);
  const first = (await new ContinuousTownStore(env.AUTH_DB).prepare(square, snapshot)).project(
    snapshot,
  );
  const legacyDocument = structuredClone(first.document);
  legacyDocument.scenes.overworld.subtitle = 'A preserved legacy scene';
  const json = JSON.stringify(legacyDocument);
  const checksum = await worldDocumentChecksum(json);
  await env.AUTH_DB.prepare(
    'UPDATE world_towns SET document_json = ?, document_gzip = NULL, checksum = ? WHERE world_id = ?',
  )
    .bind(json, checksum, square.document.worldId)
    .run();
  const reloaded = (await new ContinuousTownStore(env.AUTH_DB).prepare(square, snapshot)).project(
    snapshot,
  );
  expect(reloaded.document).toEqual(legacyDocument);
  expect(reloaded.checksum).toBe(checksum);
  expect(
    await env.AUTH_DB.prepare('SELECT document_gzip FROM world_towns WHERE world_id = ?')
      .bind(square.document.worldId)
      .first('document_gzip'),
  ).toBeNull();
  const grown = townSnapshot(2);
  const next = (await new ContinuousTownStore(env.AUTH_DB).prepare(square, grown)).project(grown);
  expect(next.bindings).toHaveLength(2);
  expect(
    await env.AUTH_DB.prepare(
      'SELECT document_json, length(document_gzip) AS compressed_bytes FROM world_towns WHERE world_id = ?',
    )
      .bind(square.document.worldId)
      .first(),
  ).toMatchObject({ document_json: 'gzip:v1', compressed_bytes: expect.any(Number) });
  expect(
    (await new ContinuousTownStore(env.AUTH_DB).prepare(square, grown)).project(grown).document,
  ).toEqual(next.document);
});

it('rejects damaged and oversized compressed towns without overwriting the saved revision', async () => {
  const square = await new WorldInstanceStore(env.AUTH_DB).load(guildId, 'village');
  const snapshot = townSnapshot(1);
  const first = (await new ContinuousTownStore(env.AUTH_DB).prepare(square, snapshot)).project(
    snapshot,
  );
  await env.AUTH_DB.prepare('UPDATE world_towns SET document_gzip = ? WHERE world_id = ?')
    .bind(new Uint8Array([0]).buffer, square.document.worldId)
    .run();
  await expect(
    new ContinuousTownStore(env.AUTH_DB).prepare(square, snapshot),
  ).rejects.toMatchObject({ code: 'WORLD_SAVE_INVALID' });
  expect(
    await env.AUTH_DB.prepare(
      'SELECT revision, checksum, length(document_gzip) AS compressed_bytes FROM world_towns WHERE world_id = ?',
    )
      .bind(square.document.worldId)
      .first(),
  ).toEqual({ revision: 1, checksum: first.checksum, compressed_bytes: 1 });
  const oversized = await new Response(
    new Response(' '.repeat(8_000_001)).body!.pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer();
  await env.AUTH_DB.prepare('UPDATE world_towns SET document_gzip = ? WHERE world_id = ?')
    .bind(oversized, square.document.worldId)
    .run();
  await expect(
    createContinuousTownRepository(env.AUTH_DB).read(square.document.worldId),
  ).rejects.toMatchObject({ code: 'WORLD_SAVE_INVALID' });
  expect(
    await env.AUTH_DB.prepare('SELECT revision FROM world_towns WHERE world_id = ?')
      .bind(square.document.worldId)
      .first('revision'),
  ).toBe(1);
});
