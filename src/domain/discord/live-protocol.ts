import { z } from 'zod';

import {
  channelErrorCodeSchema,
  channelMutationInputSchema,
  channelMutationResultSchema,
  type ChannelMutationInput,
  type ChannelMutationResult,
} from '../channels/protocol';
import {
  discordSourceNameSchema,
  discordTimestampSchema,
  permissionStringSchema,
  snowflakeSchema,
  validateDiscordSourceBundle,
} from './source-schema';
import type { DiscordSourceBundle } from './source';

const MAX_COLLECTION_SIZE = 1_000;
const safeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const requestIdSchema = z.uuid();
const sessionIdSchema = z.uuid();
const subscriptionIdSchema = z.uuid();
const digest = '[A-Za-z0-9_-]{43}';
const guildKeySchema = z.string().regex(new RegExp(`^g_${digest}$`));
const discordSourceBundleSchema = z
  .strictObject({
    bot: z.strictObject({ id: snowflakeSchema }),
    guild: z.strictObject({
      id: snowflakeSchema,
      name: discordSourceNameSchema,
      ownerId: snowflakeSchema,
      roles: z
        .array(z.strictObject({ id: snowflakeSchema, permissions: permissionStringSchema }))
        .max(MAX_COLLECTION_SIZE),
    }),
    botMember: z.strictObject({ roleIds: z.array(snowflakeSchema).max(MAX_COLLECTION_SIZE) }),
    channels: z
      .array(
        z.strictObject({
          id: snowflakeSchema,
          type: z
            .number()
            .int()
            .nonnegative()
            .refine((value) => value !== 1 && value !== 3),
          position: safeIntegerSchema,
          name: discordSourceNameSchema,
          parentId: snowflakeSchema.nullable(),
          nsfw: z.boolean(),
          overwrites: z
            .array(
              z.strictObject({
                id: snowflakeSchema,
                type: z.union([z.literal(0), z.literal(1)]),
                allow: permissionStringSchema,
                deny: permissionStringSchema,
              }),
            )
            .max(MAX_COLLECTION_SIZE),
        }),
      )
      .max(MAX_COLLECTION_SIZE),
  })
  .superRefine((source, context) => {
    try {
      validateDiscordSourceBundle(source, source.guild.id);
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid Discord source relationships' });
    }
  });

export const memberAccessSchema = z.strictObject({
  userId: snowflakeSchema,
  roleIds: z.array(snowflakeSchema).max(MAX_COLLECTION_SIZE),
  pending: z.boolean(),
  communicationDisabledUntil: discordTimestampSchema.nullable(),
});

export const memberRecordSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('present'), member: memberAccessSchema }),
  z.strictObject({ kind: z.literal('absent'), userId: snowflakeSchema }),
]);

export const liveCursorSchema = z.strictObject({
  streamId: sessionIdSchema,
  sequence: safeIntegerSchema,
});

export const liveReadSchema = z.strictObject({
  guildId: snowflakeSchema,
  cursor: liveCursorSchema,
  source: discordSourceBundleSchema,
  member: memberRecordSchema,
});

const commandBase = {
  requestId: requestIdSchema,
  guildId: snowflakeSchema,
  userId: snowflakeSchema,
  expiresAt: safeIntegerSchema,
};

export const liveCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('world-read'),
    ...commandBase,
    subscriptionId: subscriptionIdSchema,
    watch: z.enum(['lease', 'connected']),
  }),
  z.strictObject({
    type: z.literal('world-release'),
    ...commandBase,
    subscriptionId: subscriptionIdSchema,
  }),
  z.strictObject({
    type: z.literal('channel-mutate'),
    ...commandBase,
    input: channelMutationInputSchema,
  }),
]);

export const liveFailureSchema = z.strictObject({
  code: channelErrorCodeSchema,
  status: z.number().int().min(100).max(599),
  retryAt: safeIntegerSchema.optional(),
  scope: z.enum(['admission', 'mutation']).optional(),
});

export const liveCommandResultSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('world-result'),
    requestId: requestIdSchema,
    result: liveReadSchema,
  }),
  z.strictObject({ type: z.literal('release-result'), requestId: requestIdSchema }),
  z.strictObject({
    type: z.literal('channel-result'),
    requestId: requestIdSchema,
    result: channelMutationResultSchema,
    read: liveReadSchema.nullable(),
  }),
  z.strictObject({
    type: z.literal('live-error'),
    requestId: requestIdSchema,
    error: liveFailureSchema,
  }),
]);

const frameBase = {
  serviceSessionId: sessionIdSchema,
  guildKey: guildKeySchema,
  cursor: liveCursorSchema,
};

export const liveFrameSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('world-source'),
    ...frameBase,
    source: discordSourceBundleSchema,
  }),
  z.strictObject({ type: z.literal('world-member'), ...frameBase, member: memberRecordSchema }),
  z.strictObject({ type: z.literal('world-health'), ...frameBase, ready: z.boolean() }),
]);

export type MemberAccess = {
  userId: string;
  roleIds: string[];
  pending: boolean;
  communicationDisabledUntil: string | null;
};
export type MemberRecord =
  { kind: 'present'; member: MemberAccess } | { kind: 'absent'; userId: string };
export type LiveCursor = { streamId: string; sequence: number };
export type LiveRead = {
  guildId: string;
  cursor: LiveCursor;
  source: DiscordSourceBundle;
  member: MemberRecord;
};
export type LiveCommand = {
  requestId: string;
  guildId: string;
  userId: string;
  expiresAt: number;
} & (
  | { type: 'world-read'; subscriptionId: string; watch: 'lease' | 'connected' }
  | { type: 'world-release'; subscriptionId: string }
  | { type: 'channel-mutate'; input: ChannelMutationInput }
);
export type LiveFailure = {
  code: string;
  status: number;
  retryAt?: number;
  scope?: 'admission' | 'mutation';
};
export type LiveCommandResult =
  | { type: 'world-result'; requestId: string; result: LiveRead }
  | { type: 'release-result'; requestId: string }
  | {
      type: 'channel-result';
      requestId: string;
      result: ChannelMutationResult;
      read: LiveRead | null;
    }
  | { type: 'live-error'; requestId: string; error: LiveFailure };
export type LiveFrame = {
  serviceSessionId: string;
  guildKey: string;
  cursor: LiveCursor;
} & (
  | { type: 'world-source'; source: DiscordSourceBundle }
  | { type: 'world-member'; member: MemberRecord }
  | { type: 'world-health'; ready: boolean }
);

export type { ChannelMutationInput, ChannelMutationResult, DiscordSourceBundle };
