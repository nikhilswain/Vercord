const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';
const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const OAUTH_SCOPES = ['identify', 'guilds', 'guilds.members.read'] as const;
const REQUEST_TIMEOUT_MS = 10_000;

export interface DiscordOAuthToken {
  accessToken: string;
  refreshToken: string | null;
  tokenType: 'Bearer';
  scope: string;
  expiresIn: number;
}

export interface DiscordOAuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarHash: string | null;
}

export interface DiscordOAuthGuild {
  id: string;
  name: string;
  iconHash: string | null;
  owner: boolean;
  permissions: string;
}

export interface DiscordOAuthGuildMember {
  roleIds: string[];
}

interface DiscordOAuthClientOptions {
  clientId: string;
  clientSecret: string;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('AUTH_PROVIDER_RESPONSE_INVALID');
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, minimumLength: number, maximumLength: number): string {
  if (typeof value !== 'string' || value.length < minimumLength || value.length > maximumLength) {
    throw new Error('AUTH_PROVIDER_RESPONSE_INVALID');
  }
  return value;
}

async function discordRequest(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const code =
        response.status === 401
          ? 'AUTH_PROVIDER_UNAUTHORIZED'
          : response.status === 403
            ? 'AUTH_PROVIDER_FORBIDDEN'
            : response.status === 404
              ? 'AUTH_PROVIDER_NOT_FOUND'
              : 'AUTH_PROVIDER_FAILED';
      throw new Error(code);
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
    if (contentType !== 'application/json') throw new Error('AUTH_PROVIDER_RESPONSE_INVALID');
    return (await response.json()) as unknown;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('AUTH_PROVIDER_TIMEOUT', { cause: error });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseToken(value: unknown): DiscordOAuthToken {
  const record = objectValue(value);
  const accessToken = requiredString(record.access_token, 20, 2_048);
  const tokenType = requiredString(record.token_type, 1, 32);
  const scope = requiredString(record.scope, 1, 512);
  const expiresIn = record.expires_in;
  if (
    tokenType.toLowerCase() !== 'bearer' ||
    typeof expiresIn !== 'number' ||
    !Number.isSafeInteger(expiresIn) ||
    expiresIn < 60 ||
    expiresIn > 31_536_000
  ) {
    throw new Error('AUTH_PROVIDER_RESPONSE_INVALID');
  }

  const grantedScopes = new Set(scope.split(/\s+/u));
  if (OAUTH_SCOPES.some((scopeName) => !grantedScopes.has(scopeName))) {
    throw new Error('AUTH_SCOPE_MISSING');
  }

  return {
    accessToken,
    refreshToken:
      record.refresh_token === undefined || record.refresh_token === null
        ? null
        : requiredString(record.refresh_token, 20, 2_048),
    tokenType: 'Bearer',
    scope,
    expiresIn,
  };
}

function parseUser(value: unknown): DiscordOAuthUser {
  const record = objectValue(value);
  const id = requiredString(record.id, 1, 20);
  if (!/^\d+$/u.test(id)) throw new Error('AUTH_PROVIDER_RESPONSE_INVALID');
  const username = requiredString(record.username, 1, 100);
  const globalName =
    record.global_name === null || record.global_name === undefined
      ? null
      : requiredString(record.global_name, 1, 100);
  const avatarHash =
    record.avatar === null || record.avatar === undefined
      ? null
      : requiredString(record.avatar, 1, 128);
  return { id, username, displayName: globalName ?? username, avatarHash };
}

function parseGuilds(value: unknown): DiscordOAuthGuild[] {
  if (!Array.isArray(value) || value.length > 200) {
    throw new Error('AUTH_PROVIDER_RESPONSE_INVALID');
  }
  return value.map((entry) => {
    const record = objectValue(entry);
    const id = requiredString(record.id, 1, 20);
    const permissions = requiredString(record.permissions, 1, 32);
    if (!/^\d+$/u.test(id) || !/^\d+$/u.test(permissions) || typeof record.owner !== 'boolean') {
      throw new Error('AUTH_PROVIDER_RESPONSE_INVALID');
    }
    return {
      id,
      name: requiredString(record.name, 1, 100),
      iconHash:
        record.icon === null || record.icon === undefined
          ? null
          : requiredString(record.icon, 1, 128),
      owner: record.owner,
      permissions,
    };
  });
}

function parseGuildMember(value: unknown): DiscordOAuthGuildMember {
  const record = objectValue(value);
  if (!Array.isArray(record.roles) || record.roles.length > 250) {
    throw new Error('AUTH_PROVIDER_RESPONSE_INVALID');
  }
  const roleIds = record.roles.map((value) => {
    const roleId = requiredString(value, 1, 20);
    if (!/^\d+$/u.test(roleId)) throw new Error('AUTH_PROVIDER_RESPONSE_INVALID');
    return roleId;
  });
  if (new Set(roleIds).size !== roleIds.length) {
    throw new Error('AUTH_PROVIDER_RESPONSE_INVALID');
  }
  return { roleIds };
}

export function buildDiscordAuthorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(DISCORD_AUTHORIZE_URL);
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('scope', OAUTH_SCOPES.join(' '));
  url.searchParams.set('state', options.state);
  return url.toString();
}

export function createDiscordOAuthClient(options: DiscordOAuthClientOptions) {
  async function tokenRequest(parameters: URLSearchParams): Promise<DiscordOAuthToken> {
    parameters.set('client_id', options.clientId);
    parameters.set('client_secret', options.clientSecret);
    return parseToken(
      await discordRequest(`${DISCORD_API_BASE_URL}/oauth2/token`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Dmap/0.1.0',
        },
        body: parameters,
      }),
    );
  }

  return {
    exchangeCode(code: string, redirectUri: string): Promise<DiscordOAuthToken> {
      return tokenRequest(
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      );
    },

    refresh(refreshToken: string): Promise<DiscordOAuthToken> {
      return tokenRequest(
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      );
    },

    async fetchUser(accessToken: string): Promise<DiscordOAuthUser> {
      return parseUser(
        await discordRequest(`${DISCORD_API_BASE_URL}/users/@me`, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'Dmap/0.1.0',
          },
        }),
      );
    },

    async fetchGuilds(accessToken: string): Promise<DiscordOAuthGuild[]> {
      return parseGuilds(
        await discordRequest(`${DISCORD_API_BASE_URL}/users/@me/guilds?limit=200`, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'Dmap/0.1.0',
          },
        }),
      );
    },

    async fetchGuildMember(accessToken: string, guildId: string): Promise<DiscordOAuthGuildMember> {
      return parseGuildMember(
        await discordRequest(
          `${DISCORD_API_BASE_URL}/users/@me/guilds/${encodeURIComponent(guildId)}/member`,
          {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${accessToken}`,
              'User-Agent': 'Dmap/0.1.0',
            },
          },
        ),
      );
    },
  };
}
