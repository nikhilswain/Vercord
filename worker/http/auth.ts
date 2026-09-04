import { avatarIdForDiscordUser } from '../../src/domain/avatar/identity';
import { DiscordDomainError } from '../../src/domain/discord/errors';
import { createIdentifierFactory } from '../../src/domain/discord/identifiers';
import { z } from 'zod';
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
import { decodeBase64UrlSecret } from '../config/runtime';
import { parseDiscordSourceConfig } from '../config/schema';
import { createDiscordRestClient } from '../discord/client';
import { WorkerError } from '../errors';
import { createMemberMapSnapshot } from '../publication/create-public-map';
import { createKvGuildStructureRepository } from '../storage/guild-structure-repository';
import { createKvPublicMapRepository } from '../storage/public-map-repository';
import { synchronizePrivateGuild } from '../sync/synchronize-private-guild';
import { createD1WorldRepository } from '../worlds/repository';
import { jsonResponse } from './json-response';
import { sendDiscordGatewayCommand } from '../voice/bridge-client';
import { resolveMappedVoiceDestination } from '../voice/destination';
import { publicVoiceErrorFor } from '../voice/public-errors';

const OAUTH_STATE_LIFETIME_SECONDS = 10 * 60;
const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const TOKEN_REFRESH_WINDOW_SECONDS = 60;
const DISCORD_START_PATH = '/api/auth/discord/start';
const DISCORD_CALLBACK_PATH = '/api/auth/discord/callback';
const SESSION_PATH = '/api/auth/session';
const LOGOUT_PATH = '/api/auth/logout';
const GUILD_SYNC_PATH = /^\/api\/auth\/guilds\/([1-9]\d{0,19})\/sync$/u;
const GUILD_MAP_PATH = /^\/api\/auth\/guilds\/([1-9]\d{0,19})\/map$/u;
const GUILD_PRESENCE_PATH = /^\/api\/auth\/guilds\/([1-9]\d{0,19})\/presence$/u;
const GUILD_VOICE_PATH = /^\/api\/auth\/guilds\/([1-9]\d{0,19})\/voice$/u;
const GUILD_VOICE_MOVE_PATH = /^\/api\/auth\/guilds\/([1-9]\d{0,19})\/voice\/move$/u;
const GUILD_VOICE_DISCONNECT_PATH = /^\/api\/auth\/guilds\/([1-9]\d{0,19})\/voice\/disconnect$/u;
const WORLD_PAGE_PATH = /^\/world\/[1-9]\d{0,19}$/u;
const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const activeGuildSyncs = new Set<string>();
const voiceMoveBodySchema = z.strictObject({
  roomKey: z.string().regex(/^c_[A-Za-z0-9_-]{43}$/u),
});

const SYNC_STATUS_BY_CODE = {
  CONFIG_INVALID: 500,
  DISCORD_SOURCE_INVALID: 502,
  SNAPSHOT_INVALID: 500,
  DISCORD_UNAUTHORIZED: 502,
  DISCORD_FORBIDDEN: 502,
  DISCORD_NOT_FOUND: 502,
  DISCORD_RATE_LIMITED: 503,
  DISCORD_UNAVAILABLE: 503,
  DISCORD_RESPONSE_INVALID: 502,
  DISCORD_RESPONSE_TOO_LARGE: 502,
  DISCORD_REQUEST_TIMEOUT: 504,
  SYNC_TIMEOUT: 504,
  SNAPSHOT_READ_FAILED: 503,
  SNAPSHOT_WRITE_FAILED: 503,
  SUSPICIOUS_EMPTY_SNAPSHOT: 409,
  SYNC_IN_PROGRESS: 409,
} as const;

interface WorldAvailability {
  privateReady: boolean;
  publicReady: boolean;
}

interface GuildWorldAvailability extends WorldAvailability {
  slug: string;
}

