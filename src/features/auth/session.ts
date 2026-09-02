import { z } from 'zod';

const authUserSchema = z.object({
  id: z.string().regex(/^\d+$/),
  username: z.string().min(1).max(100),
  displayName: z.string().min(1).max(100),
  avatarUrl: z.string().url().nullable(),
});

const authGuildSchema = z.object({
  id: z.string().regex(/^\d+$/),
  name: z.string().min(1).max(100),
  iconUrl: z.string().url().nullable(),
  owner: z.boolean(),
  canManage: z.boolean(),
  connected: z.boolean(),
  synced: z.boolean(),
  published: z.boolean(),
  worldUrl: z.string().startsWith('/').nullable(),
});

export const authSessionSchema = z.object({
  user: authUserSchema,
  guilds: z.array(authGuildSchema).max(200),
});

export const guildSyncResponseSchema = z.object({
  status: z.literal('synced'),
  guildId: z.string().regex(/^\d+$/),
  worldUrl: z.string().startsWith('/').nullable(),
  generatedAt: z.string().datetime(),
  categoryCount: z.number().int().nonnegative(),
  channelCount: z.number().int().nonnegative(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;
export type AuthGuild = z.infer<typeof authGuildSchema>;
