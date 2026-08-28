import { GUILD_CATEGORY, OVERWRITE_ROLE } from './constants';
import type { IdentifierFactory } from './identifiers';
import { assertBotLeastPrivilege, selectBotVisibleChannels } from './permissions';
import type { DiscordChannelSource, DiscordSourceBundle } from './source';
import {
  parseGuildStructureSnapshot,
  type ChannelKind,
  type GuildStructureSnapshot,
} from './snapshot';

export interface NormalizeOptions {
  generatedAt: string;
  identifiers: IdentifierFactory;
}

function channelKind(type: number): ChannelKind {
  switch (type) {
    case 0:
      return 'text';
    case 2:
      return 'voice';
    case GUILD_CATEGORY:
      return 'category';
    case 5:
      return 'announcement';
    case 13:
      return 'stage';
    case 15:
      return 'forum';
    case 16:
      return 'media';
    default:
      return 'unsupported';
  }
}

function compareDiscordOrder(left: DiscordChannelSource, right: DiscordChannelSource): number {
  if (left.position !== right.position) return left.position < right.position ? -1 : 1;
  const leftId = BigInt(left.id);
  const rightId = BigInt(right.id);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function siblingOrders(channels: DiscordChannelSource[]): ReadonlyMap<string, number> {
  const siblings = new Map<string | null, DiscordChannelSource[]>();
  for (const channel of channels) {
    const group = siblings.get(channel.parentId) ?? [];
    group.push(channel);
    siblings.set(channel.parentId, group);
  }

  const orders = new Map<string, number>();
  for (const group of siblings.values()) {
    group.sort(compareDiscordOrder);
    group.forEach(({ id }, order) => orders.set(id, order));
  }
  return orders;
}

export async function normalizeGuildStructure(
  bundle: DiscordSourceBundle,
  options: NormalizeOptions,
): Promise<GuildStructureSnapshot> {
  assertBotLeastPrivilege(bundle);

  const retainedChannels = selectBotVisibleChannels(bundle);
  const orders = siblingOrders(retainedChannels);
  const [guildKey, ownerKey, everyoneRoleKey, roles, channelKeyEntries] = await Promise.all([
    options.identifiers.for('guild', bundle.guild.id),
    options.identifiers.for('member', bundle.guild.ownerId),
    options.identifiers.for('role', bundle.guild.id),
    Promise.all(
      bundle.guild.roles.map(async (role) => ({
        key: await options.identifiers.for('role', role.id),
        permissions: role.permissions,
      })),
    ),
    Promise.all(
      retainedChannels.map(
        async (channel) =>
          [channel.id, await options.identifiers.for('channel', channel.id)] as const,
      ),
    ),
  ]);
  const channelKeys = new Map(channelKeyEntries);

  const channels = await Promise.all(
    retainedChannels.map(async (channel) => {
      const key = channelKeys.get(channel.id);
      const parentKey = channel.parentId === null ? null : channelKeys.get(channel.parentId);
      const order = orders.get(channel.id);

      return {
        key,
        kind: channelKind(channel.type),
        discordType: channel.type,
        label: channel.name,
        parentKey,
        order,
        ageRestricted: channel.nsfw,
        overwrites: await Promise.all(
          channel.overwrites.map(async (overwrite) => ({
            targetKey: await options.identifiers.for(
              overwrite.type === OVERWRITE_ROLE ? 'role' : 'member',
              overwrite.id,
            ),
            targetType: overwrite.type === OVERWRITE_ROLE ? ('role' as const) : ('member' as const),
            allow: overwrite.allow,
            deny: overwrite.deny,
          })),
        ),
      };
    }),
  );

  return parseGuildStructureSnapshot({
    schemaVersion: 1,
    identifierScheme: 'hmac-sha256-v1',
    generatedAt: options.generatedAt,
    guild: {
      key: guildKey,
      displayName: bundle.guild.name,
      ownerKey,
      everyoneRoleKey,
    },
    roles,
    channels,
  });
}
