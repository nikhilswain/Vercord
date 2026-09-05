import { z } from 'zod';

import { mapSnapshotSchema } from '../map/snapshot';
import { isSafeMapDisplayText } from '../map/labels';

export const channelKeySchema = z.string().regex(/^c_[a-z0-9_-]{43}$/u);
export const channelNameSchema = z.string().trim().refine(isSafeMapDisplayText);
const labelSchema = z.string().refine(isSafeMapDisplayText);

export const createChannelSchema = z.strictObject({
  name: channelNameSchema,
  type: z.enum(['text', 'voice']),
  parentKey: channelKeySchema.nullable(),
});
export const renameChannelSchema = z.strictObject({
  name: channelNameSchema,
  expectedName: labelSchema,
});
export const deleteChannelSchema = z.strictObject({ expectedName: labelSchema });

export const channelControlsSchema = z.strictObject({
  canCreateRoot: z.boolean(),
  categories: z.array(z.strictObject({ key: channelKeySchema, label: labelSchema })).max(1_000),
  manageableKeys: z.array(channelKeySchema).max(1_000),
});

export const channelStateSchema = z.strictObject({
  snapshot: mapSnapshotSchema,
  controls: channelControlsSchema,
});

const safeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const requestIdSchema = z.uuid();

export const channelErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'GUILD_MEMBERSHIP_REQUIRED',
  'CHANNEL_MEMBER_FORBIDDEN',
  'CHANNEL_BOT_FORBIDDEN',
  'CHANNEL_NOT_FOUND',
  'CHANNEL_CHANGED',
  'CHANNEL_RATE_LIMITED',
  'CHANNEL_LIMIT_REACHED',
  'CHANNEL_CHANGE_REJECTED',
  'INVALID_REQUEST',
  'CHANNEL_ACTION_UNCERTAIN',
  'GATEWAY_UPDATE_REQUIRED',
  'WORLD_SOURCE_UNAVAILABLE',
]);

export const worldViewVersionSchema = z.strictObject({
  epoch: safeIntegerSchema,
  revision: safeIntegerSchema,
});

export const worldViewSchema = channelStateSchema.extend({ version: worldViewVersionSchema });

export const worldSyncSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('ready') }),
  z.strictObject({ state: z.literal('recovering'), code: channelErrorCodeSchema }),
  z.strictObject({
    state: z.literal('cooldown'),
    scope: z.enum(['admission', 'mutation']),
    retryAt: safeIntegerSchema,
    code: channelErrorCodeSchema,
  }),
  z.strictObject({
    state: z.literal('denied'),
    code: z.enum(['UNAUTHENTICATED', 'GUILD_MEMBERSHIP_REQUIRED']),
  }),
  z.strictObject({
    state: z.literal('offline'),
    code: z.enum(['GATEWAY_UPDATE_REQUIRED', 'WORLD_SOURCE_UNAVAILABLE']),
  }),
]);

export const channelMutationInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('create'), data: createChannelSchema }),
  z.strictObject({
    kind: z.literal('rename'),
    roomKey: channelKeySchema,
    data: renameChannelSchema,
  }),
  z.strictObject({
    kind: z.literal('delete'),
    roomKey: channelKeySchema,
    data: deleteChannelSchema,
  }),
]);

export const channelMutationResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('applied'),
    requestId: requestIdSchema,
    view: worldViewSchema.nullable(),
  }),
  z.strictObject({
    status: z.literal('rejected'),
    requestId: requestIdSchema,
    code: channelErrorCodeSchema,
    retryAt: safeIntegerSchema.optional(),
  }),
  z.strictObject({
    status: z.literal('uncertain'),
    requestId: requestIdSchema,
    code: z.literal('CHANNEL_ACTION_UNCERTAIN'),
  }),
]);

export type ChannelControls = z.infer<typeof channelControlsSchema>;
export type ChannelState = z.infer<typeof channelStateSchema>;
export type CreateChannel = z.infer<typeof createChannelSchema>;
export type RenameChannel = z.infer<typeof renameChannelSchema>;
export type WorldViewVersion = { epoch: number; revision: number };
export type WorldView = ChannelState & { version: WorldViewVersion };
export type WorldSync =
  | { state: 'ready' }
  | { state: 'recovering'; code: string }
  | { state: 'cooldown'; scope: 'admission' | 'mutation'; retryAt: number; code: string }
  | { state: 'denied'; code: 'UNAUTHENTICATED' | 'GUILD_MEMBERSHIP_REQUIRED' }
  | { state: 'offline'; code: 'GATEWAY_UPDATE_REQUIRED' | 'WORLD_SOURCE_UNAVAILABLE' };
export type ChannelMutationInput =
  | { kind: 'create'; data: CreateChannel }
  | { kind: 'rename'; roomKey: string; data: RenameChannel }
  | { kind: 'delete'; roomKey: string; data: { expectedName: string } };
export type ChannelMutationResult =
  | { status: 'applied'; requestId: string; view: WorldView | null }
  | { status: 'rejected'; requestId: string; code: string; retryAt?: number }
  | { status: 'uncertain'; requestId: string; code: 'CHANNEL_ACTION_UNCERTAIN' };
