import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDiscordRestClient, type FetchLike } from '../../../worker/discord/client';
import {
  DISCORD_MAX_BODY_BYTES,
  DISCORD_MAX_RATE_LIMIT_MS,
  DISCORD_MAX_RETRIES,
  DISCORD_REQUEST_TIMEOUT_MS,
  DISCORD_SYNC_BUDGET_MS,
  readBoundedJson,
} from '../../../worker/discord/read-json';
import { WorkerError } from '../../../worker/errors';
import {
  createRawDiscordResponses,
  createValidatedDiscordSourceFixture,
  TEST_IDS,
} from '../../fixtures/discord/guild-source';

const TEST_TOKEN = 'test.bot.token.never.real.0001';
const PRIVATE_BODY = 'PRIVATE_RESPONSE_BODY_MUST_NOT_ESCAPE';
const PRIVATE_NETWORK_DETAIL = 'PRIVATE_NETWORK_DETAIL_MUST_NOT_ESCAPE';

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(value), { ...init, headers });
}

function createQueuedFetch(responses: Response[]): {
  fetch: FetchLike;
  requests: Request[];
} {
  const queue = [...responses];
  const requests: Request[] = [];
  return {
    requests,
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      const response = queue.shift();
      if (response === undefined) throw new Error('TEST_FETCH_QUEUE_EXHAUSTED');
      return response;
    },
  };
}

function createDependencies(fetch: FetchLike) {
  return {
    fetch,
    now: () => 0,
    random: () => 0,
    sleep: async () => undefined,
  };
}

function sourceResponses(): Response[] {
  const raw = createRawDiscordResponses();
  return [
    jsonResponse(raw.bot),
    jsonResponse(raw.guild),
    jsonResponse(raw.botMember),
    jsonResponse(raw.channels),
  ];
}

async function captureWorkerError(promise: Promise<unknown>): Promise<WorkerError> {
  let thrown: unknown;
  try {
    await promise;
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(WorkerError);
  return thrown as WorkerError;
}

function expectCode(error: WorkerError, code: WorkerError['code']): void {
  expect(error).toMatchObject({ name: 'WorkerError', code, message: code });
}

function expectValueFree(error: WorkerError): void {
  const diagnostics = [
    String(error),
    error.message,
    error.name,
    error.code,
    error.stack ?? '',
    JSON.stringify(error),
    JSON.stringify(Object.getOwnPropertyDescriptors(error)),
  ].join('\n');
  const forbidden = [
    TEST_TOKEN,
    PRIVATE_BODY,
    PRIVATE_NETWORK_DETAIL,
    'Invented Test Guild',
    'https://discord.com/api/v10',
    ...Object.values(TEST_IDS),
  ];
  for (const value of forbidden) expect(diagnostics).not.toContain(value);
  expect(error).not.toHaveProperty('cause');
  expect(error).not.toHaveProperty('response');
  expect(error).not.toHaveProperty('body');
  expect(error).not.toHaveProperty('url');
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Discord REST request construction and sequencing', () => {
  it('fetches and validates the configured guild source in dependency order', async () => {
    const raw = createRawDiscordResponses();
    const queued = createQueuedFetch([
      jsonResponse(raw.bot),
      jsonResponse(raw.guild),
      jsonResponse(raw.botMember),
      jsonResponse(raw.channels),
    ]);
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: createDependencies(queued.fetch),
    });

    await expect(client.fetchGuildSource(TEST_IDS.guild)).resolves.toEqual(
      createValidatedDiscordSourceFixture(),
    );

    expect(queued.requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'GET https://discord.com/api/v10/users/@me',
      `GET https://discord.com/api/v10/guilds/${TEST_IDS.guild}`,
      `GET https://discord.com/api/v10/guilds/${TEST_IDS.guild}/members/${TEST_IDS.bot}`,
      `GET https://discord.com/api/v10/guilds/${TEST_IDS.guild}/channels`,
    ]);
    for (const request of queued.requests) {
      expect(Object.fromEntries(request.headers)).toEqual({
        accept: 'application/json',
        authorization: `Bot ${TEST_TOKEN}`,
        'user-agent': 'Dmap/0.1.0',
      });
      expect(request.body).toBeNull();
    }
  });

  it('stops before member and channel requests when Discord returns another guild', async () => {
    const raw = createRawDiscordResponses();
    const wrongGuild = { ...(raw.guild as object), id: TEST_IDS.owner };
    const queued = createQueuedFetch([jsonResponse(raw.bot), jsonResponse(wrongGuild)]);
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: createDependencies(queued.fetch),
    });

    const failure = client.fetchGuildSource(TEST_IDS.guild);

    await expect(failure).rejects.toMatchObject({
      name: 'WorkerError',
      code: 'DISCORD_SOURCE_INVALID',
      message: 'DISCORD_SOURCE_INVALID',
    });
    await expect(failure).rejects.toBeInstanceOf(WorkerError);
    expect(queued.requests.map(({ url }) => url)).toEqual([
      'https://discord.com/api/v10/users/@me',
      `https://discord.com/api/v10/guilds/${TEST_IDS.guild}`,
    ]);
  });

  it('encodes every caller-supplied path segment', async () => {
    const raw = createRawDiscordResponses();
    const queued = createQueuedFetch([jsonResponse(raw.bot), jsonResponse(raw.guild)]);
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: createDependencies(queued.fetch),
    });

    await captureWorkerError(client.fetchGuildSource('%/'));

    expect(queued.requests[1]?.url).toBe('https://discord.com/api/v10/guilds/%25%2F');
  });
});

