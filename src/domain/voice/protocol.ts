import { z } from 'zod';

const digest = '[A-Za-z0-9_-]{43}';
const guildKeySchema = z.string().regex(new RegExp(`^g_${digest}$`));
const channelKeySchema = z.string().regex(new RegExp(`^c_${digest}$`));
const presenceIdSchema = z.string().regex(new RegExp(`^p_${digest}$`));
const snowflakeSchema = z.string().regex(/^[1-9]\d{16,19}$/u);
const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const sessionIdSchema = z.uuid();
const requestIdSchema = z.uuid();

export const voiceStateSchema = z.strictObject({
  serviceSessionId: sessionIdSchema,
  revision: revisionSchema,
  channelKey: channelKeySchema.nullable(),
  selfMute: z.boolean(),
  selfDeaf: z.boolean(),
  serverMute: z.boolean(),
  serverDeaf: z.boolean(),
  suppress: z.boolean(),
});

export const voiceServiceStatusSchema = z.enum(['online', 'offline']);

const bridgeHelloSchema = z.strictObject({
  type: z.literal('hello'),
  protocolVersion: z.literal(1),
  serviceSessionId: sessionIdSchema,
  guildKeys: z
    .array(guildKeySchema)
    .max(500)
    .refine((keys) => new Set(keys).size === keys.length),
});

const bridgeVoiceStateSchema = z.strictObject({
  type: z.literal('voice-state'),
  guildKey: guildKeySchema,
  presenceId: presenceIdSchema,
  state: voiceStateSchema,
});

const bridgeVoiceSnapshotSchema = z
  .strictObject({
    type: z.literal('voice-snapshot'),
    guildKey: guildKeySchema,
    serviceSessionId: sessionIdSchema,
    revision: revisionSchema,
    states: z
      .array(z.strictObject({ presenceId: presenceIdSchema, state: voiceStateSchema }))
      .max(1_000),
  })
  .refine(
    ({ serviceSessionId, revision, states }) =>
      new Set(states.map(({ presenceId }) => presenceId)).size === states.length &&
      states.every(
        ({ state }) => state.serviceSessionId === serviceSessionId && state.revision === revision,
      ),
  );

export const gatewayCommandErrorCodeSchema = z.enum([
  'NOT_CONNECTED',
  'CHANNEL_NOT_FOUND',
  'MEMBER_FORBIDDEN',
  'BOT_FORBIDDEN',
  'RATE_LIMITED',
  'GUILD_NOT_FOUND',
  'MEMBER_NOT_FOUND',
  'GATEWAY_UNAVAILABLE',
  'DISCORD_ERROR',
]);

export const gatewayCommandResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    type: z.literal('command-result'),
    requestId: requestIdSchema,
    ok: z.literal(true),
    state: voiceStateSchema.nullable(),
  }),
  z.strictObject({
    type: z.literal('command-result'),
    requestId: requestIdSchema,
    ok: z.literal(false),
    errorCode: gatewayCommandErrorCodeSchema,
  }),
]);

export const gatewayBridgeMessageSchema = z.union([
  bridgeHelloSchema,
  bridgeVoiceStateSchema,
  bridgeVoiceSnapshotSchema,
  gatewayCommandResultSchema,
]);

const commandBase = {
  requestId: requestIdSchema,
  guildId: snowflakeSchema,
  userId: snowflakeSchema,
};

export const gatewayCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('voice-query'), ...commandBase }),
  z.strictObject({ type: z.literal('move'), ...commandBase, roomKey: channelKeySchema }),
  z.strictObject({ type: z.literal('disconnect'), ...commandBase }),
]);

export const voiceApiResponseSchema = z.strictObject({
  service: voiceServiceStatusSchema,
  state: voiceStateSchema.nullable(),
});

export type VoiceState = z.infer<typeof voiceStateSchema>;
export type VoiceServiceStatus = z.infer<typeof voiceServiceStatusSchema>;
export type GatewayBridgeMessage = z.infer<typeof gatewayBridgeMessageSchema>;
export type GatewayCommand = z.infer<typeof gatewayCommandSchema>;
export type GatewayCommandResult = z.infer<typeof gatewayCommandResultSchema>;
export type GatewayCommandErrorCode = z.infer<typeof gatewayCommandErrorCodeSchema>;
export type VoiceApiResponse = z.infer<typeof voiceApiResponseSchema>;
