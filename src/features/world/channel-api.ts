import { z } from 'zod';

import {
  channelErrorCodeSchema,
  channelMutationResultSchema,
  worldViewSchema,
  type ChannelMutationResult,
  type WorldView,
} from '../../domain/channels/protocol';

export type ChannelApiErrorScope = 'admission' | 'mutation';

export class ChannelApiError extends Error {
  public readonly retryAfterMs: number;

  public constructor(
    public readonly code: string,
    public readonly retryAt = 0,
    public readonly scope?: ChannelApiErrorScope,
  ) {
    super(code);
    this.name = 'ChannelApiError';
    this.retryAfterMs = Math.max(0, retryAt - Date.now());
  }
}

export function channelErrorMessage(error: unknown): string {
  const code = error instanceof ChannelApiError ? error.code : '';
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'Your session ended. Sign in again before changing channels.';
    case 'GUILD_MEMBERSHIP_REQUIRED':
      return 'You no longer have access to this Discord server.';
    case 'CHANNEL_MEMBER_FORBIDDEN':
      return 'You need View Channel and Manage Channels here, and must not be timed out.';
    case 'CHANNEL_BOT_FORBIDDEN':
      return 'The Dmap bot needs permission to manage this channel. Ask a server manager to check its role.';
    case 'CHANNEL_NOT_FOUND':
      return 'This channel or category is no longer available. Refresh the channels.';
    case 'CHANNEL_CHANGED':
      return 'This channel was renamed in Discord. Refresh and check its new name before continuing.';
    case 'CHANNEL_RATE_LIMITED':
      return 'Discord is limiting requests. Wait before refreshing or changing channels again.';
    case 'CHANNEL_LIMIT_REACHED':
      return 'This server has reached Discord’s channel limit.';
    case 'CHANNEL_CHANGE_REJECTED':
      return 'Discord rejected this change. Check the name; required Community channels cannot be deleted.';
    case 'INVALID_REQUEST':
      return 'Use a channel name between 1 and 100 characters, without control characters.';
    case 'CHANNEL_ACTION_UNCERTAIN':
      return 'Discord may have applied the change. Check Discord and refresh before trying again to avoid a duplicate.';
    default:
      return 'Channel updates are unavailable. Refresh or try again shortly.';
  }
}

type ChannelResponse = {
  response: Response;
  value: unknown;
  parsed: boolean;
};

const mutationErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: channelErrorCodeSchema,
    retryAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    scope: z.enum(['admission', 'mutation']).optional(),
  }),
  requestId: z.uuid(),
});

function retryAfterDeadline(value: string | null, now: number): number {
  if (value === null || value.trim() === '') return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return now + seconds * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date) : 0;
}

function errorDetails(
  value: unknown,
  response: Response,
  fallbackCode: string,
  fallbackScope: ChannelApiErrorScope,
): ChannelApiError {
  const error =
    typeof value === 'object' && value !== null && 'error' in value
      ? (value.error as unknown)
      : null;
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : fallbackCode;
  const bodyRetryAt =
    typeof error === 'object' &&
    error !== null &&
    'retryAt' in error &&
    typeof error.retryAt === 'number' &&
    Number.isSafeInteger(error.retryAt) &&
    error.retryAt >= 0
      ? error.retryAt
      : 0;
  const scope =
    typeof error === 'object' &&
    error !== null &&
    'scope' in error &&
    (error.scope === 'admission' || error.scope === 'mutation')
      ? error.scope
      : fallbackScope;
  const now = Date.now();
  const retryAt =
    bodyRetryAt || retryAfterDeadline(response.headers.get('retry-after'), now);
  return new ChannelApiError(code, retryAt, scope);
}

async function channelRequest(
  guildId: string,
  roomKey: string | null,
  method: string,
  body: unknown,
  signal: AbortSignal | undefined,
  endpoint: 'channels' | 'presence',
): Promise<ChannelResponse> {
  let response: Response;
  try {
    response = await fetch(
      `/api/auth/guilds/${encodeURIComponent(guildId)}/${endpoint}${roomKey === null ? '' : `/${encodeURIComponent(roomKey)}`}`,
      {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(45_000)])
          : AbortSignal.timeout(45_000),
        headers:
          body === undefined
            ? { accept: 'application/json' }
            : { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ChannelApiError(
      method === 'GET' ? 'WORLD_SOURCE_UNAVAILABLE' : 'CHANNEL_ACTION_UNCERTAIN',
      0,
      endpoint === 'presence' ? 'admission' : method === 'GET' ? 'admission' : 'mutation',
    );
  }

  try {
    return { response, value: (await response.json()) as unknown, parsed: true };
  } catch {
    return { response, value: undefined, parsed: false };
  }
}

async function readWorld(
  guildId: string,
  endpoint: 'channels' | 'presence',
  signal?: AbortSignal,
): Promise<WorldView> {
  const result = await channelRequest(guildId, null, 'GET', undefined, signal, endpoint);
  if (!result.response.ok) {
    throw errorDetails(result.value, result.response, 'WORLD_SOURCE_UNAVAILABLE', 'admission');
  }
  const value = endpoint === 'presence' ? admissionResponse(result.value) : result.value;
  const parsed = worldViewSchema.safeParse(value);
  if (!result.parsed || !parsed.success) {
    throw new ChannelApiError('WORLD_SOURCE_UNAVAILABLE', 0, 'admission');
  }
  return parsed.data;
}

function admissionResponse(value: unknown): unknown {
  return typeof value === 'object' && value !== null && 'view' in value ? value.view : undefined;
}

export function fetchChannelState(guildId: string, signal?: AbortSignal): Promise<WorldView> {
  return readWorld(guildId, 'channels', signal);
}

export function fetchWorldAdmission(guildId: string, signal?: AbortSignal): Promise<WorldView> {
  return readWorld(guildId, 'presence', signal);
}

export async function mutateChannel(
  guildId: string,
  roomKey: string | null,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
): Promise<ChannelMutationResult> {
  let result: ChannelResponse;
  try {
    result = await channelRequest(guildId, roomKey, method, body, undefined, 'channels');
  } catch (error) {
    if (error instanceof ChannelApiError && error.code !== 'CHANNEL_ACTION_UNCERTAIN') throw error;
    return uncertainMutation();
  }

  const mutation = channelMutationResultSchema.safeParse(result.value);
  if (mutation.success) return mutation.data;
  if (!result.response.ok && result.parsed) {
    const structured = mutationErrorResponseSchema.safeParse(result.value);
    if (structured.success) {
      const { code, retryAt: bodyRetryAt } = structured.data.error;
      if (code === 'CHANNEL_ACTION_UNCERTAIN') {
        return { status: 'uncertain', requestId: structured.data.requestId, code };
      }
      const retryAt =
        bodyRetryAt ?? retryAfterDeadline(result.response.headers.get('retry-after'), Date.now());
      return {
        status: 'rejected',
        requestId: structured.data.requestId,
        code,
        ...(retryAt > 0 ? { retryAt } : {}),
      };
    }
    throw errorDetails(result.value, result.response, 'CHANNELS_UNAVAILABLE', 'mutation');
  }
  return uncertainMutation();
}

function uncertainMutation(): ChannelMutationResult {
  return {
    status: 'uncertain',
    requestId: crypto.randomUUID(),
    code: 'CHANNEL_ACTION_UNCERTAIN',
  };
}
