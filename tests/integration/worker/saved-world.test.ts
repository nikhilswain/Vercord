import { env } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { createWorker } from '../../../worker';
import migration from '../../../migrations/0003_world_instances.sql?raw';
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

const guildId = '100000000000000001';
const sessionSecret = 'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM';

beforeEach(async () => {
  await env.AUTH_DB.exec(
    'CREATE TABLE IF NOT EXISTS worlds (guild_id TEXT PRIMARY KEY,map_slug TEXT UNIQUE,visibility TEXT,created_at INTEGER,updated_at INTEGER,last_synced_at INTEGER)',
  );
  // Exercise the actual production migration, including its uniqueness and document-size constraints.
  for (const statement of migration
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean))
    await env.AUTH_DB.prepare(statement).run();
  await env.AUTH_DB.exec('DELETE FROM world_instances');
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
