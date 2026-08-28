import { z } from 'zod';

export interface DiscordSourceConfig {
  botToken: string;
  guildId: string;
}

export interface SyncAuthConfig {
  syncSecret: string;
}

const uint64Maximum = (1n << 64n) - 1n;
const base64UrlSecret = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .refine((value) => !value.startsWith('enter-') && !value.startsWith('generate-'));

const discordSourceSchema = z.object({
  DISCORD_BOT_TOKEN: z
    .string()
    .min(20)
    .max(512)
    .regex(/^\S+$/)
    .refine((value) => !value.startsWith('enter-') && !value.startsWith('generate-')),
  DISCORD_GUILD_ID: z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((value) => {
      try {
        return BigInt(value) <= uint64Maximum;
      } catch {
        return false;
      }
    }),
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

export function parseDiscordSourceConfig(values: Record<string, unknown>): DiscordSourceConfig {
  const parsed = discordSourceSchema.safeParse(values);
  if (!parsed.success) throw new Error('CONFIG_INVALID');
  return { botToken: parsed.data.DISCORD_BOT_TOKEN, guildId: parsed.data.DISCORD_GUILD_ID };
}

export function parseSyncAuthConfig(values: Record<string, unknown>): SyncAuthConfig {
  const parsed = syncAuthSchema.safeParse(values);
  if (!parsed.success) throw new Error('CONFIG_INVALID');
  return { syncSecret: parsed.data.SYNC_SECRET };
}
