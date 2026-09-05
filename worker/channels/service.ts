import { channelMutationInputSchema, type ChannelState } from '../../src/domain/channels/protocol';
import { createIdentifierFactory } from '../../src/domain/discord/identifiers';
import {
  ChannelPolicyError,
  prepareChannelMutation,
} from '../../src/domain/discord/channel-policy';
import { decodeBase64UrlSecret } from '../config/runtime';
import type { DiscordOAuthGuildMember } from '../auth/discord-oauth';
import { createDiscordRestClient } from '../discord/client';
import { projectChannelState } from './projection';
import { createD1WorldRepository } from '../worlds/repository';
import { invalidateLiveStructure, readLiveStructure } from './live-structure';
import { ChannelActionError, mutateDiscordChannel } from './mutations';

export async function readChannelState(
  env: Env,
  guildId: string,
  userId: string,
  roleIds: string[],
): Promise<ChannelState> {
  const { source, snapshot } = await readLiveStructure(env, guildId);
  const world = await createD1WorldRepository(env.AUTH_DB).read(guildId);
  if (world === null) throw new ChannelActionError('WORLD_NOT_FOUND', 404);
  const identifiers = await createIdentifierFactory(decodeBase64UrlSecret(env.SNAPSHOT_ID_SECRET));
  return projectChannelState({
    source,
    snapshot,
    slug: world.mapSlug,
    identifiers,
    member: { userId, roleIds, pending: false, communicationDisabledUntil: null },
  });
}

export async function changeChannel(
  request: Request,
  env: Env,
  guildId: string,
  userId: string,
  fetchMember: () => Promise<DiscordOAuthGuildMember>,
  roomKey: string | null,
): Promise<void> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (contentType !== 'application/json') throw new ChannelActionError('INVALID_REQUEST', 400);
  const reader = request.body?.getReader();
  if (!reader) throw new ChannelActionError('INVALID_REQUEST', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const bodyTimer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 5_000);
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4_096) {
        await reader.cancel();
        throw new ChannelActionError('INVALID_REQUEST', 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    clearTimeout(bodyTimer);
    reader.releaseLock();
  }
  if (timedOut) throw new ChannelActionError('INVALID_REQUEST', 408);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new ChannelActionError('INVALID_REQUEST', 400);
  }
  const parsed = channelMutationInputSchema.safeParse(
    request.method === 'POST'
      ? { kind: 'create', data: body }
      : request.method === 'PATCH'
        ? { kind: 'rename', roomKey, data: body }
        : { kind: 'delete', roomKey, data: body },
  );
  if (!parsed.success) throw new ChannelActionError('INVALID_REQUEST', 400);

  // Capabilities displayed earlier are advisory. Mutations always read live permissions.
  const source = await createDiscordRestClient({
    botToken: env.DISCORD_BOT_TOKEN,
  }).fetchGuildSource(guildId);
  const identifiers = await createIdentifierFactory(decodeBase64UrlSecret(env.SNAPSHOT_ID_SECRET));
  const keyed = await Promise.all(
    source.channels.map(async (channel) => ({
      channel,
      key: (await identifiers.for('channel', channel.id)).toLowerCase(),
    })),
  );
  // Authorize after the request body and guild reads: a slow upload cannot retain old roles.
  const currentMember = await fetchMember();
  let prepared;
  try {
    prepared = prepareChannelMutation({
      source,
      member: { userId, ...currentMember },
      channels: keyed,
      mutation: parsed.data,
      now: Date.now(),
    });
  } catch (error) {
    if (error instanceof ChannelPolicyError) {
      throw new ChannelActionError(error.code, error.status);
    }
    throw error;
  }
  try {
    await mutateDiscordChannel(
      env.DISCORD_BOT_TOKEN,
      prepared.path,
      prepared.method,
      userId,
      prepared.body,
    );
  } finally {
    // Notify on uncertainty too: readers can reconcile without replaying an external mutation.
    await invalidateLiveStructure(env, guildId).catch(() => undefined);
  }
}
