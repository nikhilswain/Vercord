import { parseAuthConfig, type AuthConfig } from '../auth/config';
import { clearCookie, readCookie, setCookie } from '../auth/cookies';
import {
  createOpaqueToken,
  decryptSessionValue,
  encryptSessionValue,
  hashOpaqueToken,
} from '../auth/crypto';
import {
  buildDiscordAuthorizeUrl,
  createDiscordOAuthClient,
  type DiscordOAuthGuild,
  type DiscordOAuthToken,
} from '../auth/discord-oauth';
import {
  createD1AuthRepository,
  type AuthRepository,
  type SessionRecord,
  type SessionTokenUpdate,
} from '../auth/repository';
import { createKvGuildStructureRepository } from '../storage/guild-structure-repository';
import { createKvPublicMapRepository } from '../storage/public-map-repository';
import { jsonResponse } from './json-response';

const OAUTH_STATE_LIFETIME_SECONDS = 10 * 60;
const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const TOKEN_REFRESH_WINDOW_SECONDS = 60;
const DISCORD_START_PATH = '/api/auth/discord/start';
const DISCORD_CALLBACK_PATH = '/api/auth/discord/callback';
const SESSION_PATH = '/api/auth/session';
const LOGOUT_PATH = '/api/auth/logout';
const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

interface WorldAvailability {
  privateReady: boolean;
  publicReady: boolean;
}

function noStoreJson(body: unknown, status = 200): Response {
  return jsonResponse(body, { status }, { noStore: true });
}

function authError(code: string, status: number): Response {
  return noStoreJson({ error: { code } }, status);
}

function redirectResponse(location: string, status: 302 | 303, cookies: string[] = []): Response {
  const headers = new Headers({
    'cache-control': 'no-store',
    location,
    'referrer-policy': 'no-referrer',
  });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status, headers });
}

function redirectUri(request: Request): string {
  return `${new URL(request.url).origin}${DISCORD_CALLBACK_PATH}`;
}