interface AuthenticatedSession {
  config: AuthConfig;
  repository: AuthRepository;
  idHash: string;
  session: SessionRecord;
  accessToken: string;
  now: number;
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
    if (
      parsed.origin !== 'https://dmap.invalid' ||
      (parsed.pathname !== '/dashboard' && !WORLD_PAGE_PATH.test(parsed.pathname))
    ) {
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

function isInvalidSessionError(error: unknown): boolean {
  const code = error instanceof Error ? error.message : '';
  return new Set([
    'AUTH_PROVIDER_UNAUTHORIZED',
    'AUTH_SESSION_EXPIRED',
    'AUTH_SESSION_INVALID',
  ]).has(code);
}

async function resolveAuthenticatedSession(
  request: Request,
  env: Env,
): Promise<AuthenticatedSession | null> {
  const sessionId = readCookie(request, 'session');
  if (sessionId === null) return null;

  const config = parseAuthConfig(env);
  const repository = createD1AuthRepository(config.database);
  const idHash = await hashOpaqueToken(sessionId);
  const session = await repository.readSession(idHash);
  const now = Math.floor(Date.now() / 1_000);
  if (session === null || session.sessionExpiresAt <= now) {
    if (session !== null) await repository.deleteSession(idHash);
    return null;
  }

  try {
    const accessToken = await currentAccessToken(session, config, repository, now);
    return { config, repository, idHash, session, accessToken, now };
  } catch (error) {
    if (!isInvalidSessionError(error)) throw error;
    await repository.deleteSession(idHash).catch(() => undefined);
    return null;
  }
}

function unauthenticatedResponse(request: Request): Response {
  const response = authError('UNAUTHENTICATED', 401);
  response.headers.append('set-cookie', clearCookie(request, 'session'));
  return response;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}

type StableSyncErrorCode = keyof typeof SYNC_STATUS_BY_CODE;

function stableSyncErrorCode(error: unknown): StableSyncErrorCode | 'SYNC_FAILED' {
  if (error instanceof WorkerError || error instanceof DiscordDomainError) return error.code;
  if (error instanceof Error && error.message === 'CONFIG_INVALID') return 'CONFIG_INVALID';
  return 'SYNC_FAILED';
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
  let authenticated: AuthenticatedSession | null = null;
  try {
    authenticated = await resolveAuthenticatedSession(request, env);
    if (authenticated === null) return unauthenticatedResponse(request);

    const { accessToken, config, idHash, now, repository, session } = authenticated;
    const sourceConfig = parseDiscordSourceConfig(env);
    const [guilds, botGuildIds] = await Promise.all([
      createDiscordOAuthClient(config).fetchGuilds(accessToken),
      createDiscordRestClient({ botToken: sourceConfig.botToken }).fetchGuildIds(),
    ]);
    const connectedGuildIds = new Set(botGuildIds);
    const worldsByGuild = await createD1WorldRepository(config.database).readMany(
      guilds.map(({ id }) => id),
    );
    const availabilityByGuild = new Map<string, GuildWorldAvailability>();
    await Promise.all(
      guilds
        .filter((guild) => connectedGuildIds.has(guild.id) && !worldsByGuild.has(guild.id))
        .map(async (guild) => {
          let slug = guild.id;
          let availability = await readWorldAvailability(env, slug);
          const noGuildIdSnapshot = !availability.privateReady && !availability.publicReady;
          const hasLegacyConfiguredSnapshot =
            guild.id === sourceConfig.guildId && config.mapSlug !== guild.id;

          if (noGuildIdSnapshot && hasLegacyConfiguredSnapshot) {
            const legacyAvailability = await readWorldAvailability(env, config.mapSlug);
            if (legacyAvailability.privateReady || legacyAvailability.publicReady) {
              slug = config.mapSlug;
              availability = legacyAvailability;
            }
          }

          availabilityByGuild.set(guild.id, { slug, ...availability });
        }),
    );
    await repository.touchSession(idHash, now);

    const isLoopback = loopbackHosts.has(new URL(request.url).hostname);
    const projectedGuilds = guilds
      .map((guild) => {
        const manageable = canManageGuild(guild);
        const connected = connectedGuildIds.has(guild.id);
        const world = worldsByGuild.get(guild.id);
        const availability = availabilityByGuild.get(guild.id);
        const worldUrl =
          world !== undefined
            ? `/world/${guild.id}`
            : availability?.privateReady && manageable && isLoopback
              ? `/preview/${availability.slug}`
              : availability?.publicReady
                ? `/map/${availability.slug}`
                : null;
        return {
          id: guild.id,
          name: guild.name,
          iconUrl: guildIconUrl(guild),
          owner: guild.owner,
          canManage: manageable,
          connected,
          synced: world !== undefined || (availability?.privateReady ?? false),
          published: world?.visibility === 'public' || (availability?.publicReady ?? false),
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
    const invalidSession = isInvalidSessionError(error);
    if (invalidSession && authenticated !== null) {
      try {
        await authenticated.repository.deleteSession(authenticated.idHash);
      } catch {
        // Session cleanup is best effort; the response remains unauthenticated.
      }
    }
    return invalidSession ? unauthenticatedResponse(request) : authError('AUTH_UNAVAILABLE', 503);
  }
}

async function handleGuildSync(request: Request, env: Env, guildId: string): Promise<Response> {
  if (request.method !== 'POST') return authError('METHOD_NOT_ALLOWED', 405);
  if (!sameOrigin(request)) return authError('INVALID_ORIGIN', 403);

  let authenticated: AuthenticatedSession | null = null;
  try {
    authenticated = await resolveAuthenticatedSession(request, env);
    if (authenticated === null) return unauthenticatedResponse(request);

    const { accessToken, config, idHash, now, repository } = authenticated;
    const sourceConfig = parseDiscordSourceConfig(env);
    const oauth = createDiscordOAuthClient(config);
    const bot = createDiscordRestClient({ botToken: sourceConfig.botToken });
    const [guilds, botGuildIds] = await Promise.all([
      oauth.fetchGuilds(accessToken),
      bot.fetchGuildIds(),
    ]);
    const guild = guilds.find((candidate) => candidate.id === guildId);
    if (guild === undefined || !canManageGuild(guild)) {
      return authError('GUILD_MANAGE_PERMISSION_REQUIRED', 403);
    }
    if (!botGuildIds.includes(guildId)) return authError('BOT_NOT_CONNECTED', 409);
    if (activeGuildSyncs.has(guildId)) return authError('SYNC_IN_PROGRESS', 409);

    await repository.touchSession(idHash, now);
    activeGuildSyncs.add(guildId);
    try {
      const summary = await synchronizePrivateGuild(env, guildId);
      const syncedAt = Math.floor(Date.parse(summary.generatedAt) / 1_000);
      await createD1WorldRepository(config.database).recordSync(guildId, guildId, syncedAt);
      return noStoreJson({
        status: 'synced',
        guildId,
        worldUrl: `/world/${guildId}`,
        generatedAt: summary.generatedAt,
        categoryCount: summary.categoryCount,
        channelCount: summary.channelCount,
      });
    } finally {
      activeGuildSyncs.delete(guildId);
    }
  } catch (error) {
    if (isInvalidSessionError(error)) {
      if (authenticated !== null) {
        await authenticated.repository.deleteSession(authenticated.idHash).catch(() => undefined);
      }
      return unauthenticatedResponse(request);
    }

    const code = stableSyncErrorCode(error);
    return authError(code, code === 'SYNC_FAILED' ? 500 : SYNC_STATUS_BY_CODE[code]);
  }
}

function isMembershipProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === 'AUTH_PROVIDER_FORBIDDEN' || error.message === 'AUTH_PROVIDER_NOT_FOUND';
}

async function handleGuildMap(request: Request, env: Env, guildId: string): Promise<Response> {
  if (request.method !== 'GET') return authError('METHOD_NOT_ALLOWED', 405);

  let authenticated: AuthenticatedSession | null = null;
  try {
    authenticated = await resolveAuthenticatedSession(request, env);
    if (authenticated === null) return unauthenticatedResponse(request);
    if (typeof env.MAP_SNAPSHOTS?.get !== 'function') {
      return authError('CONFIG_INVALID', 500);
    }

    const { accessToken, config, idHash, now, repository, session } = authenticated;
    const oauth = createDiscordOAuthClient(config);
    const [world, guilds] = await Promise.all([
      createD1WorldRepository(config.database).read(guildId),
      oauth.fetchGuilds(accessToken),
    ]);
    if (world === null) return authError('WORLD_NOT_FOUND', 404);

    const guild = guilds.find((candidate) => candidate.id === guildId);
    if (guild === undefined) return authError('GUILD_MEMBERSHIP_REQUIRED', 403);

    const [member, storedSnapshot] = await Promise.all([
      oauth.fetchGuildMember(accessToken, guildId),
      createKvGuildStructureRepository(env.MAP_SNAPSHOTS).read(world.mapSlug),
    ]);
    if (storedSnapshot.state === 'missing') return authError('WORLD_NOT_SYNCED', 404);
    if (storedSnapshot.state === 'invalid') return authError('WORLD_SNAPSHOT_INVALID', 500);

    const identifiers = await createIdentifierFactory(
      decodeBase64UrlSecret(env.SNAPSHOT_ID_SECRET),
    );
    const [memberKey, memberRoleKeys] = await Promise.all([
      identifiers.for('member', session.userId),
      Promise.all(member.roleIds.map((roleId) => identifiers.for('role', roleId))),
    ]);
    const snapshot = createMemberMapSnapshot(storedSnapshot.snapshot, {
      slug: world.mapSlug,
      memberKey,
      memberRoleKeys: new Set(memberRoleKeys),
      isOwner: guild.owner,
    });
    await repository.touchSession(idHash, now);

    const response = noStoreJson(snapshot);
    response.headers.set('vary', 'cookie');
    response.headers.set('x-content-type-options', 'nosniff');
    return response;
  } catch (error) {
    if (isInvalidSessionError(error)) {
      if (authenticated !== null) {
        await authenticated.repository.deleteSession(authenticated.idHash).catch(() => undefined);
      }
      return unauthenticatedResponse(request);
    }
    if (isMembershipProviderError(error)) {
      return authError('GUILD_MEMBERSHIP_REQUIRED', 403);
    }
    return authError('WORLD_UNAVAILABLE', 503);
  }
}

async function handleGuildPresence(request: Request, env: Env, guildId: string): Promise<Response> {
  if (request.method !== 'GET') return authError('METHOD_NOT_ALLOWED', 405);
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return authError('WEBSOCKET_UPGRADE_REQUIRED', 426);
  }
  if (!sameOrigin(request)) return authError('INVALID_ORIGIN', 403);

  let authenticated: AuthenticatedSession | null = null;
  try {
    authenticated = await resolveAuthenticatedSession(request, env);
    if (authenticated === null) return unauthenticatedResponse(request);
    if (typeof env.WORLD_PRESENCE?.getByName !== 'function') {
      return authError('CONFIG_INVALID', 500);
    }

    const { accessToken, config, idHash, now, repository, session } = authenticated;
    const [world] = await Promise.all([
      createD1WorldRepository(config.database).read(guildId),
      createDiscordOAuthClient(config).fetchGuildMember(accessToken, guildId),
    ]);
    if (world === null) return authError('WORLD_NOT_FOUND', 404);

    await repository.touchSession(idHash, now);
    const identifiers = await createIdentifierFactory(
      decodeBase64UrlSecret(env.SNAPSHOT_ID_SECRET),
    );
    const presenceId = await identifiers.for('presence', `${guildId}:${session.userId}`);
    const guildKey = await identifiers.for('guild', guildId);
    const stub = env.WORLD_PRESENCE.getByName(guildKey);
    return stub.fetch(
      new Request('https://presence.dmap/connect', {
        headers: {
          Upgrade: 'websocket',
          'x-dmap-avatar-id': avatarIdForDiscordUser(session.userId),
          'x-dmap-display-name': encodeURIComponent(session.displayName),
          'x-dmap-presence-id': presenceId,
        },
      }),
    );
  } catch (error) {
    if (isInvalidSessionError(error)) {
      if (authenticated !== null) {
        await authenticated.repository.deleteSession(authenticated.idHash).catch(() => undefined);
      }
      return unauthenticatedResponse(request);
    }
    if (isMembershipProviderError(error)) {
      return authError('GUILD_MEMBERSHIP_REQUIRED', 403);
    }
    return authError('PRESENCE_UNAVAILABLE', 503);
  }
}

type VoiceAction = 'query' | 'move' | 'disconnect';

function voiceFailureReason(error: unknown): string {
  if (!(error instanceof Error)) return 'UNKNOWN';
  return /^[A-Z][A-Z0-9_]{0,63}$/u.test(error.message) ? error.message : error.name;
}

async function parseVoiceMoveBody(request: Request): Promise<{ roomKey: string } | null> {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') {
    return null;
  }
  const body = await request.text();
  if (body.length > 1_024) return null;
  try {
    const parsed = voiceMoveBodySchema.safeParse(JSON.parse(body) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function handleGuildVoice(
  request: Request,
  env: Env,
  guildId: string,
  action: VoiceAction,
): Promise<Response> {
  const expectedMethod = action === 'query' ? 'GET' : 'POST';
  if (request.method !== expectedMethod) return authError('METHOD_NOT_ALLOWED', 405);
  if (action !== 'query' && !sameOrigin(request)) return authError('INVALID_ORIGIN', 403);

  let authenticated: AuthenticatedSession | null = null;
  try {
    authenticated = await resolveAuthenticatedSession(request, env);
    if (authenticated === null) return unauthenticatedResponse(request);
    if (
      typeof env.MAP_SNAPSHOTS?.get !== 'function' ||
      typeof env.DISCORD_GATEWAY_BRIDGE?.getByName !== 'function'
    ) {
      return authError('CONFIG_INVALID', 500);
    }

    const { config, idHash, now, repository, session } = authenticated;
    const world = await createD1WorldRepository(config.database).read(guildId);
    if (world === null) return authError('WORLD_NOT_FOUND', 404);

    const storedSnapshot = await createKvGuildStructureRepository(env.MAP_SNAPSHOTS).read(
      world.mapSlug,
    );
    if (storedSnapshot.state === 'missing') return authError('WORLD_NOT_SYNCED', 404);
    if (storedSnapshot.state === 'invalid') return authError('WORLD_SNAPSHOT_INVALID', 500);

    let command:
      | { type: 'voice-query'; guildId: string; userId: string }
      | { type: 'move'; guildId: string; userId: string; roomKey: string }
      | { type: 'disconnect'; guildId: string; userId: string };
    if (action === 'move') {
      const body = await parseVoiceMoveBody(request);
      if (body === null) return authError('INVALID_REQUEST', 400);
      const channel = resolveMappedVoiceDestination(storedSnapshot.snapshot, body.roomKey);
      if (channel === null) {
        return authError('VOICE_ROOM_NOT_FOUND', 409);
      }
      // The connected member's live destination permissions are enforced by the Gateway.
      command = { type: 'move', guildId, userId: session.userId, roomKey: body.roomKey };
    } else if (action === 'disconnect') {
      command = { type: 'disconnect', guildId, userId: session.userId };
    } else {
      command = { type: 'voice-query', guildId, userId: session.userId };
    }

    const outcome = await sendDiscordGatewayCommand(env, command);
    await repository.touchSession(idHash, now);
    if (outcome.service === 'offline') {
      return action === 'query'
        ? noStoreJson({ service: 'offline', state: null })
        : authError('VOICE_GATEWAY_UNAVAILABLE', 503);
    }
    if (outcome.service === 'timeout') return authError('VOICE_ACTION_TIMEOUT', 504);
    if (!outcome.result.ok) {
      const publicError = publicVoiceErrorFor(outcome.result.errorCode);
      return authError(publicError.code, publicError.status);
    }
    return noStoreJson({ service: 'online', state: outcome.result.state });
  } catch (error) {
    console.error(
      JSON.stringify({
        service: 'dmap-worker',
        event: 'voice_request_failed',
        action,
        reason: voiceFailureReason(error),
      }),
    );
    if (isInvalidSessionError(error)) {
      if (authenticated !== null) {
        await authenticated.repository.deleteSession(authenticated.idHash).catch(() => undefined);
      }
      return unauthenticatedResponse(request);
    }
    if (isMembershipProviderError(error)) {
      return authError('GUILD_MEMBERSHIP_REQUIRED', 403);
    }
    return action === 'query'
      ? authError('VOICE_GATEWAY_UNAVAILABLE', 503)
      : authError('VOICE_ACTION_FAILED', 502);
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
  const guildVoiceMoveMatch = GUILD_VOICE_MOVE_PATH.exec(pathname);
  if (guildVoiceMoveMatch !== null) {
    return handleGuildVoice(request, env, guildVoiceMoveMatch[1]!, 'move');
  }

  const guildVoiceDisconnectMatch = GUILD_VOICE_DISCONNECT_PATH.exec(pathname);
  if (guildVoiceDisconnectMatch !== null) {
    return handleGuildVoice(request, env, guildVoiceDisconnectMatch[1]!, 'disconnect');
  }

  const guildVoiceMatch = GUILD_VOICE_PATH.exec(pathname);
  if (guildVoiceMatch !== null) {
    return handleGuildVoice(request, env, guildVoiceMatch[1]!, 'query');
  }

  const guildPresenceMatch = GUILD_PRESENCE_PATH.exec(pathname);
  if (guildPresenceMatch !== null) {
    return handleGuildPresence(request, env, guildPresenceMatch[1]!);
  }

  const guildMapMatch = GUILD_MAP_PATH.exec(pathname);
  if (guildMapMatch !== null) return handleGuildMap(request, env, guildMapMatch[1]!);

  const guildSyncMatch = GUILD_SYNC_PATH.exec(pathname);
  if (guildSyncMatch !== null) return handleGuildSync(request, env, guildSyncMatch[1]!);

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
