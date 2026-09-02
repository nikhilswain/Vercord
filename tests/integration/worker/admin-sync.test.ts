import { describe, expect, it, vi } from 'vitest';

import { DiscordDomainError } from '../../../src/domain/discord/errors';
import { WorkerError, type WorkerErrorCode } from '../../../worker/errors';
import { authorizeSyncRequest } from '../../../worker/http/sync-auth';
import { createWorker } from '../../../worker/index';
import type { SafeLogger } from '../../../worker/logging/safe-logger';
import type { SyncSummary } from '../../../worker/sync/synchronize-guild';

const SYNC_SECRET = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
const BOT_TOKEN = 'test.bot.token.never.real.0001';
const GUILD_ID = '100000000000000001';
const CHANNEL_ID = '100000000000000099';
const PRIVATE_LABEL = 'private-war-room';
const UPSTREAM_BODY = 'private upstream response body';
const SUMMARY: SyncSummary = {
  status: 'SNAPSHOT_STORED',
  schemaVersion: 1,
  generatedAt: '2026-08-28T12:34:56.000Z',
  categoryCount: 2,
  channelCount: 7,
};

function validEnv(overrides: Partial<Env> = {}): Env {
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
    MAP_SNAPSHOTS: {
      get: async () => null,
      put: async () => undefined,
    } as unknown as KVNamespace,
    AUTH_DB: {} as D1Database,
    WORLD_PRESENCE: {} as Env['WORLD_PRESENCE'],
    ...overrides,
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
  context: ExecutionContext = {} as ExecutionContext,
): Promise<Response> {
  const fetch = worker.fetch as unknown as (
    request: Request,
    env: Env,
    context: ExecutionContext,
  ) => Response | Promise<Response>;
  return fetch(request, env, context);
}

async function fetchWith(
  request: Request,
  env: Env,
  runSync: (env: Env) => Promise<SyncSummary>,
  logger = createLogger(),
): Promise<{ response: Response; logger: SafeLogger }> {
  const worker = createWorker({ runSync, logger });
  const response = await invokeFetch(worker, request, env);
  return { response, logger };
}

function adminRequest(init: RequestInit = {}): Request {
  return new Request('https://dmap.test/api/admin/sync', {
    method: 'POST',
    headers: { authorization: `Bearer ${SYNC_SECRET}` },
    ...init,
  });
}

function expectAdminHeaders(response: Response): void {
  expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect(response.headers.get('access-control-allow-credentials')).toBeNull();
}

async function expectErrorResponse(
  response: Response,
  status: number,
  code: string,
): Promise<string> {
  expect(response.status).toBe(status);
  expectAdminHeaders(response);
  const body = await response.text();
  expect(JSON.parse(body)).toEqual({ error: { code } });
  return body;
}