describe('Discord REST status and retry policy', () => {
  it.each([
    [401, 'DISCORD_UNAUTHORIZED'],
    [403, 'DISCORD_FORBIDDEN'],
    [404, 'DISCORD_NOT_FOUND'],
    [400, 'DISCORD_RESPONSE_INVALID'],
    [418, 'DISCORD_RESPONSE_INVALID'],
    [499, 'DISCORD_RESPONSE_INVALID'],
  ] as const)('maps status %i to %s without retrying', async (status, code) => {
    const queued = createQueuedFetch([new Response(PRIVATE_BODY, { status })]);
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: createDependencies(queued.fetch),
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, code);
    expect(queued.requests).toHaveLength(1);
    expectValueFree(error);
  });

  it.each([500, 502, 599])(
    'retries status %i exactly twice, then reports unavailable',
    async (status) => {
      const queued = createQueuedFetch([
        new Response(PRIVATE_BODY, { status }),
        new Response(PRIVATE_BODY, { status }),
        new Response(PRIVATE_BODY, { status }),
      ]);
      const sleeps: number[] = [];
      const client = createDiscordRestClient({
        botToken: TEST_TOKEN,
        dependencies: {
          ...createDependencies(queued.fetch),
          sleep: async (milliseconds) => {
            sleeps.push(milliseconds);
          },
        },
      });

      const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

      expectCode(error, 'DISCORD_UNAVAILABLE');
      expect(queued.requests).toHaveLength(1 + DISCORD_MAX_RETRIES);
      expect(sleeps).toEqual([250, 500]);
      expectValueFree(error);
    },
  );

  it('retries network failures no more than twice and discards the original error', async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    const fetch: FetchLike = async () => {
      attempts += 1;
      throw new Error(`${PRIVATE_NETWORK_DETAIL} ${TEST_TOKEN} ${TEST_IDS.guild}`);
    };
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(fetch),
        random: () => 1,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, 'DISCORD_UNAVAILABLE');
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([500, 1_000]);
    expectValueFree(error);
  });

  it('prefers the shared deadline when the final network rejection exhausts the budget', async () => {
    let clock = 0;
    let attempts = 0;
    const sleeps: number[] = [];
    const fetch: FetchLike = async () => {
      attempts += 1;
      if (attempts === 3) clock = DISCORD_SYNC_BUDGET_MS + 1;
      throw new Error(PRIVATE_NETWORK_DETAIL);
    };
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        fetch,
        now: () => clock,
        random: () => 0,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, 'SYNC_TIMEOUT');
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([250, 500]);
    expectValueFree(error);
  });

  it('uses the documented lower and upper jitter bounds', async () => {
    const randomValues = [0, 1];
    const sleeps: number[] = [];
    let attempts = 0;
    const fetch: FetchLike = async () => {
      attempts += 1;
      if (attempts <= 2) throw new Error(PRIVATE_NETWORK_DETAIL);
      return sourceResponses()[0]!;
    };
    const remaining = sourceResponses().slice(1);
    const sequencedFetch: FetchLike = async (input, init) => {
      if (attempts < 3) return fetch(input, init);
      if (attempts === 3) {
        attempts += 1;
        return remaining.shift()!;
      }
      return remaining.shift()!;
    };
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(sequencedFetch),
        random: () => randomValues.shift() ?? 0,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    await expect(client.fetchGuildSource(TEST_IDS.guild)).resolves.toEqual(
      createValidatedDiscordSourceFixture(),
    );
    expect(sleeps).toEqual([250, 1_000]);
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(2_000);
  });

  it('recovers from server errors with a fresh abort signal for every attempt', async () => {
    const queue = [
      new Response('', { status: 500 }),
      new Response('', { status: 599 }),
      ...sourceResponses(),
    ];
    const signals: AbortSignal[] = [];
    const sleeps: number[] = [];
    const fetch: FetchLike = async (_input, init) => {
      signals.push(init!.signal as AbortSignal);
      return queue.shift()!;
    };
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(fetch),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    await expect(client.fetchGuildSource(TEST_IDS.guild)).resolves.toEqual(
      createValidatedDiscordSourceFixture(),
    );
    expect(signals).toHaveLength(6);
    expect(new Set(signals)).toHaveLength(6);
    expect(sleeps).toEqual([250, 500]);
  });

  it('honors a bounded Retry-After header without inspecting its body', async () => {
    const rateLimitResponse = new Response(PRIVATE_BODY, {
      status: 429,
      headers: { 'Retry-After': '1.25' },
    });
    const getReader = vi.spyOn(rateLimitResponse.body!, 'getReader');
    const queued = createQueuedFetch([rateLimitResponse, ...sourceResponses()]);
    const sleeps: number[] = [];
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(queued.fetch),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    await expect(client.fetchGuildSource(TEST_IDS.guild)).resolves.toEqual(
      createValidatedDiscordSourceFixture(),
    );
    expect(sleeps).toEqual([1_250]);
    expect(getReader).not.toHaveBeenCalled();
    expect(rateLimitResponse.bodyUsed).toBe(false);
  });

  it('uses bounded JSON retry_after only when Retry-After is absent', async () => {
    const queued = createQueuedFetch([
      jsonResponse({ retry_after: 0.5, diagnostic: PRIVATE_BODY }, { status: 429 }),
      ...sourceResponses(),
    ]);
    const sleeps: number[] = [];
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(queued.fetch),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    await expect(client.fetchGuildSource(TEST_IDS.guild)).resolves.toEqual(
      createValidatedDiscordSourceFixture(),
    );
    expect(sleeps).toEqual([500]);
  });

  it('gives an invalid Retry-After header precedence over a valid JSON fallback', async () => {
    const queued = createQueuedFetch([
      jsonResponse({ retry_after: 0.5 }, { status: 429, headers: { 'Retry-After': 'invalid' } }),
    ]);
    const sleeps: number[] = [];
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(queued.fetch),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, 'DISCORD_RATE_LIMITED');
    expect(sleeps).toEqual([]);
    expect(queued.requests).toHaveLength(1);
  });

  it('requires decimal Retry-After syntax instead of JavaScript numeric coercion', async () => {
    const queued = createQueuedFetch([
      jsonResponse({ retry_after: 0.5 }, { status: 429, headers: { 'Retry-After': '0x1' } }),
    ]);
    const sleeps: number[] = [];
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(queued.fetch),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, 'DISCORD_RATE_LIMITED');
    expect(sleeps).toEqual([]);
    expect(queued.requests).toHaveLength(1);
  });

  it('routes a headerless 429 fallback through the bounded reader', async () => {
    const queued = createQueuedFetch([
      new Response('{"retry_after":0}', {
        status: 429,
        headers: {
          'Content-Length': String(DISCORD_MAX_BODY_BYTES + 1),
          'Content-Type': 'application/json',
        },
      }),
    ]);
    const sleeps: number[] = [];
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(queued.fetch),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, 'DISCORD_RATE_LIMITED');
    expect(sleeps).toEqual([]);
    expect(queued.requests).toHaveLength(1);
  });

  it.each([
    ['missing', undefined, '{}'],
    ['non-numeric header', 'later', '{"retry_after":0.1}'],
    ['non-finite header', 'Infinity', '{"retry_after":0.1}'],
    ['negative header', '-0.1', '{"retry_after":0.1}'],
    ['over-limit header', '10.001', '{"retry_after":0.1}'],
    ['non-numeric JSON', undefined, '{"retry_after":"1"}'],
    ['non-finite JSON', undefined, '{"retry_after":1e309}'],
    ['negative JSON', undefined, '{"retry_after":-0.1}'],
    ['over-limit JSON', undefined, '{"retry_after":10.001}'],
  ])('rejects a %s rate-limit delay immediately', async (_case, header, body) => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (header !== undefined) (headers as Record<string, string>)['Retry-After'] = header;
    const queued = createQueuedFetch([new Response(body, { status: 429, headers })]);
    const sleeps: number[] = [];
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(queued.fetch),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, 'DISCORD_RATE_LIMITED');
    expect(sleeps).toEqual([]);
    expect(queued.requests).toHaveLength(1);
  });

  it('accepts the exact ten-second rate-limit boundary', async () => {
    const queued = createQueuedFetch([
      new Response('', { status: 429, headers: { 'Retry-After': '10' } }),
      ...sourceResponses(),
    ]);
    const sleeps: number[] = [];
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(queued.fetch),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    await client.fetchGuildSource(TEST_IDS.guild);

    expect(sleeps).toEqual([DISCORD_MAX_RATE_LIMIT_MS]);
  });

  it('bounds rate-limit retries to the original request plus two', async () => {
    const queued = createQueuedFetch([
      ...Array.from(
        { length: 3 },
        () => new Response('', { status: 429, headers: { 'Retry-After': '0' } }),
      ),
    ]);
    const sleeps: number[] = [];
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(queued.fetch),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, 'DISCORD_RATE_LIMITED');
    expect(queued.requests).toHaveLength(3);
    expect(sleeps).toEqual([0, 0]);
  });

  it('prefers the shared deadline when terminal 429 body processing exhausts the budget', async () => {
    let clock = 0;
    const terminalResponse = jsonResponse({ retry_after: 0 }, { status: 429 });
    const body = terminalResponse.body!;
    const originalGetReader = body.getReader.bind(body);
    Object.defineProperty(body, 'getReader', {
      value: () => {
        const reader = originalGetReader();
        const originalRead = reader.read.bind(reader);
        Object.defineProperty(reader, 'read', {
          value: async () => {
            const result = await originalRead();
            clock = DISCORD_SYNC_BUDGET_MS + 1;
            return result;
          },
        });
        return reader;
      },
    });
    const queued = createQueuedFetch([
      new Response('', { status: 429, headers: { 'Retry-After': '0' } }),
      new Response('', { status: 429, headers: { 'Retry-After': '0' } }),
      terminalResponse,
    ]);
    const sleeps: number[] = [];
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        fetch: queued.fetch,
        now: () => clock,
        random: () => 0,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, 'SYNC_TIMEOUT');
    expect(queued.requests).toHaveLength(3);
    expect(sleeps).toEqual([0, 0]);
    expectValueFree(error);
  });

  it('does not sleep when a retry delay would pass the shared sync deadline', async () => {
    let clock = 0;
    let attempts = 0;
    const sleeps: number[] = [];
    const fetch: FetchLike = async () => {
      attempts += 1;
      clock = DISCORD_SYNC_BUDGET_MS - 200;
      throw new Error(PRIVATE_NETWORK_DETAIL);
    };
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        fetch,
        now: () => clock,
        random: () => 0,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
          clock += milliseconds;
        },
      },
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, 'SYNC_TIMEOUT');
    expect(attempts).toBe(1);
    expect(sleeps).toEqual([]);
  });
});

