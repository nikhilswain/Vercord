import {
  channelStateSchema,
  createChannelSchema,
  deleteChannelSchema,
  renameChannelSchema,
  type ChannelState,
} from '../../src/domain/channels/protocol';
import { VIEW_CHANNEL } from '../../src/domain/discord/constants';
import { createIdentifierFactory } from '../../src/domain/discord/identifiers';
import {
  computeBasePermissions,
  computeChannelPermissions,
} from '../../src/domain/discord/permissions';
import type { DiscordChannelSource, DiscordSourceBundle } from '../../src/domain/discord/source';
import { decodeBase64UrlSecret } from '../config/runtime';
import type { DiscordOAuthGuildMember } from '../auth/discord-oauth';
import { createDiscordRestClient } from '../discord/client';
import { createMemberMapSnapshot, publicLabel } from '../publication/create-public-map';
import { createD1WorldRepository } from '../worlds/repository';
import { invalidateLiveStructure, readLiveStructure } from './live-structure';
import { ChannelActionError, mutateDiscordChannel } from './mutations';

const MANAGE_CHANNELS = 1n << 4n;
const SUPPORTED_CHANNEL_TYPES = new Set([0, 2, 5, 13, 15, 16]);

function memberSource(
  source: DiscordSourceBundle,
  userId: string,
  roleIds: string[],
): DiscordSourceBundle {
  return { ...source, bot: { id: userId }, botMember: { roleIds } };
}

function hasChannelPermission(
  source: DiscordSourceBundle,
  channel: DiscordChannelSource | null,
  required: bigint,
): boolean {
  const base = computeBasePermissions(source);
  const actual = channel === null ? base : computeChannelPermissions(base, source, channel);
  return (actual & required) === required;
}

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
  const member = memberSource(source, userId, roleIds);
  const [memberKey, memberRoleKeys] = await Promise.all([
    identifiers.for('member', userId),
    Promise.all(roleIds.map((id) => identifiers.for('role', id))),
  ]);
  const projected = createMemberMapSnapshot(snapshot, {
    slug: world.mapSlug,
    memberKey,
    memberRoleKeys: new Set(memberRoleKeys),
    isOwner: source.guild.ownerId === userId,
  });
  const visibleKeys = new Set(
    projected.areas.flatMap((area) => area.rooms.map((room) => room.key)),
  );
  const required = VIEW_CHANNEL | MANAGE_CHANNELS;
  const canCreate =
    hasChannelPermission(member, null, MANAGE_CHANNELS) &&
    hasChannelPermission(source, null, MANAGE_CHANNELS);
  const categories: ChannelState['controls']['categories'] = [];
  const manageableKeys: string[] = [];
  for (const channel of source.channels) {
    if (
      !hasChannelPermission(member, channel, required) ||
      !hasChannelPermission(source, channel, required)
    )
      continue;
    const key = (await identifiers.for('channel', channel.id)).toLowerCase();
    if (channel.type === 4 && canCreate)
      categories.push({ key, label: publicLabel(channel.name, 'Discord area') });
    else if (SUPPORTED_CHANNEL_TYPES.has(channel.type) && visibleKeys.has(key))
      manageableKeys.push(key);
  }
  return channelStateSchema.parse({
    snapshot: projected,
    controls: {
      canCreateRoot:
        canCreate &&
        hasChannelPermission(member, null, VIEW_CHANNEL) &&
        hasChannelPermission(source, null, VIEW_CHANNEL),
      categories,
      manageableKeys,
    },
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
  const parsed =
    request.method === 'POST'
      ? createChannelSchema.safeParse(body)
      : request.method === 'PATCH'
        ? renameChannelSchema.safeParse(body)
        : deleteChannelSchema.safeParse(body);
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
  if (
    currentMember.pending ||
    (currentMember.communicationDisabledUntil !== null &&
      Date.parse(currentMember.communicationDisabledUntil) > Date.now())
  ) {
    throw new ChannelActionError('CHANNEL_MEMBER_FORBIDDEN', 403);
  }
  const member = memberSource(source, userId, currentMember.roleIds);
  const requireManage = (channel: DiscordChannelSource | null) => {
    if (!hasChannelPermission(member, channel, VIEW_CHANNEL | MANAGE_CHANNELS))
      throw new ChannelActionError('CHANNEL_MEMBER_FORBIDDEN', 403);
    if (!hasChannelPermission(source, channel, VIEW_CHANNEL | MANAGE_CHANNELS))
      throw new ChannelActionError('CHANNEL_BOT_FORBIDDEN', 403);
  };
  let path: string;
  let payload: Record<string, unknown> | undefined;
  if (request.method === 'POST') {
    const data = createChannelSchema.parse(parsed.data);
    if (!hasChannelPermission(member, null, MANAGE_CHANNELS))
      throw new ChannelActionError('CHANNEL_MEMBER_FORBIDDEN', 403);
    if (!hasChannelPermission(source, null, MANAGE_CHANNELS))
      throw new ChannelActionError('CHANNEL_BOT_FORBIDDEN', 403);
    const parent =
      data.parentKey === null ? null : keyed.find((entry) => entry.key === data.parentKey)?.channel;
    if (parent === undefined || (parent !== null && parent.type !== 4))
      throw new ChannelActionError('CHANNEL_NOT_FOUND', 404);
    requireManage(parent);
    path = `/guilds/${encodeURIComponent(guildId)}/channels`;
    payload = {
      name: data.name,
      type: data.type === 'text' ? 0 : 2,
      parent_id: parent?.id ?? null,
    };
    // Copy the category's exact access rules; never create a briefly public child then lock it.
    if (parent !== null) payload.permission_overwrites = parent.overwrites;
  } else {
    const target = keyed.find((entry) => entry.key === roomKey)?.channel;
    if (target === undefined || !SUPPORTED_CHANNEL_TYPES.has(target.type))
      throw new ChannelActionError('CHANNEL_NOT_FOUND', 404);
    requireManage(target);
    const data = deleteChannelSchema.parse({
      expectedName: 'expectedName' in parsed.data ? parsed.data.expectedName : '',
    });
    if (publicLabel(target.name, 'Discord room') !== data.expectedName)
      throw new ChannelActionError('CHANNEL_CHANGED', 409);
    path = `/channels/${encodeURIComponent(target.id)}`;
    if (request.method === 'PATCH') payload = { name: renameChannelSchema.parse(parsed.data).name };
  }
  try {
    await mutateDiscordChannel(
      env.DISCORD_BOT_TOKEN,
      path,
      request.method as 'POST' | 'PATCH' | 'DELETE',
      userId,
      payload,
    );
  } finally {
    // Notify on uncertainty too: readers can reconcile without replaying an external mutation.
    await invalidateLiveStructure(env, guildId).catch(() => undefined);
  }
}
