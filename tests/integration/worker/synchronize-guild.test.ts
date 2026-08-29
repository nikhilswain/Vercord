import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createIdentifierFactory,
  type IdentifierFactory,
} from '../../../src/domain/discord/identifiers';
import { normalizeGuildStructure } from '../../../src/domain/discord/normalize';
import type { GuildStructureSnapshot } from '../../../src/domain/discord/snapshot';
import type { DiscordSourceBundle } from '../../../src/domain/discord/source';
import { createValidatedDiscordSourceFixture, TEST_IDS } from '../../fixtures/discord/guild-source';
import { WorkerError } from '../../../worker/errors';
import { createConsoleSafeLogger, type SafeLogger } from '../../../worker/logging/safe-logger';
import type {
  GuildStructureRepository,
  SnapshotReadResult,
} from '../../../worker/storage/guild-structure-repository';
import { createSingleFlight } from '../../../worker/sync/single-flight';
import { synchronizeGuild, type SyncPorts } from '../../../worker/sync/synchronize-guild';

vi.mock('../../../src/domain/discord/normalize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/domain/discord/normalize')>();
  return { ...actual, normalizeGuildStructure: vi.fn(actual.normalizeGuildStructure) };
});

const CONFIG = { guildId: TEST_IDS.guild, mapSlug: 'task-six-sync-test' };
const GENERATED_AT = '2026-08-28T12:34:56.000Z';
const PRIVATE_SECRET = 'PRIVATE_SYNC_SECRET_MUST_NOT_ESCAPE';
const DIGESTS = ['A', 'B', 'C', 'D', 'E'].map((letter) => letter.repeat(43));

function snapshotWithKinds(
  ...kinds: Array<'category' | 'text' | 'unsupported'>
): GuildStructureSnapshot {
  const categoryIndex = kinds.indexOf('category');
  let rootOrder = 0;
  let childOrder = 0;
  return {
    schemaVersion: 1,
    identifierScheme: 'hmac-sha256-v1',
    generatedAt: GENERATED_AT,
    guild: {
      key: `g_${DIGESTS[0]}`,
      displayName: 'Private snapshot guild name',
      ownerKey: `m_${DIGESTS[1]}`,
      everyoneRoleKey: `r_${DIGESTS[2]}`,
    },
    roles: [{ key: `r_${DIGESTS[2]}`, permissions: '1024' }],
    channels: kinds.map((kind, index) => {
      const isChild = kind !== 'category' && categoryIndex >= 0 && index > categoryIndex;
      return {
        key: `c_${DIGESTS[index]}`,
        kind,
        discordType: kind === 'category' ? 4 : kind === 'text' ? 0 : 14,
        label: `Private ${kind} ${index}`,
        parentKey: isChild ? `c_${DIGESTS[categoryIndex]}` : null,
        order: isChild ? childOrder++ : rootOrder++,
        ageRestricted: false,
        overwrites: [],
      };
    }),
  };
}

interface Harness {
  ports: SyncPorts;
  source: DiscordSourceBundle;
  identifiers: IdentifierFactory;
  fetch: ReturnType<typeof vi.fn<(guildId: string) => Promise<DiscordSourceBundle>>>;
  read: ReturnType<typeof vi.fn<(slug: string) => Promise<SnapshotReadResult>>>;
  write: ReturnType<
    typeof vi.fn<(slug: string, snapshot: GuildStructureSnapshot) => Promise<void>>
  >;
  now: ReturnType<typeof vi.fn<() => Date>>;
  info: ReturnType<typeof vi.fn<SafeLogger['info']>>;
  error: ReturnType<typeof vi.fn<SafeLogger['error']>>;
}

