import { z } from 'zod';

import { DiscordDomainError } from './errors';
import type {
  DiscordBotMemberSource,
  DiscordBotSource,
  DiscordChannelSource,
  DiscordGuildSource,
  DiscordSourceBundle,
} from './source';

const UINT64_MAX = 18_446_744_073_709_551_615n;
const MAX_COLLECTION_SIZE = 1_000;

export const snowflakeSchema = z
  .string()
  .regex(/^[1-9]\d{0,19}$/)
  .refine((value) => {
    try {
      return BigInt(value) <= UINT64_MAX;
    } catch {
      return false;
    }
  });

export const permissionStringSchema = z.string().regex(/^(0|[1-9]\d{0,127})$/);

export function countCodePoints(value: string): number {
  return Array.from(value).length;
}

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

const nameSchema = z
  .string()
  .refine((value) => countCodePoints(value) >= 1 && countCodePoints(value) <= 100)
  .refine((value) => !/\p{Cc}/u.test(value))
  .refine((value) => !hasUnpairedSurrogate(value));

const botSchema = z.object({ id: snowflakeSchema }).transform(({ id }) => ({ id }));

const roleSchema = z
  .object({ id: snowflakeSchema, permissions: permissionStringSchema })
  .transform(({ id, permissions }) => ({ id, permissions }));

const guildSchema = z
  .object({
    id: snowflakeSchema,
    name: nameSchema,
    owner_id: snowflakeSchema,
    roles: z.array(roleSchema).max(MAX_COLLECTION_SIZE),
  })
  .transform(({ id, name, owner_id, roles }) => ({ id, name, ownerId: owner_id, roles }));

const botMemberSchema = z
  .object({ roles: z.array(snowflakeSchema).max(MAX_COLLECTION_SIZE) })
  .transform(({ roles }) => ({ roleIds: roles }));

const overwriteSchema = z
  .object({
    id: snowflakeSchema,
    type: z.union([z.literal(0), z.literal(1)]),
    allow: permissionStringSchema,
    deny: permissionStringSchema,
  })
  .transform(({ id, type, allow, deny }) => ({ id, type, allow, deny }));

const channelSchema = z
  .object({
    id: snowflakeSchema,
    type: z
      .number()
      .int()
      .nonnegative()
      .refine((type) => type !== 1 && type !== 3),
    position: z.number().int().nonnegative(),
    name: nameSchema,
    parent_id: snowflakeSchema.nullish().transform((value) => value ?? null),
    nsfw: z.boolean().optional().default(false),
    permission_overwrites: z.array(overwriteSchema).max(MAX_COLLECTION_SIZE).optional().default([]),
  })
  .transform(({ id, type, position, name, parent_id, nsfw, permission_overwrites }) => ({
    id,
    type,
    position,
    name,
    parentId: parent_id,
    nsfw,
    overwrites: permission_overwrites,
  }));

const channelsSchema = z.array(channelSchema).max(MAX_COLLECTION_SIZE);

function parseSource<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new DiscordDomainError('DISCORD_SOURCE_INVALID');
  return result.data;
}

export function parseDiscordBot(value: unknown): DiscordBotSource {
  return parseSource(botSchema, value);
}

export function parseDiscordGuild(value: unknown): DiscordGuildSource {
  return parseSource(guildSchema, value);
}

export function parseDiscordBotMember(value: unknown): DiscordBotMemberSource {
  return parseSource(botMemberSchema, value);
}

export function parseDiscordChannels(value: unknown): DiscordChannelSource[] {
  return parseSource(channelsSchema, value);
}

export function validateDiscordSourceBundle(
  bundle: DiscordSourceBundle,
  configuredGuildId: string,
): DiscordSourceBundle {
  if (!hasValidSourceRelationships(bundle, configuredGuildId)) {
    throw new DiscordDomainError('DISCORD_SOURCE_INVALID');
  }
  return bundle;
}

function hasValidSourceRelationships(
  bundle: DiscordSourceBundle,
  configuredGuildId: string,
): boolean {
  if (bundle.guild.id !== configuredGuildId) return false;

  const roleIds = new Set<string>();
  let everyoneRoleCount = 0;
  for (const role of bundle.guild.roles) {
    if (roleIds.has(role.id)) return false;
    roleIds.add(role.id);
    if (role.id === bundle.guild.id) everyoneRoleCount += 1;
  }
  if (everyoneRoleCount !== 1) return false;

  const botRoleIds = new Set<string>();
  for (const roleId of bundle.botMember.roleIds) {
    if (botRoleIds.has(roleId) || !roleIds.has(roleId)) return false;
    botRoleIds.add(roleId);
  }

  const channelsById = new Map<string, DiscordChannelSource>();
  for (const channel of bundle.channels) {
    if (channelsById.has(channel.id)) return false;
    channelsById.set(channel.id, channel);

    const overwriteTargets = new Set<string>();
    for (const overwrite of channel.overwrites) {
      const pair = `${overwrite.type}:${overwrite.id}`;
      if (overwriteTargets.has(pair)) return false;
      overwriteTargets.add(pair);
      if (overwrite.type === 0 && !roleIds.has(overwrite.id)) return false;
    }
  }

  for (const channel of bundle.channels) {
    if (channel.type === 4 && channel.parentId !== null) return false;
    if (channel.parentId === null) continue;
    if (channel.parentId === channel.id) return false;
    const parent = channelsById.get(channel.parentId);
    if (parent?.type !== 4) return false;
  }

  return !hasParentCycle(bundle.channels, channelsById);
}

function hasParentCycle(
  channels: DiscordChannelSource[],
  channelsById: ReadonlyMap<string, DiscordChannelSource>,
): boolean {
  for (const channel of channels) {
    const visited = new Set<string>();
    let current: DiscordChannelSource | undefined = channel;
    while (current !== undefined && current.parentId !== null) {
      if (visited.has(current.id)) return true;
      visited.add(current.id);
      current = channelsById.get(current.parentId);
    }
  }
  return false;
}
