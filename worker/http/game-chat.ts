import { createIdentifierFactory } from '../../src/domain/discord/identifiers';
import { publicLabel } from '../../src/domain/map/labels';
import { createD1AuthRepository } from '../auth/repository';
import { hashOpaqueToken } from '../auth/crypto';
import { readCookie } from '../auth/cookies';
import { decodeBase64UrlSecret } from '../config/runtime';
import { jsonResponse } from './json-response';

/** Uses the existing Dmap login. Discord OAuth refresh is not part of the chat transport. */
export async function handleGameChat(
  request: Request,
  env: Env,
  guildId: string,
): Promise<Response> {
  const error = (code: string, status: number) =>
    jsonResponse({ error: { code } }, { status }, { noStore: true });
  if (request.method !== 'GET') return error('METHOD_NOT_ALLOWED', 405);
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return error('INVALID_ORIGIN', 403);
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
    return error('UPGRADE_REQUIRED', 426);
  const cookie = readCookie(request, 'session');
  if (!cookie) return error('UNAUTHENTICATED', 401);
  try {
    const sessionHash = await hashOpaqueToken(cookie);
    const session = await createD1AuthRepository(env.AUTH_DB).readSession(sessionHash);
    if (!session || session.sessionExpiresAt <= Math.floor(Date.now() / 1000))
      return error('UNAUTHENTICATED', 401);
    const ids = await createIdentifierFactory(decodeBase64UrlSecret(env.SNAPSHOT_ID_SECRET));
    const [id, guildKey] = await Promise.all([
      ids.for('presence', `${guildId}:${session.userId}`),
      ids.for('guild', guildId),
    ]);
    return await env.GAME_CHAT.getByName(guildKey).fetch(
      new Request('https://chat.dmap/connect', {
        headers: {
          upgrade: 'websocket',
          'x-chat-guild': guildId,
          'x-chat-user': session.userId,
          'x-chat-session': sessionHash,
          'x-chat-expires': String(session.sessionExpiresAt),
          'x-chat-person': encodeURIComponent(
            JSON.stringify({ id, name: publicLabel(session.displayName, 'Traveler') }),
          ),
        },
      }),
    );
  } catch {
    return error('CHAT_UNAVAILABLE', 503);
  }
}