async function createHarness(
  previous: SnapshotReadResult = { state: 'missing' },
): Promise<Harness> {
  const source = createValidatedDiscordSourceFixture();
  const identifiers = await createIdentifierFactory(new Uint8Array(32).fill(7));
  const fetch = vi
    .fn<(guildId: string) => Promise<DiscordSourceBundle>>()
    .mockResolvedValue(source);
  const read = vi.fn<(slug: string) => Promise<SnapshotReadResult>>().mockResolvedValue(previous);
  const write = vi
    .fn<(slug: string, snapshot: GuildStructureSnapshot) => Promise<void>>()
    .mockResolvedValue(undefined);
  const now = vi.fn(() => new Date(GENERATED_AT));
  const info = vi.fn<SafeLogger['info']>();
  const error = vi.fn<SafeLogger['error']>();
  return {
    source,
    identifiers,
    fetch,
    read,
    write,
    now,
    info,
    error,
    ports: {
      discord: { fetchGuildSource: fetch },
      snapshots: { read, write } as GuildStructureRepository,
      identifiers,
      now,
      logger: { info, error },
    },
  };
}

async function captureError(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error('EXPECTED_OPERATION_TO_FAIL');
}

function expectOnlySafeLogFields(fields: unknown, expectedOutcome: string): void {
  expect(fields).toEqual({
    correlationId: expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
    outcome: expectedOutcome,
    durationMs: expect.any(Number),
    ...(expectedOutcome === 'SNAPSHOT_STORED' ? { categoryCount: 2, channelCount: 5 } : {}),
  });
  expect((fields as { durationMs: number }).durationMs).toBeGreaterThanOrEqual(0);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('guild synchronization orchestration', () => {
  it('fetches, normalizes, reads, and writes once in order and returns only the safe summary', async () => {
    const harness = await createHarness();

    const summary = await synchronizeGuild(CONFIG, harness.ports);

    expect(harness.fetch).toHaveBeenCalledOnce();
    expect(harness.fetch).toHaveBeenCalledWith(TEST_IDS.guild);
    expect(normalizeGuildStructure).toHaveBeenCalledOnce();
    expect(normalizeGuildStructure).toHaveBeenCalledWith(harness.source, {
      generatedAt: GENERATED_AT,
      identifiers: harness.identifiers,
    });
    expect(harness.read).toHaveBeenCalledOnce();
    expect(harness.read).toHaveBeenCalledWith(CONFIG.mapSlug);
    expect(harness.write).toHaveBeenCalledOnce();
    expect(harness.write).toHaveBeenCalledWith(CONFIG.mapSlug, expect.any(Object));
    expect(harness.fetch.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(normalizeGuildStructure).mock.invocationCallOrder[0]!,
    );
    expect(vi.mocked(normalizeGuildStructure).mock.invocationCallOrder[0]).toBeLessThan(
      harness.read.mock.invocationCallOrder[0]!,
    );
    expect(harness.read.mock.invocationCallOrder[0]).toBeLessThan(
      harness.write.mock.invocationCallOrder[0]!,
    );
    expect(summary).toEqual({
      status: 'SNAPSHOT_STORED',
      schemaVersion: 1,
      generatedAt: GENERATED_AT,
      categoryCount: 2,
      channelCount: 5,
    });
    expect(Object.keys(summary).sort()).toEqual(
      ['categoryCount', 'channelCount', 'generatedAt', 'schemaVersion', 'status'].sort(),
    );
  });

  it('uses exactly one injected Date and passes its ISO timestamp to normalization and storage', async () => {
    const harness = await createHarness();

    const summary = await synchronizeGuild(CONFIG, harness.ports);

    expect(harness.now).toHaveBeenCalledOnce();
    expect(summary.generatedAt).toBe(GENERATED_AT);
    expect(vi.mocked(normalizeGuildStructure).mock.calls[0]?.[1].generatedAt).toBe(GENERATED_AT);
    expect(harness.write.mock.calls[0]?.[1].generatedAt).toBe(GENERATED_AT);
  });

  it('revalidates fetched source relationships before normalization or storage access', async () => {
    const harness = await createHarness();
    harness.fetch.mockResolvedValue({
      ...harness.source,
      guild: { ...harness.source.guild, id: '100000000000000099' },
    });

    const error = await captureError(synchronizeGuild(CONFIG, harness.ports));

    expect(error).toMatchObject({ code: 'DISCORD_SOURCE_INVALID' });
    expect(normalizeGuildStructure).not.toHaveBeenCalled();
    expect(harness.read).not.toHaveBeenCalled();
    expect(harness.write).not.toHaveBeenCalled();
  });

  it('revalidates normalizer output before reading or mutating storage', async () => {
    const harness = await createHarness();
    vi.mocked(normalizeGuildStructure).mockResolvedValueOnce({
      ...snapshotWithKinds('text'),
      schemaVersion: 2,
    } as unknown as GuildStructureSnapshot);

    const error = await captureError(synchronizeGuild(CONFIG, harness.ports));

    expect(error).toMatchObject({ code: 'SNAPSHOT_INVALID' });
    expect(harness.read).not.toHaveBeenCalled();
    expect(harness.write).not.toHaveBeenCalled();
  });

  it('counts only categories as categories and every non-category, including unsupported, as channels', async () => {
    const harness = await createHarness();
    const snapshot = snapshotWithKinds('category', 'text', 'unsupported');
    vi.mocked(normalizeGuildStructure).mockResolvedValueOnce(snapshot);

    const summary = await synchronizeGuild(CONFIG, harness.ports);

    expect(snapshot.channels.map(({ kind }) => kind)).toEqual(['category', 'text', 'unsupported']);
    expect(summary).toMatchObject({ categoryCount: 1, channelCount: 2 });
  });
});

describe('last-known-good decisions', () => {
  it('stores a valid empty snapshot on the first synchronization', async () => {
    const harness = await createHarness({ state: 'missing' });
    const empty = snapshotWithKinds();
    vi.mocked(normalizeGuildStructure).mockResolvedValueOnce(empty);

    await expect(synchronizeGuild(CONFIG, harness.ports)).resolves.toMatchObject({
      categoryCount: 0,
      channelCount: 0,
    });
    expect(harness.write).toHaveBeenCalledOnce();
    expect(harness.write).toHaveBeenCalledWith(CONFIG.mapSlug, empty);
  });

  it('preserves a previous non-empty snapshot when a refresh is empty', async () => {
    const previous = snapshotWithKinds('text');
    const harness = await createHarness({ state: 'valid', snapshot: previous });
    vi.mocked(normalizeGuildStructure).mockResolvedValueOnce(snapshotWithKinds());

    const error = await captureError(synchronizeGuild(CONFIG, harness.ports));

    expect(error).toMatchObject({ code: 'SUSPICIOUS_EMPTY_SNAPSHOT' });
    expect(harness.read).toHaveBeenCalledOnce();
    expect(harness.write).not.toHaveBeenCalled();
  });

  it('replaces a previous valid empty snapshot with a new valid empty snapshot', async () => {
    const previous = snapshotWithKinds();
    const next = snapshotWithKinds();
    const harness = await createHarness({ state: 'valid', snapshot: previous });
    vi.mocked(normalizeGuildStructure).mockResolvedValueOnce(next);

    await synchronizeGuild(CONFIG, harness.ports);

    expect(harness.write).toHaveBeenCalledOnce();
    expect(harness.write).toHaveBeenCalledWith(CONFIG.mapSlug, next);
  });

  it('replaces invalid prior content with a valid non-empty snapshot', async () => {
    const next = snapshotWithKinds('text');
    const harness = await createHarness({ state: 'invalid' });
    vi.mocked(normalizeGuildStructure).mockResolvedValueOnce(next);

    await synchronizeGuild(CONFIG, harness.ports);

    expect(harness.write).toHaveBeenCalledOnce();
    expect(harness.write).toHaveBeenCalledWith(CONFIG.mapSlug, next);
  });

  it('preserves unknown invalid prior content when a refresh is ambiguously empty', async () => {
    const harness = await createHarness({ state: 'invalid' });
    vi.mocked(normalizeGuildStructure).mockResolvedValueOnce(snapshotWithKinds());

    const error = await captureError(synchronizeGuild(CONFIG, harness.ports));

    expect(error).toMatchObject({ code: 'SUSPICIOUS_EMPTY_SNAPSHOT' });
    expect(harness.write).not.toHaveBeenCalled();
  });
});

describe('failure boundaries and safe logging', () => {
  it.each([
    ['Discord fetch', 'fetch'],
    ['normalization', 'normalize'],
    ['repository read', 'read'],
    ['repository write', 'write'],
  ] as const)(
    '%s failure preserves the same stable error and invokes no later mutation',
    async (_case, stage) => {
      const harness = await createHarness();
      const failure = new WorkerError(
        stage === 'read'
          ? 'SNAPSHOT_READ_FAILED'
          : stage === 'write'
            ? 'SNAPSHOT_WRITE_FAILED'
            : 'DISCORD_UNAVAILABLE',
      );
      if (stage === 'fetch') harness.fetch.mockRejectedValue(failure);
      if (stage === 'normalize') vi.mocked(normalizeGuildStructure).mockRejectedValueOnce(failure);
      if (stage === 'read') harness.read.mockRejectedValue(failure);
      if (stage === 'write') harness.write.mockRejectedValue(failure);

      const received = await captureError(synchronizeGuild(CONFIG, harness.ports));

      expect(received).toBe(failure);
      if (stage === 'fetch' || stage === 'normalize') expect(harness.read).not.toHaveBeenCalled();
      if (stage !== 'write') expect(harness.write).not.toHaveBeenCalled();
      else expect(harness.write).toHaveBeenCalledOnce();
    },
  );

  it('emits exactly one allowlisted success log with safe counts', async () => {
    const harness = await createHarness();

    await synchronizeGuild(CONFIG, harness.ports);

    expect(harness.info).toHaveBeenCalledOnce();
    expect(harness.error).not.toHaveBeenCalled();
    expect(harness.info.mock.calls[0]?.[0]).toBe('discord_sync_complete');
    expectOnlySafeLogFields(harness.info.mock.calls[0]?.[1], 'SNAPSHOT_STORED');
  });

  it('emits exactly one allowlisted failure log and preserves an unknown upstream error', async () => {
    const harness = await createHarness();
    const upstream = new Error(
      `${PRIVATE_SECRET} ${TEST_IDS.guild} ${TEST_IDS.publicText} 1024 private-upstream-message`,
    );
    harness.fetch.mockRejectedValue(upstream);

    const received = await captureError(synchronizeGuild(CONFIG, harness.ports));

    expect(received).toBe(upstream);
    expect(harness.info).not.toHaveBeenCalled();
    expect(harness.error).toHaveBeenCalledOnce();
    expect(harness.error.mock.calls[0]?.[0]).toBe('discord_sync_failed');
    expectOnlySafeLogFields(harness.error.mock.calls[0]?.[1], 'SYNC_FAILED');
    const serialized = JSON.stringify(harness.error.mock.calls);
    for (const forbidden of [
      PRIVATE_SECRET,
      TEST_IDS.guild,
      TEST_IDS.publicText,
      '1024',
      'private-upstream-message',
      'Invented Test Guild',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('logs a stable failure code without allowing logger failure to replace the original error', async () => {
    const harness = await createHarness();
    const failure = new WorkerError('SNAPSHOT_READ_FAILED');
    harness.read.mockRejectedValue(failure);
    harness.error.mockImplementation(() => {
      throw new Error(`logger failed: ${PRIVATE_SECRET}`);
    });

    const received = await captureError(synchronizeGuild(CONFIG, harness.ports));

    expect(received).toBe(failure);
    expect(harness.error).toHaveBeenCalledWith('discord_sync_failed', {
      correlationId: expect.any(String),
      outcome: 'SNAPSHOT_READ_FAILED',
      durationMs: expect.any(Number),
    });
  });
});

describe('safe console logger', () => {
  it('serializes only allowlisted fields even when an untyped caller supplies private context', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createConsoleSafeLogger();
    const unsafeFields = {
      correlationId: 'safe-correlation',
      outcome: 'SNAPSHOT_STORED',
      durationMs: 12,
      categoryCount: 1,
      channelCount: 2,
      source: createValidatedDiscordSourceFixture(),
      snapshot: snapshotWithKinds('text'),
      secret: PRIVATE_SECRET,
      exception: new Error('private-upstream-message'),
    };

    logger.info('discord_sync_complete', unsafeFields);

    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0]?.[0]).toBe('discord_sync_complete');
    expect(JSON.parse(String(info.mock.calls[0]?.[1]))).toEqual({
      correlationId: 'safe-correlation',
      outcome: 'SNAPSHOT_STORED',
      durationMs: 12,
      categoryCount: 1,
      channelCount: 2,
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain(PRIVATE_SECRET);
    expect(JSON.stringify(info.mock.calls)).not.toContain(TEST_IDS.guild);
    expect(error).not.toHaveBeenCalled();
  });

  it('uses the same field allowlist for failure serialization', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createConsoleSafeLogger();
    const unsafeFields = {
      correlationId: 'safe-failure-correlation',
      outcome: 'DISCORD_UNAVAILABLE',
      durationMs: 21,
      source: createValidatedDiscordSourceFixture(),
      snapshot: snapshotWithKinds('text'),
      secret: PRIVATE_SECRET,
      exception: new Error('private-upstream-message'),
    };

    logger.error('discord_sync_failed', unsafeFields);

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toBe('discord_sync_failed');
    expect(JSON.parse(String(error.mock.calls[0]?.[1]))).toEqual({
      correlationId: 'safe-failure-correlation',
      outcome: 'DISCORD_UNAVAILABLE',
      durationMs: 21,
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain(PRIVATE_SECRET);
    expect(JSON.stringify(error.mock.calls)).not.toContain(TEST_IDS.guild);
    expect(info).not.toHaveBeenCalled();
  });
});

describe('same-isolate single flight', () => {
  it('rejects a second overlapping call without invoking the operation again', async () => {
    let release!: (value: string) => void;
    const operation = vi.fn<(value: string) => Promise<string>>().mockImplementation(
      async () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const guarded = createSingleFlight(operation);

    const first = guarded('first');
    const overlapError = await captureError(guarded('overlap'));

    expect(overlapError).toMatchObject({
      name: 'WorkerError',
      message: 'SYNC_IN_PROGRESS',
      code: 'SYNC_IN_PROGRESS',
    });
    expect(operation).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledWith('first');
    release('completed');
    await expect(first).resolves.toBe('completed');
  });

  it('occupies the guard before invoking the operation', async () => {
    const operation = vi.fn(async () => {
      await expect(guarded()).rejects.toMatchObject({ code: 'SYNC_IN_PROGRESS' });
      return 'completed';
    });
    const guarded = createSingleFlight(operation);

    await expect(guarded()).resolves.toBe('completed');

    expect(operation).toHaveBeenCalledOnce();
  });

  it('releases the guard after the operation resolves', async () => {
    const operation = vi.fn(async (value: string) => `result:${value}`);
    const guarded = createSingleFlight(operation);

    await expect(guarded('first')).resolves.toBe('result:first');
    await expect(guarded('second')).resolves.toBe('result:second');

    expect(operation.mock.calls).toEqual([['first'], ['second']]);
  });

  it('releases the guard after the operation rejects and preserves that rejection', async () => {
    const failure = new WorkerError('DISCORD_UNAVAILABLE');
    const operation = vi
      .fn<(value: string) => Promise<string>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce('recovered');
    const guarded = createSingleFlight(operation);

    const received = await captureError(guarded('first'));
    await expect(guarded('second')).resolves.toBe('recovered');

    expect(received).toBe(failure);
    expect(operation.mock.calls).toEqual([['first'], ['second']]);
  });
});