describe('sync request authorization', () => {
  it('accepts exactly one Bearer credential matching the expected secret', async () => {
    await expect(authorizeSyncRequest(`Bearer ${SYNC_SECRET}`, SYNC_SECRET)).resolves.toBe(true);
  });

  it.each<[string, string | null]>([
    ['missing header', null],
    ['empty header', ''],
    ['empty candidate', 'Bearer '],
    ['wrong scheme', `Basic ${SYNC_SECRET}`],
    ['wrong scheme case', `bearer ${SYNC_SECRET}`],
    ['leading whitespace', ` Bearer ${SYNC_SECRET}`],
    ['trailing whitespace', `Bearer ${SYNC_SECRET} `],
    ['multiple spaces', `Bearer  ${SYNC_SECRET}`],
    ['tab separator', `Bearer\t${SYNC_SECRET}`],
    ['multiple credentials', `Bearer ${SYNC_SECRET}, Bearer ${SYNC_SECRET}`],
    ['non-ASCII candidate', 'Bearer sécret'],
    ['overlong candidate', `Bearer ${'a'.repeat(513)}`],
    ['same-length mismatch', `Bearer ${SYNC_SECRET.slice(0, -1)}B`],
    ['shorter mismatch', `Bearer ${SYNC_SECRET.slice(0, -1)}`],
    ['longer mismatch', `Bearer ${SYNC_SECRET}A`],
  ])('rejects %s', async (_case, header) => {
    await expect(authorizeSyncRequest(header, SYNC_SECRET)).resolves.toBe(false);
  });

  it('hashes both distinct operands with SHA-256 before comparing a valid mismatch', async () => {
    const candidate = `${SYNC_SECRET.slice(0, -1)}B`;
    const digest = vi.spyOn(crypto.subtle, 'digest');

    try {
      await expect(authorizeSyncRequest(`Bearer ${candidate}`, SYNC_SECRET)).resolves.toBe(false);

      expect(digest).toHaveBeenCalledTimes(2);
      expect(digest.mock.calls.map(([algorithm]) => algorithm)).toEqual(['SHA-256', 'SHA-256']);
      expect(
        digest.mock.calls.map(([, data]) => {
          const bytes = ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : new Uint8Array(data);
          return new TextDecoder().decode(bytes);
        }),
      ).toEqual([SYNC_SECRET, candidate]);
      const digests = await Promise.all(
        digest.mock.results.map(({ value }) => value as Promise<ArrayBuffer>),
      );
      expect(digests.map(({ byteLength }) => byteLength)).toEqual([32, 32]);
    } finally {
      digest.mockRestore();
    }
  });

  it('uses one all-byte XOR accumulator with no loop-internal return', () => {
    const source = authorizeSyncRequest.toString();
    const loop = source.match(
      /for\s*\(\s*let index = 0;\s*index < expectedBytes\.length;\s*index \+= 1\s*\)\s*\{([\s\S]*?)\}/,
    );

    expect(loop).not.toBeNull();
    expect(loop![1]).toMatch(
      /difference\s*\|=\s*expectedBytes\[index\]\s*\^\s*candidateBytes\[index\]/,
    );
    expect(loop![1]).not.toMatch(/\breturn\b/);
    expect(source.match(/let difference\s*=\s*0/g)).toHaveLength(1);
    expect(source.match(/difference\s*\|=/g)).toHaveLength(1);
    expect(source).toMatch(/return difference\s*===\s*0/);
    expect(source).not.toMatch(
      /expectedSecret\s*={2,3}\s*candidate|candidate\s*={2,3}\s*expectedSecret/,
    );
  });
});

