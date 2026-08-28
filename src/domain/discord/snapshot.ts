import { z } from 'zod';

import { DiscordDomainError } from './errors';
import { countCodePoints, permissionStringSchema } from './source-schema';

export type ChannelKind =
  'category' | 'text' | 'voice' | 'announcement' | 'stage' | 'forum' | 'media' | 'unsupported';

export interface SnapshotOverwrite {
  targetKey: string;
  targetType: 'role' | 'member';
  allow: string;
  deny: string;
}

export interface GuildStructureSnapshot {
  schemaVersion: 1;
  identifierScheme: 'hmac-sha256-v1';
  generatedAt: string;
  guild: {
    key: string;
    displayName: string;
    ownerKey: string;
    everyoneRoleKey: string;
  };
  roles: Array<{ key: string; permissions: string }>;
  channels: Array<{
    key: string;
    kind: ChannelKind;
    discordType: number;
    label: string;
    parentKey: string | null;
    order: number;
    ageRestricted: boolean;
    overwrites: SnapshotOverwrite[];
  }>;
}

const digest = '[A-Za-z0-9_-]{43}';
const guildKeySchema = z.string().regex(new RegExp(`^g_${digest}$`));
const channelKeySchema = z.string().regex(new RegExp(`^c_${digest}$`));
const roleKeySchema = z.string().regex(new RegExp(`^r_${digest}$`));
const memberKeySchema = z.string().regex(new RegExp(`^m_${digest}$`));

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isFinite(next) || next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

const displayStringSchema = z
  .string()
  .refine((value) => countCodePoints(value) >= 1 && countCodePoints(value) <= 100)
  .refine((value) => !/\p{Cc}/u.test(value))
  .refine((value) => !hasUnpairedSurrogate(value));

const overwritePermissions = {
  allow: permissionStringSchema,
  deny: permissionStringSchema,
};

const snapshotOverwriteSchema = z.discriminatedUnion('targetType', [
  z.object({ targetKey: roleKeySchema, targetType: z.literal('role'), ...overwritePermissions }),
  z.object({
    targetKey: memberKeySchema,
    targetType: z.literal('member'),
    ...overwritePermissions,
  }),
]);

const channelKindSchema = z.enum([
  'category',
  'text',
  'voice',
  'announcement',
  'stage',
  'forum',
  'media',
  'unsupported',
]);

const guildStructureSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  identifierScheme: z.literal('hmac-sha256-v1'),
  generatedAt: z.iso.datetime().refine((value) => !Number.isNaN(Date.parse(value))),
  guild: z.object({
    key: guildKeySchema,
    displayName: displayStringSchema,
    ownerKey: memberKeySchema,
    everyoneRoleKey: roleKeySchema,
  }),
  roles: z.array(z.object({ key: roleKeySchema, permissions: permissionStringSchema })),
  channels: z.array(
    z.object({
      key: channelKeySchema,
      kind: channelKindSchema,
      discordType: z.number().int().nonnegative(),
      label: displayStringSchema,
      parentKey: channelKeySchema.nullable(),
      order: z.number().int().nonnegative(),
      ageRestricted: z.boolean(),
      overwrites: z.array(snapshotOverwriteSchema),
    }),
  ),
});

export function parseGuildStructureSnapshot(value: unknown): GuildStructureSnapshot {
  const result = guildStructureSnapshotSchema.safeParse(value);
  if (!result.success || !hasValidSnapshotRelationships(result.data)) {
    throw new DiscordDomainError('SNAPSHOT_INVALID');
  }
  return result.data;
}

function hasValidSnapshotRelationships(snapshot: GuildStructureSnapshot): boolean {
  const roleKeys = new Set<string>();
  for (const role of snapshot.roles) {
    if (roleKeys.has(role.key)) return false;
    roleKeys.add(role.key);
  }
  if (!roleKeys.has(snapshot.guild.everyoneRoleKey)) return false;

  const channelsByKey = new Map<string, GuildStructureSnapshot['channels'][number]>();
  for (const channel of snapshot.channels) {
    if (channelsByKey.has(channel.key)) return false;
    channelsByKey.set(channel.key, channel);
  }

  const siblingOrders = new Map<string | null, number[]>();
  for (const channel of snapshot.channels) {
    if (channel.kind === 'category' && channel.parentKey !== null) return false;
    if (channel.parentKey !== null && channelsByKey.get(channel.parentKey)?.kind !== 'category') {
      return false;
    }
    for (const overwrite of channel.overwrites) {
      if (overwrite.targetType === 'role' && !roleKeys.has(overwrite.targetKey)) return false;
    }
    const orders = siblingOrders.get(channel.parentKey) ?? [];
    orders.push(channel.order);
    siblingOrders.set(channel.parentKey, orders);
  }

  for (const orders of siblingOrders.values()) {
    orders.sort((left, right) => left - right);
    if (orders.some((order, index) => order !== index)) return false;
  }
  return true;
}