function safeReturnTo(value: string | null): string {
  if (value === null || value.length > 256 || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }
  try {
    const parsed = new URL(value, 'https://dmap.invalid');
    if (parsed.origin !== 'https://dmap.invalid' || parsed.pathname !== '/dashboard') {
      return '/dashboard';
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return '/dashboard';
  }
}

function avatarUrl(userId: string, avatarHash: string | null): string | null {
  return avatarHash === null
    ? null
    : `https://cdn.discordapp.com/avatars/${encodeURIComponent(userId)}/${encodeURIComponent(avatarHash)}.png?size=128`;
}

function guildIconUrl(guild: DiscordOAuthGuild): string | null {
  return guild.iconHash === null
    ? null
    : `https://cdn.discordapp.com/icons/${encodeURIComponent(guild.id)}/${encodeURIComponent(guild.iconHash)}.png?size=128`;
}

function canManageGuild(guild: DiscordOAuthGuild): boolean {
  const permissions = BigInt(guild.permissions);
  return (
    guild.owner ||
    (permissions & ADMINISTRATOR) === ADMINISTRATOR ||
    (permissions & MANAGE_GUILD) === MANAGE_GUILD
  );
}

async function encryptedTokenUpdate(
  token: DiscordOAuthToken,
  sessionSecret: Uint8Array,
  now: number,
  fallbackRefreshToken: string | null = null,
): Promise<SessionTokenUpdate> {
  const accessToken = await encryptSessionValue(token.accessToken, sessionSecret);
  const refreshTokenValue = token.refreshToken ?? fallbackRefreshToken;
  const refreshToken =
    refreshTokenValue === null ? null : await encryptSessionValue(refreshTokenValue, sessionSecret);
  return {
    accessTokenCiphertext: accessToken.ciphertext,
    accessTokenIv: accessToken.iv,
    refreshTokenCiphertext: refreshToken?.ciphertext ?? null,
    refreshTokenIv: refreshToken?.iv ?? null,
    tokenType: token.tokenType,
    scope: token.scope,
    tokenExpiresAt: now + token.expiresIn,
  };
}

async function currentAccessToken(
  session: SessionRecord,
  config: AuthConfig,
  repository: AuthRepository,
  now: number,
): Promise<string> {
  if (session.tokenExpiresAt > now + TOKEN_REFRESH_WINDOW_SECONDS) {
    try {
      return await decryptSessionValue(
        { ciphertext: session.accessTokenCiphertext, iv: session.accessTokenIv },
        config.sessionSecret,
      );
    } catch {
      throw new Error('AUTH_SESSION_INVALID');
    }
  }

  if (session.refreshTokenCiphertext === null || session.refreshTokenIv === null) {
    throw new Error('AUTH_SESSION_EXPIRED');
  }
  let refreshToken: string;
  try {
    refreshToken = await decryptSessionValue(
      { ciphertext: session.refreshTokenCiphertext, iv: session.refreshTokenIv },
      config.sessionSecret,
    );
  } catch {
    throw new Error('AUTH_SESSION_INVALID');
  }
  const token = await createDiscordOAuthClient(config).refresh(refreshToken);
  const update = await encryptedTokenUpdate(token, config.sessionSecret, now, refreshToken);
  await repository.updateSessionTokens(session.idHash, update);
  return token.accessToken;
}

async function readWorldAvailability(env: Env, slug: string): Promise<WorldAvailability> {
  if (typeof env.MAP_SNAPSHOTS?.get !== 'function') {
    return { privateReady: false, publicReady: false };
  }
  try {
    const [privateMap, publicMap] = await Promise.all([
      createKvGuildStructureRepository(env.MAP_SNAPSHOTS).read(slug),
      createKvPublicMapRepository(env.MAP_SNAPSHOTS).read(slug),
    ]);
    return {
      privateReady: privateMap.state === 'valid',
      publicReady: publicMap.state === 'valid',
    };
  } catch {
    return { privateReady: false, publicReady: false };
  }
}

async function handleDiscordStart(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return authError('METHOD_NOT_ALLOWED', 405);
  try {
    const config = parseAuthConfig(env);
    const state = createOpaqueToken();
    const now = Math.floor(Date.now() / 1_000);
    const returnTo = safeReturnTo(new URL(request.url).searchParams.get('return_to'));
    await createD1AuthRepository(config.database).createOAuthState({
      stateHash: await hashOpaqueToken(state),
      returnTo,
      createdAt: now,
      expiresAt: now + OAUTH_STATE_LIFETIME_SECONDS,
    });
    return redirectResponse(
      buildDiscordAuthorizeUrl({
        clientId: config.clientId,
        redirectUri: redirectUri(request),
        state,
      }),
      302,
      [setCookie(request, 'oauth', state, OAUTH_STATE_LIFETIME_SECONDS)],
    );
  } catch {
    return redirectResponse('/dashboard?auth=unavailable', 303);
  }
}

async function handleDiscordCallback(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return authError('METHOD_NOT_ALLOWED', 405);
  const clearState = clearCookie(request, 'oauth');
  const url = new URL(request.url);
  if (url.searchParams.has('error')) {
    return redirectResponse('/dashboard?auth=cancelled', 303, [clearState]);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = readCookie(request, 'oauth');
  if (
    code === null ||
    code.length < 3 ||
    code.length > 2_048 ||
    state === null ||
    !/^[A-Za-z0-9_-]{43}$/u.test(state) ||
    cookieState !== state
  ) {
    return redirectResponse('/dashboard?auth=invalid', 303, [clearState]);
  }

  try {
    const config = parseAuthConfig(env);
    const repository = createD1AuthRepository(config.database);
    const now = Math.floor(Date.now() / 1_000);
    const returnTo = await repository.consumeOAuthState(await hashOpaqueToken(state), now);
    if (returnTo === null) {
      return redirectResponse('/dashboard?auth=invalid', 303, [clearState]);
    }

    const discord = createDiscordOAuthClient(config);
    const token = await discord.exchangeCode(code, redirectUri(request));
    const user = await discord.fetchUser(token.accessToken);
    const sessionId = createOpaqueToken();
    const tokenUpdate = await encryptedTokenUpdate(token, config.sessionSecret, now);
    await repository.createSession({
      idHash: await hashOpaqueToken(sessionId),
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarHash: user.avatarHash,
      ...tokenUpdate,
      sessionExpiresAt: now + SESSION_LIFETIME_SECONDS,
      createdAt: now,
      lastSeenAt: now,
    });
    return redirectResponse(returnTo, 303, [
      setCookie(request, 'session', sessionId, SESSION_LIFETIME_SECONDS),
      clearState,
    ]);
  } catch {
    return redirectResponse('/dashboard?auth=failed', 303, [clearState]);
  }
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return authError('METHOD_NOT_ALLOWED', 405);
  const sessionId = readCookie(request, 'session');
  if (sessionId === null) return authError('UNAUTHENTICATED', 401);

  let repository: AuthRepository | null = null;
  let idHash: string | null = null;
  try {
    const config = parseAuthConfig(env);
    repository = createD1AuthRepository(config.database);
    idHash = await hashOpaqueToken(sessionId);
    const session = await repository.readSession(idHash);
    const now = Math.floor(Date.now() / 1_000);
    if (session === null || session.sessionExpiresAt <= now) {
      if (session !== null) await repository.deleteSession(idHash);
      return authError('UNAUTHENTICATED', 401);
    }

    const accessToken = await currentAccessToken(session, config, repository, now);
    const [guilds, availability] = await Promise.all([
      createDiscordOAuthClient(config).fetchGuilds(accessToken),
      readWorldAvailability(env, config.mapSlug),
    ]);
    await repository.touchSession(idHash, now);

    const isLoopback = loopbackHosts.has(new URL(request.url).hostname);
    const projectedGuilds = guilds
      .map((guild) => {
        const manageable = canManageGuild(guild);
        const connected = guild.id === config.guildId;
        const worldUrl =
          connected && availability.privateReady && manageable && isLoopback
            ? `/preview/${config.mapSlug}`
            : connected && availability.publicReady
              ? `/map/${config.mapSlug}`
              : null;
        return {
          id: guild.id,
          name: guild.name,
          iconUrl: guildIconUrl(guild),
          owner: guild.owner,
          canManage: manageable,
          connected,
          synced: connected && availability.privateReady,
          published: connected && availability.publicReady,
          worldUrl,
        };
      })
      .sort((left, right) => {
        if (left.connected !== right.connected) return left.connected ? -1 : 1;
        if (left.canManage !== right.canManage) return left.canManage ? -1 : 1;
        return left.name.localeCompare(right.name);
      });

    const response = noStoreJson({
      user: {
        id: session.userId,
        username: session.username,
        displayName: session.displayName,
        avatarUrl: avatarUrl(session.userId, session.avatarHash),
      },
      guilds: projectedGuilds,
    });
    response.headers.set('vary', 'cookie');
    return response;
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : '';
    const invalidSession = new Set([
      'AUTH_PROVIDER_UNAUTHORIZED',
      'AUTH_SESSION_EXPIRED',
      'AUTH_SESSION_INVALID',
    ]).has(errorCode);
    if (invalidSession && repository !== null && idHash !== null) {
      try {
        await repository.deleteSession(idHash);
      } catch {
        // Session cleanup is best effort; the response remains unauthenticated.
      }
    }
    const response = authError(
      invalidSession ? 'UNAUTHENTICATED' : 'AUTH_UNAVAILABLE',
      invalidSession ? 401 : 503,
    );
    if (invalidSession) response.headers.append('set-cookie', clearCookie(request, 'session'));
    return response;
  }
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return authError('METHOD_NOT_ALLOWED', 405);
  const sessionId = readCookie(request, 'session');
  if (sessionId !== null) {
    try {
      const config = parseAuthConfig(env);
      await createD1AuthRepository(config.database).deleteSession(await hashOpaqueToken(sessionId));
    } catch {
      // Clearing the browser session still completes logout if storage is unavailable.
    }
  }

  const clearSession = clearCookie(request, 'session');
  if (request.headers.get('accept')?.includes('application/json')) {
    const response = new Response(null, { status: 204 });
    response.headers.set('cache-control', 'no-store');
    response.headers.append('set-cookie', clearSession);
    return response;
  }
  return redirectResponse('/', 303, [clearSession]);
}

export function handleAuth(request: Request, env: Env, pathname: string): Promise<Response> {
  switch (pathname) {
    case DISCORD_START_PATH:
      return handleDiscordStart(request, env);
    case DISCORD_CALLBACK_PATH:
      return handleDiscordCallback(request, env);
    case SESSION_PATH:
      return handleSession(request, env);
    case LOGOUT_PATH:
      return handleLogout(request, env);
    default:
      return Promise.resolve(authError('NOT_FOUND', 404));
  }
}
