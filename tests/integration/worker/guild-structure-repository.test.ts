import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GuildStructureSnapshot } from '../../../src/domain/discord/snapshot';
import {
  createKvGuildStructureRepository,
  guildStructureSnapshotKey,
} from '../../../worker/storage/guild-structure-repository';

const TEST_SLUG = 'task-six-repository-test';
const TEST_KEY = `guild-structure:v1:${TEST_SLUG}`;
const PRIVATE_VALUE = 'PRIVATE_KV_VALUE_MUST_NOT_ESCAPE';
const DIGEST = 'A'.repeat(43);

function validSnapshot(): GuildStructureSnapshot {
  return {
    schemaVersion: 1,
    identifierScheme: 'hmac-sha256-v1',
    generatedAt: '2026-08-28T12:34:56.000Z',
    guild: {
      key: `g_${DIGEST}`,
      displayName: 'Invented repository guild',
      ownerKey: `m_${DIGEST}`,
      everyoneRoleKey: `r_${DIGEST}`,
    },
    roles: [{ key: `r_${DIGEST}`, permissions: '1024' }],
    channels: [
      {
        key: `c_${DIGEST}`,
        kind: 'text',
        discordType: 0,
        label: 'repository-channel',
        parentKey: null,
        order: 0,
        ageRestricted: false,
        overwrites: [],
      },
    ],
  };
}

async function captureError(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error('EXPECTED_OPERATION_TO_FAIL');
}

describe('KV guild structure repository', () => {
  beforeEach(async () => {
    await env.MAP_SNAPSHOTS.delete(TEST_KEY);
  });

  afterEach(async () => {
    await env.MAP_SNAPSHOTS.delete(TEST_KEY);
  });

  it('uses the versioned slug key and distinguishes a missing local KV value', async () => {
    const repository = createKvGuildStructureRepository(env.MAP_SNAPSHOTS);

    await expect(repository.read(TEST_SLUG)).resolves.toEqual({ state: 'missing' });
    expect(guildStructureSnapshotKey(TEST_SLUG)).toBe(TEST_KEY);
  });

  it('writes one complete validated JSON value without options and reads it through validation', async () => {
    const calls: unknown[][] = [];
    const recordingKv = {
      get: env.MAP_SNAPSHOTS.get.bind(env.MAP_SNAPSHOTS),
      put: async (...args: unknown[]) => {
        calls.push(args);
        await Reflect.apply(env.MAP_SNAPSHOTS.put, env.MAP_SNAPSHOTS, args);
      },
    } as unknown as KVNamespace;
    const repository = createKvGuildStructureRepository(recordingKv);
    const snapshot = validSnapshot();

    await repository.write(TEST_SLUG, snapshot);

    expect(calls).toEqual([[TEST_KEY, JSON.stringify(snapshot)]]);
    await expect(env.MAP_SNAPSHOTS.get(TEST_KEY, 'text')).resolves.toBe(JSON.stringify(snapshot));
    await expect(repository.read(TEST_SLUG)).resolves.toEqual({ state: 'valid', snapshot });
  });

  it.each([
    ['malformed JSON', `{${PRIVATE_VALUE}`],
    ['schema-invalid JSON', JSON.stringify({ schemaVersion: 1, private: PRIVATE_VALUE })],
  ])('returns invalid for %s already stored in local KV', async (_case, storedValue) => {
    await env.MAP_SNAPSHOTS.put(TEST_KEY, storedValue);
    const repository = createKvGuildStructureRepository(env.MAP_SNAPSHOTS);

    await expect(repository.read(TEST_SLUG)).resolves.toEqual({ state: 'invalid' });
  });

  it('validates a snapshot before attempting any write', async () => {
    let putCalls = 0;
    const kv = {
      get: env.MAP_SNAPSHOTS.get.bind(env.MAP_SNAPSHOTS),
      put: async () => {
        putCalls += 1;
      },
    } as unknown as KVNamespace;
    const invalid = { ...validSnapshot(), schemaVersion: 2 } as unknown as GuildStructureSnapshot;

    await expect(createKvGuildStructureRepository(kv).write(TEST_SLUG, invalid)).rejects.toThrow(
      'SNAPSHOT_INVALID',
    );
    expect(putCalls).toBe(0);
  });

  it('maps a get outage to a value-free stable read error', async () => {
    const kv = {
      get: async (key: string, mode: string) => {
        expect([key, mode]).toEqual([TEST_KEY, 'text']);
        throw new Error(`upstream get failed: ${PRIVATE_VALUE}`);
      },
      put: env.MAP_SNAPSHOTS.put.bind(env.MAP_SNAPSHOTS),
    } as unknown as KVNamespace;

    const error = await captureError(createKvGuildStructureRepository(kv).read(TEST_SLUG));

    expect(error).toMatchObject({
      name: 'WorkerError',
      message: 'SNAPSHOT_READ_FAILED',
      code: 'SNAPSHOT_READ_FAILED',
    });
    expect(JSON.stringify(error)).toBe('{"code":"SNAPSHOT_READ_FAILED","name":"WorkerError"}');
    expect(String(error)).not.toContain(PRIVATE_VALUE);
  });

  it('maps a put outage to a value-free stable write error after exactly one attempt', async () => {
    const calls: unknown[][] = [];
    const kv = {
      get: env.MAP_SNAPSHOTS.get.bind(env.MAP_SNAPSHOTS),
      put: async (...args: unknown[]) => {
        calls.push(args);
        throw new Error(`upstream put failed: ${PRIVATE_VALUE}`);
      },
    } as unknown as KVNamespace;
    const snapshot = validSnapshot();

    const error = await captureError(
      createKvGuildStructureRepository(kv).write(TEST_SLUG, snapshot),
    );

    expect(calls).toEqual([[TEST_KEY, JSON.stringify(snapshot)]]);
    expect(error).toMatchObject({
      name: 'WorkerError',
      message: 'SNAPSHOT_WRITE_FAILED',
      code: 'SNAPSHOT_WRITE_FAILED',
    });
    expect(JSON.stringify(error)).toBe('{"code":"SNAPSHOT_WRITE_FAILED","name":"WorkerError"}');
    expect(String(error)).not.toContain(PRIVATE_VALUE);
  });
});