describe('Discord REST body and source validation', () => {
  it('rejects an oversized declared body before acquiring a stream reader', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('{}'));
        controller.close();
      },
    });
    const getReader = vi.spyOn(stream, 'getReader');
    const response = new Response(stream, {
      headers: {
        'Content-Length': String(DISCORD_MAX_BODY_BYTES + 1),
        'Content-Type': 'application/json',
      },
    });

    const error = await captureWorkerError(readBoundedJson(response));

    expectCode(error, 'DISCORD_RESPONSE_TOO_LARGE');
    expect(getReader).not.toHaveBeenCalled();
  });

  it('cancels a chunked body as soon as it crosses the five-MiB limit', async () => {
    let cancelled = 0;
    let released = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(DISCORD_MAX_BODY_BYTES));
        controller.enqueue(Uint8Array.of(0));
      },
      cancel() {
        cancelled += 1;
      },
    });
    const response = new Response(stream, { headers: { 'Content-Type': 'application/json' } });
    const body = response.body!;
    const originalGetReader = body.getReader.bind(body);
    Object.defineProperty(body, 'getReader', {
      value: () => {
        const reader = originalGetReader();
        const originalReleaseLock = reader.releaseLock.bind(reader);
        Object.defineProperty(reader, 'releaseLock', {
          value: () => {
            released += 1;
            originalReleaseLock();
          },
        });
        return reader;
      },
    });

    const error = await captureWorkerError(readBoundedJson(response));

    expectCode(error, 'DISCORD_RESPONSE_TOO_LARGE');
    expect(cancelled).toBe(1);
    expect(released).toBe(1);
  });

  it.each([
    ['missing media type', undefined, '{}'],
    ['text media type', 'text/plain', '{}'],
    ['empty body', 'application/json', ''],
    ['whitespace body', 'application/json', '  \r\n '],
    ['invalid JSON', 'application/json', `{${PRIVATE_BODY}`],
  ])('rejects a successful response with %s', async (_case, mediaType, body) => {
    const headers = mediaType === undefined ? undefined : { 'Content-Type': mediaType };
    const error = await captureWorkerError(readBoundedJson(new Response(body, { headers })));

    expectCode(error, 'DISCORD_RESPONSE_INVALID');
    expectValueFree(error);
  });

  it('rejects malformed UTF-8 instead of replacing invalid bytes', async () => {
    const error = await captureWorkerError(
      readBoundedJson(
        new Response(Uint8Array.of(0xc3, 0x28), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    expectCode(error, 'DISCORD_RESPONSE_INVALID');
  });

  it.each(['application/json', 'Application/JSON; Charset=UTF-8', 'application/problem+json'])(
    'accepts strict JSON media type %s',
    async (mediaType) => {
      await expect(
        readBoundedJson(new Response('{"safe":true}', { headers: { 'Content-Type': mediaType } })),
      ).resolves.toEqual({ safe: true });
    },
  );

  it('rejects a media type with an extra slash before the structured JSON suffix', async () => {
    const error = await captureWorkerError(
      readBoundedJson(
        new Response('{"safe":true}', {
          headers: { 'Content-Type': 'application/not/a-type+json' },
        }),
      ),
    );

    expectCode(error, 'DISCORD_RESPONSE_INVALID');
  });

  it('releases the acquired stream reader after success, parse failure, and stream failure', async () => {
    const releases: number[] = [];
    const responses = [
      new Response('{"safe":true}', { headers: { 'Content-Type': 'application/json' } }),
      new Response('{', { headers: { 'Content-Type': 'application/json' } }),
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.error(new Error(PRIVATE_NETWORK_DETAIL));
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    ];
    for (const [index, response] of responses.entries()) {
      const body = response.body!;
      const originalGetReader = body.getReader.bind(body);
      Object.defineProperty(body, 'getReader', {
        value: () => {
          const reader = originalGetReader();
          const originalReleaseLock = reader.releaseLock.bind(reader);
          vi.spyOn(reader, 'releaseLock').mockImplementation(() => {
            releases.push(index);
            originalReleaseLock();
          });
          return reader;
        },
      });
    }

    await expect(readBoundedJson(responses[0]!)).resolves.toEqual({ safe: true });
    expectCode(
      await captureWorkerError(readBoundedJson(responses[1]!)),
      'DISCORD_RESPONSE_INVALID',
    );
    expectCode(
      await captureWorkerError(readBoundedJson(responses[2]!)),
      'DISCORD_RESPONSE_INVALID',
    );

    expect(releases).toEqual([0, 1, 2]);
  });

  it('stops without another endpoint when a successful source body violates its schema', async () => {
    const queued = createQueuedFetch([
      jsonResponse({ id: 'not-a-snowflake', private: PRIVATE_BODY }),
    ]);
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: createDependencies(queued.fetch),
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, 'DISCORD_SOURCE_INVALID');
    expect(queued.requests).toHaveLength(1);
    expectValueFree(error);
  });
});