describe('protected manual synchronization route', () => {
  it.each(['GET', 'PUT', 'DELETE'])('rejects %s before synchronization', async (method) => {
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockResolvedValue(SUMMARY);
    const { response } = await fetchWith(
      new Request('https://dmap.test/api/admin/sync', { method }),
      validEnv({ SYNC_SECRET: 'invalid' }),
      runSync,
    );

    await expectErrorResponse(response, 405, 'METHOD_NOT_ALLOWED');
    expect(response.headers.get('allow')).toBe('POST');
    expect(runSync).not.toHaveBeenCalled();
  });

  it('rejects a non-POST with a body before body, config, and authentication checks', async () => {
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockResolvedValue(SUMMARY);
    const request = new Request('https://dmap.test/api/admin/sync', {
      method: 'PUT',
      body: '{}',
      headers: { authorization: 'Basic invalid' },
    });
    const { response } = await fetchWith(request, validEnv({ SYNC_SECRET: 'invalid' }), runSync);

    await expectErrorResponse(response, 405, 'METHOD_NOT_ALLOWED');
    expect(response.headers.get('allow')).toBe('POST');
    expect(request.bodyUsed).toBe(false);
    expect(runSync).not.toHaveBeenCalled();
  });

  it.each<[string, RequestInit]>([
    ['actual empty JSON object', { body: '{}' }],
    ['positive content length', { headers: { 'content-length': '1' } }],
    ['transfer encoding', { headers: { 'transfer-encoding': 'chunked' } }],
  ])(
    'rejects %s before configuration or authentication without consuming it',
    async (_case, init) => {
      const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockResolvedValue(SUMMARY);
      const request = adminRequest(init);
      const { response } = await fetchWith(request, validEnv({ SYNC_SECRET: 'invalid' }), runSync);

      await expectErrorResponse(response, 400, 'REQUEST_BODY_NOT_ALLOWED');
      expect(request.bodyUsed).toBe(false);
      expect(runSync).not.toHaveBeenCalled();
    },
  );

  it('rejects a present empty Transfer-Encoding header as a body signal', async () => {
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockResolvedValue(SUMMARY);
    const request = adminRequest({
      headers: {
        authorization: `Bearer ${SYNC_SECRET}`,
        'transfer-encoding': '',
      },
    });
    const { response } = await fetchWith(request, validEnv(), runSync);

    await expectErrorResponse(response, 400, 'REQUEST_BODY_NOT_ALLOWED');
    expect(request.bodyUsed).toBe(false);
    expect(runSync).not.toHaveBeenCalled();
  });

  it('maps invalid synchronization authorization configuration without invoking the runner', async () => {
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockResolvedValue(SUMMARY);
    const { response } = await fetchWith(
      adminRequest(),
      validEnv({ SYNC_SECRET: 'invalid' }),
      runSync,
    );

    await expectErrorResponse(response, 500, 'CONFIG_INVALID');
    expect(response.headers.get('www-authenticate')).toBeNull();
    expect(runSync).not.toHaveBeenCalled();
  });

  it('returns identical challenges for missing, malformed, and wrong credentials', async () => {
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockResolvedValue(SUMMARY);
    const headers = [null, 'Basic test', `Bearer ${SYNC_SECRET.slice(0, -1)}B`];
    const results: Array<{ status: number; headers: [string, string][]; body: string }> = [];

    for (const authorization of headers) {
      const requestHeaders: HeadersInit = authorization === null ? [] : { authorization };
      const { response } = await fetchWith(
        adminRequest({ headers: requestHeaders }),
        validEnv(),
        runSync,
      );
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
      expectAdminHeaders(response);
      results.push({
        status: response.status,
        headers: [...response.headers.entries()],
        body: await response.text(),
      });
    }

    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(JSON.parse(results[0]!.body)).toEqual({ error: { code: 'UNAUTHORIZED' } });
    expect(runSync).not.toHaveBeenCalled();
  });

  it('passes only the supplied environment to the runner and returns exactly safe summary fields', async () => {
    const env = validEnv();
    const returned = { ...SUMMARY, secret: SYNC_SECRET, guildId: GUILD_ID } as SyncSummary;
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockResolvedValue(returned);
    const { response } = await fetchWith(
      new Request(
        'https://dmap.test/api/admin/sync?guild=attacker&slug=attacker&channel=attacker&allowlist=all',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${SYNC_SECRET}`,
            'content-length': '0',
          },
        },
      ),
      env,
      runSync,
    );

    expect(response.status).toBe(200);
    expectAdminHeaders(response);
    await expect(response.json()).resolves.toEqual(SUMMARY);
    expect(runSync).toHaveBeenCalledOnce();
    expect(runSync).toHaveBeenCalledWith(env);
  });

  it('rejects an overlapping authorized request through the factory-owned guard', async () => {
    let release!: (summary: SyncSummary) => void;
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const worker = createWorker({ runSync, logger: createLogger() });
    const env = validEnv();

    const first = invokeFetch(worker, adminRequest(), env);
    await vi.waitFor(() => expect(runSync).toHaveBeenCalledOnce());
    const overlap = await invokeFetch(worker, adminRequest(), env);

    await expectErrorResponse(overlap, 409, 'SYNC_IN_PROGRESS');
    expect(runSync).toHaveBeenCalledOnce();
    release(SUMMARY);
    await expect(first).resolves.toMatchObject({ status: 200 });
  });

  it('allows independent workers to own independent active guards', async () => {
    let releaseFirst!: (summary: SyncSummary) => void;
    let releaseSecond!: (summary: SyncSummary) => void;
    const firstRunner = vi.fn<(env: Env) => Promise<SyncSummary>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const secondRunner = vi.fn<(env: Env) => Promise<SyncSummary>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSecond = resolve;
        }),
    );
    const firstWorker = createWorker({ runSync: firstRunner, logger: createLogger() });
    const secondWorker = createWorker({ runSync: secondRunner, logger: createLogger() });
    const env = validEnv();

    const first = invokeFetch(firstWorker, adminRequest(), env);
    await vi.waitFor(() => expect(firstRunner).toHaveBeenCalledOnce());
    const second = invokeFetch(secondWorker, adminRequest(), env);
    await vi.waitFor(() => expect(secondRunner).toHaveBeenCalledOnce());

    expect(firstRunner).toHaveBeenCalledWith(env);
    expect(secondRunner).toHaveBeenCalledWith(env);
    releaseFirst(SUMMARY);
    releaseSecond(SUMMARY);
    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
  });

  it.each([
    ['CONFIG_INVALID', 500],
    ['DISCORD_SOURCE_INVALID', 502],
    ['SNAPSHOT_INVALID', 500],
    ['EXCESSIVE_BOT_PERMISSION', 422],
    ['DISCORD_UNAUTHORIZED', 502],
    ['DISCORD_FORBIDDEN', 502],
    ['DISCORD_NOT_FOUND', 502],
    ['DISCORD_RATE_LIMITED', 503],
    ['DISCORD_UNAVAILABLE', 503],
    ['DISCORD_RESPONSE_INVALID', 502],
    ['DISCORD_RESPONSE_TOO_LARGE', 502],
    ['DISCORD_REQUEST_TIMEOUT', 504],
    ['SYNC_TIMEOUT', 504],
    ['SNAPSHOT_READ_FAILED', 503],
    ['SNAPSHOT_WRITE_FAILED', 503],
    ['SUSPICIOUS_EMPTY_SNAPSHOT', 409],
    ['SYNC_IN_PROGRESS', 409],
  ] as const)('maps %s to the stable safe response', async (code, status) => {
    const failure =
      code === 'CONFIG_INVALID'
        ? new Error(code)
        : ['DISCORD_SOURCE_INVALID', 'SNAPSHOT_INVALID', 'EXCESSIVE_BOT_PERMISSION'].includes(code)
          ? new DiscordDomainError(
              code as 'DISCORD_SOURCE_INVALID' | 'SNAPSHOT_INVALID' | 'EXCESSIVE_BOT_PERMISSION',
            )
          : new WorkerError(code as WorkerErrorCode);
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockRejectedValue(failure);
    const logger = createLogger();
    const { response } = await fetchWith(adminRequest(), validEnv(), runSync, logger);

    await expectErrorResponse(response, status, code);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('maps unknown failures to a message-free SYNC_FAILED response without logging private values', async () => {
    const privateFailure = new Error(
      `${SYNC_SECRET} ${BOT_TOKEN} ${GUILD_ID} ${CHANNEL_ID} ${PRIVATE_LABEL} ${UPSTREAM_BODY}`,
    );
    const runSync = vi.fn<(env: Env) => Promise<SyncSummary>>().mockRejectedValue(privateFailure);
    const logger = createLogger();
    const { response } = await fetchWith(adminRequest(), validEnv(), runSync, logger);

    const body = await expectErrorResponse(response, 500, 'SYNC_FAILED');
    const captured = JSON.stringify({
      body,
      logger: [logger.info.mock.calls, logger.error.mock.calls],
    });
    for (const forbidden of [
      SYNC_SECRET,
      BOT_TOKEN,
      GUILD_ID,
      CHANNEL_ID,
      PRIVATE_LABEL,
      UPSTREAM_BODY,
    ]) {
      expect(captured).not.toContain(forbidden);
    }
  });
});

describe('routing remains private and backward-compatible', () => {
  it('keeps health configuration-independent and preserves API and non-API fallbacks', async () => {
    const worker = createWorker({
      runSync: vi.fn<(env: Env) => Promise<SyncSummary>>().mockResolvedValue(SUMMARY),
      logger: createLogger(),
    });
    const invalidEnv = {} as Env;
    const context = {} as ExecutionContext;

    const health = await invokeFetch(
      worker,
      new Request('https://dmap.test/api/health'),
      invalidEnv,
      context,
    );
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ service: 'dmap', status: 'ok' });

    const unknownApi = await invokeFetch(
      worker,
      new Request('https://dmap.test/api/unknown'),
      invalidEnv,
      context,
    );
    expect(unknownApi.status).toBe(404);
    await expect(unknownApi.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: 'API route not found.' },
    });

    const fallback = await invokeFetch(
      worker,
      new Request('https://dmap.test/not-an-api-route'),
      invalidEnv,
      context,
    );
    expect(fallback.status).toBe(404);
    await expect(fallback.text()).resolves.toBe('');
  });

  it.each([
    '/api/map/test-map',
    '/api/map/snapshot:test-map',
    '/api/snapshots/test-map',
    '/api/admin/sync/snapshot:test-map',
  ])('does not expose snapshots from guessed route %s', async (path) => {
    const snapshot = { schemaVersion: 1, guild: PRIVATE_LABEL, channels: [CHANNEL_ID] };
    const worker = createWorker({
      runSync: vi.fn<(env: Env) => Promise<SyncSummary>>().mockResolvedValue(SUMMARY),
      logger: createLogger(),
    });
    const response = await invokeFetch(
      worker,
      new Request(`https://dmap.test${path}`),
      validEnv(),
      {} as ExecutionContext,
    );
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).not.toContain(JSON.stringify(snapshot));
    expect(body).not.toContain(PRIVATE_LABEL);
    expect(body).not.toContain(CHANNEL_ID);
  });
});
