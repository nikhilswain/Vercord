import { readBoundedJson } from '../discord/read-json';

export class ChannelActionError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

/** Writes are never automatically retried: a failed response may hide an accepted action. */
export async function mutateDiscordChannel(
  botToken: string,
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  userId: string,
  body?: Record<string, unknown>,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    let response: Response;
    try {
      response = await fetch(`https://discord.com/api/v10${path}`, {
        method,
        headers: {
          authorization: `Bot ${botToken}`,
          'content-type': 'application/json',
          'X-Audit-Log-Reason': encodeURIComponent(
            `Dmap channel action requested by member ${userId}`,
          ),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ChannelActionError('CHANNEL_ACTION_UNCERTAIN', 504);
    }
    if (response.ok) return;
    if (response.status >= 500) throw new ChannelActionError('CHANNEL_ACTION_UNCERTAIN', 502);
    if (response.status === 429) throw new ChannelActionError('CHANNEL_RATE_LIMITED', 429);
    if (response.status === 401 || response.status === 403) {
      throw new ChannelActionError('CHANNEL_BOT_FORBIDDEN', 403);
    }
    if (response.status === 404) throw new ChannelActionError('CHANNEL_NOT_FOUND', 404);
    let discordCode: unknown;
    try {
      const value = await readBoundedJson(response);
      discordCode =
        typeof value === 'object' && value !== null && 'code' in value ? value.code : null;
    } catch {
      /* Do not expose provider response bodies. */
    }
    throw new ChannelActionError(
      discordCode === 30013 ? 'CHANNEL_LIMIT_REACHED' : 'CHANNEL_CHANGE_REJECTED',
      400,
    );
  } finally {
    clearTimeout(timer);
  }
}
