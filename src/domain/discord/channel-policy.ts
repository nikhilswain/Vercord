import { type ChannelMutationInput } from '../channels/protocol';
import { publicLabel } from '../map/labels';
import { VIEW_CHANNEL } from './constants';
import { computeBasePermissions, computeChannelPermissions } from './permissions';
import type { MemberAccess } from './live-protocol';
import type { DiscordChannelSource, DiscordSourceBundle } from './source';

export const MANAGE_CHANNELS = 1n << 4n;
const SUPPORTED_CHANNEL_TYPES = new Set([0, 2, 5, 13, 15, 16]);

export type KeyedChannel = { key: string; channel: DiscordChannelSource };
export type PreparedChannelMutation = {
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
};

export class ChannelPolicyError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = 'ChannelPolicyError';
  }
}

export function sourceForMember(
  source: DiscordSourceBundle,
  member: MemberAccess,
): DiscordSourceBundle {
  return { ...source, bot: { id: member.userId }, botMember: { roleIds: member.roleIds } };
}

export function hasChannelPermission(
  source: DiscordSourceBundle,
  channel: DiscordChannelSource | null,
  required: bigint,
): boolean {
  const base = computeBasePermissions(source);
  const actual = channel === null ? base : computeChannelPermissions(base, source, channel);
  return (actual & required) === required;
}

export function isSupportedChannelType(type: number): boolean {
  return SUPPORTED_CHANNEL_TYPES.has(type);
}

export function prepareChannelMutation(input: {
  source: DiscordSourceBundle;
  member: MemberAccess;
  channels: KeyedChannel[];
  mutation: ChannelMutationInput;
  now: number;
}): PreparedChannelMutation {
  const { source, member, channels, mutation, now } = input;
  const disabledAt =
    member.communicationDisabledUntil === null
      ? null
      : Date.parse(member.communicationDisabledUntil);
  if (
    member.pending ||
    (disabledAt !== null && (!Number.isFinite(disabledAt) || disabledAt > now))
  ) {
    throw new ChannelPolicyError('CHANNEL_MEMBER_FORBIDDEN', 403);
  }

  const actorSource = sourceForMember(source, member);
  const requireManage = (channel: DiscordChannelSource | null): void => {
    if (!hasChannelPermission(actorSource, channel, VIEW_CHANNEL | MANAGE_CHANNELS)) {
      throw new ChannelPolicyError('CHANNEL_MEMBER_FORBIDDEN', 403);
    }
    if (!hasChannelPermission(source, channel, VIEW_CHANNEL | MANAGE_CHANNELS)) {
      throw new ChannelPolicyError('CHANNEL_BOT_FORBIDDEN', 403);
    }
  };

  if (mutation.kind === 'create') {
    if (!hasChannelPermission(actorSource, null, MANAGE_CHANNELS)) {
      throw new ChannelPolicyError('CHANNEL_MEMBER_FORBIDDEN', 403);
    }
    if (!hasChannelPermission(source, null, MANAGE_CHANNELS)) {
      throw new ChannelPolicyError('CHANNEL_BOT_FORBIDDEN', 403);
    }
    const parent =
      mutation.data.parentKey === null
        ? null
        : channels.find((entry) => entry.key === mutation.data.parentKey)?.channel;
    if (parent === undefined || (parent !== null && parent.type !== 4)) {
      throw new ChannelPolicyError('CHANNEL_NOT_FOUND', 404);
    }
    requireManage(parent);
    const body: Record<string, unknown> = {
      name: mutation.data.name,
      type: mutation.data.type === 'text' ? 0 : 2,
      parent_id: parent?.id ?? null,
    };
    // Copy the category's exact access rules; never create a briefly public child then lock it.
    if (parent !== null) body.permission_overwrites = parent.overwrites;
    return {
      method: 'POST',
      path: `/guilds/${encodeURIComponent(source.guild.id)}/channels`,
      body,
    };
  }

  const target = channels.find((entry) => entry.key === mutation.roomKey)?.channel;
  if (target === undefined || !isSupportedChannelType(target.type)) {
    throw new ChannelPolicyError('CHANNEL_NOT_FOUND', 404);
  }
  requireManage(target);
  if (publicLabel(target.name, 'Discord room') !== mutation.data.expectedName) {
    throw new ChannelPolicyError('CHANNEL_CHANGED', 409);
  }
  return {
    method: mutation.kind === 'rename' ? 'PATCH' : 'DELETE',
    path: `/channels/${encodeURIComponent(target.id)}`,
    ...(mutation.kind === 'rename' ? { body: { name: mutation.data.name } } : {}),
  };
}
