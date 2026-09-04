import { channelStateSchema, type ChannelState } from '../../domain/channels/protocol';

export class ChannelApiError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryAfterMs = 0,
  ) {
    super(code);
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

async function channelRequest(
  guildId: string,
  roomKey: string | null,
  method: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(
      `/api/auth/guilds/${encodeURIComponent(guildId)}/channels${roomKey === null ? '' : `/${encodeURIComponent(roomKey)}`}`,
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
      method === 'GET' ? 'CHANNELS_UNAVAILABLE' : 'CHANNEL_ACTION_UNCERTAIN',
    );
  }
  let value: unknown;
  try {
    value = (await response.json()) as unknown;
  } catch {
    throw new ChannelApiError(
      method === 'GET' ? 'CHANNELS_UNAVAILABLE' : 'CHANNEL_ACTION_UNCERTAIN',
    );
  }
  if (!response.ok) {
    const code =
      typeof value === 'object' &&
      value !== null &&
      'error' in value &&
      typeof value.error === 'object' &&
      value.error !== null &&
      'code' in value.error &&
      typeof value.error.code === 'string'
        ? value.error.code
        : 'CHANNELS_UNAVAILABLE';
    const seconds = Number(response.headers.get('retry-after'));
    const retryAfterMs =
      Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3_600) * 1_000 : 0;
    throw new ChannelApiError(code, retryAfterMs);
  }
  return value;
}

export async function fetchChannelState(
  guildId: string,
  signal?: AbortSignal,
): Promise<ChannelState> {
  return channelStateSchema.parse(await channelRequest(guildId, null, 'GET', undefined, signal));
}

export async function mutateChannel(
  guildId: string,
  roomKey: string | null,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
): Promise<void> {
  const value = await channelRequest(guildId, roomKey, method, body);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('status' in value) ||
    value.status !== 'applied'
  ) {
    throw new ChannelApiError('CHANNEL_ACTION_UNCERTAIN');
  }
}
