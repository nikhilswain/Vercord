import {
  ADMINISTRATOR,
  GUILD_CATEGORY,
  OVERWRITE_MEMBER,
  OVERWRITE_ROLE,
  THREAD_TYPES,
  VIEW_CHANNEL,
} from './constants';
import { DiscordDomainError } from './errors';
import type { DiscordChannelSource, DiscordSourceBundle } from './source';

function applyOverwrite(permissions: bigint, deny: bigint, allow: bigint): bigint {
  return (permissions & ~deny) | allow;
}

export function computeBasePermissions(bundle: DiscordSourceBundle): bigint {
  const everyoneRole = bundle.guild.roles.find(({ id }) => id === bundle.guild.id);
  if (everyoneRole === undefined) throw new DiscordDomainError('DISCORD_SOURCE_INVALID');

  const assignedRoleIds = new Set(bundle.botMember.roleIds);
  let permissions = BigInt(everyoneRole.permissions);
  for (const role of bundle.guild.roles) {
    if (assignedRoleIds.has(role.id)) permissions |= BigInt(role.permissions);
  }

  if (bundle.bot.id === bundle.guild.ownerId || (permissions & ADMINISTRATOR) === ADMINISTRATOR) {
    return ~0n;
  }
  return permissions;
}

export function computeChannelPermissions(
  base: bigint,
  bundle: DiscordSourceBundle,
  channel: DiscordChannelSource,
): bigint {
  if ((base & ADMINISTRATOR) === ADMINISTRATOR) return ~0n;

  let permissions = base;
  const everyoneOverwrite = channel.overwrites.find(
    ({ id, type }) => type === OVERWRITE_ROLE && id === bundle.guild.id,
  );
  if (everyoneOverwrite !== undefined) {
    permissions = applyOverwrite(
      permissions,
      BigInt(everyoneOverwrite.deny),
      BigInt(everyoneOverwrite.allow),
    );
  }

  const assignedRoleIds = new Set(bundle.botMember.roleIds);
  let roleDeny = 0n;
  let roleAllow = 0n;
  for (const overwrite of channel.overwrites) {
    if (
      overwrite.type === OVERWRITE_ROLE &&
      overwrite.id !== bundle.guild.id &&
      assignedRoleIds.has(overwrite.id)
    ) {
      roleDeny |= BigInt(overwrite.deny);
      roleAllow |= BigInt(overwrite.allow);
    }
  }
  permissions = applyOverwrite(permissions, roleDeny, roleAllow);

  const botOverwrite = channel.overwrites.find(
    ({ id, type }) => type === OVERWRITE_MEMBER && id === bundle.bot.id,
  );
  if (botOverwrite !== undefined) {
    permissions = applyOverwrite(
      permissions,
      BigInt(botOverwrite.deny),
      BigInt(botOverwrite.allow),
    );
  }

  return permissions;
}

export function assertBotLeastPrivilege(bundle: DiscordSourceBundle): void {
  if ((computeBasePermissions(bundle) & ADMINISTRATOR) === ADMINISTRATOR) {
    throw new DiscordDomainError('EXCESSIVE_BOT_PERMISSION');
  }
}

function canBotView(
  base: bigint,
  bundle: DiscordSourceBundle,
  channel: DiscordChannelSource,
): boolean {
  return (computeChannelPermissions(base, bundle, channel) & VIEW_CHANNEL) === VIEW_CHANNEL;
}

export function selectBotVisibleChannels(bundle: DiscordSourceBundle): DiscordChannelSource[] {
  const base = computeBasePermissions(bundle);
  const visibleNonCategories = bundle.channels.filter(
    (channel) =>
      channel.type !== GUILD_CATEGORY &&
      !THREAD_TYPES.has(channel.type) &&
      canBotView(base, bundle, channel),
  );
  const visibleParentIds = new Set(
    visibleNonCategories.flatMap((channel) =>
      channel.parentId === null ? [] : [channel.parentId],
    ),
  );
  const visibleCategoryIds = new Set(
    bundle.channels
      .filter((channel) => channel.type === GUILD_CATEGORY && visibleParentIds.has(channel.id))
      .map(({ id }) => id),
  );
  const retainedIds = new Set([...visibleNonCategories.map(({ id }) => id), ...visibleCategoryIds]);

  return bundle.channels.filter(({ id }) => retainedIds.has(id));
}