describe('Discord REST timeout and timer lifecycle', () => {
  it('keeps the attempt timer active until the response body finishes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const raw = createRawDiscordResponses();
    const remaining = sourceResponses().slice(1);
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      if (calls > 1) return remaining.shift()!;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            setTimeout(() => {
              controller.enqueue(new TextEncoder().encode(JSON.stringify(raw.bot)));
              controller.close();
            }, 1_000);
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    };
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(fetch),
        now: Date.now,
      },
    });

    const pending = client.fetchGuildSource(TEST_IDS.guild);
    await vi.advanceTimersByTimeAsync(0);
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toEqual(createValidatedDiscordSourceFixture());

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(4);
  });

  it('prioritizes the total deadline before parsing a response that arrives too late', async () => {
    let clock = 0;
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      clock = DISCORD_SYNC_BUDGET_MS + 1;
      return jsonResponse({ id: 'not-a-snowflake', private: PRIVATE_BODY });
    };
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(fetch),
        now: () => clock,
      },
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, 'SYNC_TIMEOUT');
    expect(calls).toBe(1);
    expectValueFree(error);
  });

  it('maps a fetch aborted at ten seconds to a request timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const fetch: FetchLike = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('private', 'AbortError')),
        );
      });
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(fetch),
        now: Date.now,
      },
    });

    const pending = captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));
    await vi.advanceTimersByTimeAsync(DISCORD_REQUEST_TIMEOUT_MS);
    const error = await pending;

    expectCode(error, 'DISCORD_REQUEST_TIMEOUT');
    expectValueFree(error);
  });

  it('uses the original deadline for later endpoints instead of resetting the budget', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const raw = createRawDiscordResponses();
    let calls = 0;
    const fetch: FetchLike = async (_input, init) => {
      calls += 1;
      if (calls === 1) {
        vi.setSystemTime(DISCORD_SYNC_BUDGET_MS - 5_000);
        return jsonResponse(raw.bot);
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('private', 'AbortError')),
        );
      });
    };
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: {
        ...createDependencies(fetch),
        now: Date.now,
      },
    });

    const pending = captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    const error = await pending;

    expectCode(error, 'SYNC_TIMEOUT');
    expect(calls).toBe(2);
  });

  it.each(['success', 'network rejection', 'abort'] as const)(
    'clears every attempt timer after %s',
    async (outcome) => {
      if (outcome === 'abort') {
        vi.useFakeTimers();
        vi.setSystemTime(0);
      }
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      let calls = 0;
      const rawResponses = sourceResponses();
      const fetch: FetchLike = async (_input, init) => {
        calls += 1;
        if (outcome === 'success') return rawResponses.shift()!;
        if (outcome === 'network rejection') throw new Error(PRIVATE_NETWORK_DETAIL);
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('private', 'AbortError')),
          );
        });
      };
      const client = createDiscordRestClient({
        botToken: TEST_TOKEN,
        dependencies: {
          ...createDependencies(fetch),
          now: outcome === 'abort' ? Date.now : () => 0,
        },
      });

      const pending =
        outcome === 'success'
          ? client.fetchGuildSource(TEST_IDS.guild)
          : captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));
      if (outcome === 'abort') await vi.advanceTimersByTimeAsync(DISCORD_REQUEST_TIMEOUT_MS);
      if (outcome === 'success') await expect(pending).resolves.toBeDefined();
      else await pending;

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(calls);
    },
  );
});

describe('Worker error privacy', () => {
  it('exposes only a stable code and never retains upstream values or objects', async () => {
    const response = new Response(`${PRIVATE_BODY} ${TEST_IDS.owner}`, { status: 401 });
    const queued = createQueuedFetch([response]);
    const client = createDiscordRestClient({
      botToken: TEST_TOKEN,
      dependencies: createDependencies(queued.fetch),
    });

    const error = await captureWorkerError(client.fetchGuildSource(TEST_IDS.guild));

    expectCode(error, 'DISCORD_UNAUTHORIZED');
    expectValueFree(error);
    expect(JSON.stringify(error)).toBe('{"code":"DISCORD_UNAUTHORIZED","name":"WorkerError"}');
    expect(Object.values(error)).not.toContain(response);
  });
});
