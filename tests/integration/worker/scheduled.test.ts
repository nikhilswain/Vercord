import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

import { DiscordDomainError } from '../../../src/domain/discord/errors';
import { WorkerError } from '../../../worker/errors';
import { createWorker } from '../../../worker/index';
import type { SafeLogger } from '../../../worker/logging/safe-logger';
import type { SyncSummary } from '../../../worker/sync/synchronize-guild';
// @ts-expect-error Vite supplies the raw JSONC source to the Worker test bundle.
import wranglerSource from '../../../wrangler.jsonc?raw';

const SYNC_SECRET = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
const BOT_TOKEN = 'test.bot.token.never.real.0001';
const GUILD_ID = '100000000000000001';
const PRIVATE_UPSTREAM = 'private scheduled upstream body';
const SUMMARY: SyncSummary = {
  status: 'SNAPSHOT_STORED',
  schemaVersion: 1,
  generatedAt: '2026-08-28T12:34:56.000Z',
  categoryCount: 2,
  channelCount: 7,
};

function validEnv(): Env {
  return {
    DISCORD_BOT_TOKEN: BOT_TOKEN,
    DISCORD_GUILD_ID: GUILD_ID,
    MAP_SLUG: 'test-map',
    SYNC_SECRET,
    PUBLICATION_ALLOWLIST_JSON: '{"categoryIds":[],"channelIds":[]}',
    SNAPSHOT_ID_SECRET: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI',
    DISCORD_CLIENT_ID: '100000000000000002',
    DISCORD_CLIENT_SECRET: 'test-client-secret-never-real',
    AUTH_SESSION_SECRET: 'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM',
    GATEWAY_BRIDGE_SECRET: 'BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ',
    MAP_SNAPSHOTS: {
      get: async () => null,
      put: async () => undefined,
    } as unknown as KVNamespace,
    AUTH_DB: {} as D1Database,
    WORLD_PRESENCE: {} as Env['WORLD_PRESENCE'],
    DISCORD_GATEWAY_BRIDGE: {} as Env['DISCORD_GATEWAY_BRIDGE'],
  };
}

function createLogger(): SafeLogger & {
  info: ReturnType<typeof vi.fn<SafeLogger['info']>>;
  error: ReturnType<typeof vi.fn<SafeLogger['error']>>;
} {
  return {
    info: vi.fn<SafeLogger['info']>(),
    error: vi.fn<SafeLogger['error']>(),
  };
}

