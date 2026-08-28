import { DiscordDomainError } from '../../src/domain/discord/errors';
import {
  parseDiscordBot,
  parseDiscordBotMember,
  parseDiscordChannels,
  parseDiscordGuild,
  validateDiscordSourceBundle,
} from '../../src/domain/discord/source-schema';
import type { DiscordSourceBundle } from '../../src/domain/discord/source';
import { WorkerError } from '../errors';
import {
  DISCORD_MAX_RATE_LIMIT_MS,
  DISCORD_MAX_RETRIES,
  DISCORD_REQUEST_TIMEOUT_MS,
  DISCORD_SYNC_BUDGET_MS,
  readBoundedJson,
} from './read-json';

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface DiscordClientDependencies {
  fetch: FetchLike;
  sleep(milliseconds: number): Promise<void>;
  now(): number;
  random(): number;
}

export interface DiscordRestClient {
  fetchGuildSource(guildId: string): Promise<DiscordSourceBundle>;
}

export function createDiscordRestClient(options: {
  botToken: string;
  dependencies?: Partial<DiscordClientDependencies>;
}): DiscordRestClient {
  const dependencies: DiscordClientDependencies = {
    fetch: options.dependencies?.fetch ?? globalThis.fetch.bind(globalThis),
    sleep:
      options.dependencies?.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
    now: options.dependencies?.now ?? Date.now,
    random: options.dependencies?.random ?? Math.random,
  };

  async function sleepBeforeRetry(milliseconds: number, deadline: number): Promise<void> {
    if (milliseconds > deadline - dependencies.now()) {
      throw new WorkerError('SYNC_TIMEOUT');
    }
    await dependencies.sleep(milliseconds);
    if (dependencies.now() > deadline) throw new WorkerError('SYNC_TIMEOUT');
  }

  function retryBackoff(retryIndex: number): number {
    const lowerBound = Math.min(250 * 2 ** retryIndex, 2_000);
    const random = Math.max(0, Math.min(1, dependencies.random()));
    return Math.min(2_000, lowerBound + lowerBound * random);
  }

  function parseRateLimitSeconds(value: unknown, allowString: boolean): number | null {
    const headerValue = typeof value === 'string' ? value.trim() : null;
    if (headerValue !== null && (!allowString || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(headerValue))) {
      return null;
    }
    const seconds = headerValue === null ? value : Number(headerValue);
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
    if (seconds * 1_000 > DISCORD_MAX_RATE_LIMIT_MS) return null;
    return seconds;
  }

  async function rateLimitDelay(response: Response): Promise<number> {
    const header = response.headers.get('Retry-After');
    let seconds: number | null;
    if (header !== null) {
      seconds = parseRateLimitSeconds(header, true);
    } else {
      try {
        const body = await readBoundedJson(response);
        seconds = parseRateLimitSeconds(
          typeof body === 'object' && body !== null && !Array.isArray(body)
            ? (body as Record<string, unknown>).retry_after
            : undefined,
          false,
        );
      } catch {
        seconds = null;
      }
    }
    if (seconds === null) throw new WorkerError('DISCORD_RATE_LIMITED');
    return seconds * 1_000;
  }

  async function requestJson(path: string, deadline: number): Promise<unknown> {
    for (let attempt = 0; attempt <= DISCORD_MAX_RETRIES; attempt += 1) {
      const remainingBudget = deadline - dependencies.now();
      if (remainingBudget <= 0) throw new WorkerError('SYNC_TIMEOUT');

      const attemptTimeout = Math.min(DISCORD_REQUEST_TIMEOUT_MS, remainingBudget);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), attemptTimeout);
      let networkFailure = false;
      let retryDelay: number | undefined;
      try {
        let response: Response | undefined;
        try {
          response = await dependencies.fetch(`${DISCORD_API_BASE_URL}${path}`, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              Authorization: `Bot ${options.botToken}`,
              'User-Agent': 'Dmap/0.1.0',
            },
            signal: controller.signal,
          });
        } catch {
          networkFailure = true;
        }

        if (controller.signal.aborted) {
          throw new WorkerError(
            attemptTimeout < DISCORD_REQUEST_TIMEOUT_MS
              ? 'SYNC_TIMEOUT'
              : 'DISCORD_REQUEST_TIMEOUT',
          );
        }

        if (response !== undefined) {
          if (dependencies.now() >= deadline) throw new WorkerError('SYNC_TIMEOUT');

          if (response.status === 401) throw new WorkerError('DISCORD_UNAUTHORIZED');
          if (response.status === 403) throw new WorkerError('DISCORD_FORBIDDEN');
          if (response.status === 404) throw new WorkerError('DISCORD_NOT_FOUND');
          if (response.status === 429) {
            retryDelay = await rateLimitDelay(response);
            if (attempt === DISCORD_MAX_RETRIES) {
              throw new WorkerError('DISCORD_RATE_LIMITED');
            }
          } else if (response.status >= 500 && response.status <= 599) {
            if (attempt === DISCORD_MAX_RETRIES) {
              throw new WorkerError('DISCORD_UNAVAILABLE');
            }
            retryDelay = retryBackoff(attempt);
          } else {
            if (!response.ok) throw new WorkerError('DISCORD_RESPONSE_INVALID');
            const body = await readBoundedJson(response);
            if (dependencies.now() >= deadline) throw new WorkerError('SYNC_TIMEOUT');
            return body;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          throw new WorkerError(
            attemptTimeout < DISCORD_REQUEST_TIMEOUT_MS
              ? 'SYNC_TIMEOUT'
              : 'DISCORD_REQUEST_TIMEOUT',
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }

      if (networkFailure) {
        if (attempt === DISCORD_MAX_RETRIES) throw new WorkerError('DISCORD_UNAVAILABLE');
        retryDelay = retryBackoff(attempt);
      }
      await sleepBeforeRetry(retryDelay!, deadline);
    }
    throw new WorkerError('DISCORD_UNAVAILABLE');
  }

  async function fetchGuildSource(guildId: string): Promise<DiscordSourceBundle> {
    const deadline = dependencies.now() + DISCORD_SYNC_BUDGET_MS;
    try {
      const bot = parseDiscordBot(await requestJson('/users/@me', deadline));
      const guild = parseDiscordGuild(
        await requestJson(`/guilds/${encodeURIComponent(guildId)}`, deadline),
      );
      if (guild.id !== guildId) throw new DiscordDomainError('DISCORD_SOURCE_INVALID');
      const botMember = parseDiscordBotMember(
        await requestJson(
          `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(bot.id)}`,
          deadline,
        ),
      );
      const channels = parseDiscordChannels(
        await requestJson(`/guilds/${encodeURIComponent(guildId)}/channels`, deadline),
      );
      return validateDiscordSourceBundle({ bot, guild, botMember, channels }, guildId);
    } catch (error) {
      if (error instanceof DiscordDomainError && error.code === 'DISCORD_SOURCE_INVALID') {
        throw new WorkerError('DISCORD_SOURCE_INVALID');
      }
      throw error;
    }
  }

  return { fetchGuildSource };
}
