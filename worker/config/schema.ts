import { z } from 'zod';

export interface DiscordSourceConfig {
  botToken: string;
  guildId: string;
}

export interface SyncAuthConfig {
  syncSecret: string;
}

export interface PublicationAllowlist {
  categoryIds: string[];
  channelIds: string[];
}

const uint64Maximum = (1n << 64n) - 1n;
const base64UrlSecret = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .refine((value) => !value.startsWith('enter-') && !value.startsWith('generate-'));

const discordSnowflake = z
  .string()
  .regex(/^[1-9]\d*$/)
  .refine((value) => {
    try {
      return BigInt(value) <= uint64Maximum;
    } catch {
      return false;
    }
  });

const discordSourceSchema = z.object({
  DISCORD_BOT_TOKEN: z
    .string()
    .min(20)
    .max(512)
    .regex(/^\S+$/)
    .refine((value) => !value.startsWith('enter-') && !value.startsWith('generate-')),
  DISCORD_GUILD_ID: discordSnowflake,
});

const syncAuthSchema = z.object({
  SYNC_SECRET: base64UrlSecret,
});

export const runtimeOnlySchema = z.object({
  MAP_SLUG: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(3)
    .max(63),
  SNAPSHOT_ID_SECRET: base64UrlSecret,
});

const publicationAllowlistSchema = z
  .strictObject({
    categoryIds: z.array(discordSnowflake).max(500),
    channelIds: z.array(discordSnowflake).max(1_000),
  })
  .refine((value) => new Set(value.categoryIds).size === value.categoryIds.length)
  .refine((value) => new Set(value.channelIds).size === value.channelIds.length);

type DiscordSourceValues = {
  DISCORD_BOT_TOKEN?: unknown;
  DISCORD_GUILD_ID?: unknown;
};

type SyncAuthValues = { SYNC_SECRET?: unknown };
type PublicationAllowlistValues = { PUBLICATION_ALLOWLIST_JSON?: unknown };

export function parseDiscordSourceConfig(values: Record<string, unknown>): DiscordSourceConfig;
export function parseDiscordSourceConfig(values: DiscordSourceValues): DiscordSourceConfig;
export function parseDiscordSourceConfig(values: DiscordSourceValues): DiscordSourceConfig {
  const parsed = discordSourceSchema.safeParse(values);
  if (!parsed.success) throw new Error('CONFIG_INVALID');
  return { botToken: parsed.data.DISCORD_BOT_TOKEN, guildId: parsed.data.DISCORD_GUILD_ID };
}

export function parseSyncAuthConfig(values: Record<string, unknown>): SyncAuthConfig;
export function parseSyncAuthConfig(values: SyncAuthValues): SyncAuthConfig;
export function parseSyncAuthConfig(values: SyncAuthValues): SyncAuthConfig {
  const parsed = syncAuthSchema.safeParse(values);
  if (!parsed.success) throw new Error('CONFIG_INVALID');
  return { syncSecret: parsed.data.SYNC_SECRET };
}

export function parsePublicationAllowlist(
  values: Record<string, unknown>,
): PublicationAllowlist;
export function parsePublicationAllowlist(
  values: PublicationAllowlistValues,
): PublicationAllowlist;
export function parsePublicationAllowlist(
  values: PublicationAllowlistValues,
): PublicationAllowlist {
  if (values.PUBLICATION_ALLOWLIST_JSON === undefined) {
    return { categoryIds: [], channelIds: [] };
  }
  if (
    typeof values.PUBLICATION_ALLOWLIST_JSON !== 'string' ||
    values.PUBLICATION_ALLOWLIST_JSON.length > 100_000
  ) {
    throw new Error('CONFIG_INVALID');
  }

  try {
    const parsed = publicationAllowlistSchema.safeParse(
      JSON.parse(values.PUBLICATION_ALLOWLIST_JSON),
    );
    if (!parsed.success) throw new Error('CONFIG_INVALID');
    return parsed.data;
  } catch {
    throw new Error('CONFIG_INVALID');
  }
}