async function invokeFetch(
  worker: ExportedHandler<Env>,
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response> {
  const fetch = worker.fetch as unknown as (
    request: Request,
    env: Env,
    context: ExecutionContext,
  ) => Response | Promise<Response>;
  return fetch(request, env, context);
}

function authorizedRequest(): Request {
  return new Request('https://dmap.test/api/admin/sync', {
    method: 'POST',
    headers: { authorization: `Bearer ${SYNC_SECRET}` },
  });
}

describe('scheduled synchronization entry point', () => {
  it('uses the same injected runner as manual synchronization with the supplied environment', async () => {
    const env = validEnv();
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockResolvedValue(SUMMARY);
    const worker = createWorker({ runSync, logger: createLogger() });
    const scheduledContext = createExecutionContext();

    worker.scheduled!(createScheduledController(), env, scheduledContext);
    await waitOnExecutionContext(scheduledContext);
    const manual = await invokeFetch(worker, authorizedRequest(), env, createExecutionContext());

    expect(manual.status).toBe(200);
    expect(runSync.mock.calls).toEqual([[env], [env]]);
  });

  it('registers exactly one pending promise and settles only after the runner settles', async () => {
    let release!: (summary: SyncSummary) => void;
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const worker = createWorker({ runSync, logger: createLogger() });
    const context = createExecutionContext();
    const waitUntil = vi.spyOn(context, 'waitUntil');

    const returned = worker.scheduled!(createScheduledController(), validEnv(), context);

    expect(returned).toBeUndefined();
    expect(waitUntil).toHaveBeenCalledOnce();
    const registered = waitUntil.mock.calls[0]![0];
    let registeredSettled = false;
    void registered.then(() => {
      registeredSettled = true;
    });
    await Promise.resolve();
    expect(registeredSettled).toBe(false);

    release(SUMMARY);
    await waitOnExecutionContext(context);
    expect(registeredSettled).toBe(true);
  });

  it.each([
    ['worker code', new WorkerError('DISCORD_RATE_LIMITED'), 'DISCORD_RATE_LIMITED'],
    ['domain code', new DiscordDomainError('DISCORD_SOURCE_INVALID'), 'DISCORD_SOURCE_INVALID'],
    ['configuration code', new Error('CONFIG_INVALID'), 'CONFIG_INVALID'],
    [
      'unknown error',
      new Error(`${SYNC_SECRET} ${BOT_TOKEN} ${GUILD_ID} ${PRIVATE_UPSTREAM}`),
      'SYNC_FAILED',
    ],
  ])('settles a rejected runner and logs only the stable %s', async (_case, failure, outcome) => {
    const logger = createLogger();
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockRejectedValue(failure);
    const worker = createWorker({ runSync, logger });
    const context = createExecutionContext();

    worker.scheduled!(createScheduledController(), validEnv(), context);
    await expect(waitOnExecutionContext(context)).resolves.toBeUndefined();

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith('discord_sync_failed', {
      correlationId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      outcome,
      durationMs: expect.any(Number),
    });
    const captured = JSON.stringify(logger.error.mock.calls);
    for (const forbidden of [SYNC_SECRET, BOT_TOKEN, GUILD_ID, PRIVATE_UPSTREAM]) {
      expect(captured).not.toContain(forbidden);
    }
  });

  it('settles safely when failure logging itself throws', async () => {
    const logger = createLogger();
    logger.error.mockImplementation(() => {
      throw new Error(`${SYNC_SECRET} logger failure`);
    });
    const runSync = vi
      .fn<(env: Env) => Promise<SyncSummary>>()
      .mockRejectedValue(new WorkerError('DISCORD_UNAVAILABLE'));
    const worker = createWorker({ runSync, logger });
    const context = createExecutionContext();

    worker.scheduled!(createScheduledController(), validEnv(), context);

    await expect(waitOnExecutionContext(context)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error.mock.calls[0]?.[1]).toMatchObject({ outcome: 'DISCORD_UNAVAILABLE' });
  });

  it('shares one factory-owned guard between scheduled and manual entry points', async () => {
    let release!: (summary: SyncSummary) => void;
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const worker = createWorker({ runSync, logger: createLogger() });
    const env = validEnv();
    const scheduledContext = createExecutionContext();

    worker.scheduled!(createScheduledController(), env, scheduledContext);
    await vi.waitFor(() => expect(runSync).toHaveBeenCalledOnce());
    const overlap = await invokeFetch(worker, authorizedRequest(), env, createExecutionContext());

    expect(overlap.status).toBe(409);
    await expect(overlap.json()).resolves.toEqual({ error: { code: 'SYNC_IN_PROGRESS' } });
    expect(runSync).toHaveBeenCalledOnce();
    release(SUMMARY);
    await waitOnExecutionContext(scheduledContext);
  });
});

describe('deployment configuration remains schedule-free', () => {
  it('contains no cron, environment, preview binding, or remote KV access', () => {
    const config = JSON.parse(
      wranglerSource.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'),
    ) as Record<string, unknown>;
    const namespaces = config.kv_namespaces as Array<Record<string, unknown>>;

    expect(config).not.toHaveProperty('triggers');
    expect(config).not.toHaveProperty('env');
    expect(config.workers_dev).toBe(true);
    expect(config.preview_urls).toBe(false);
    expect(namespaces).toHaveLength(1);
    expect(namespaces[0]).not.toHaveProperty('preview_id');
    expect(namespaces[0]).toMatchObject({ binding: 'MAP_SNAPSHOTS', remote: false });
  });
});
