import { z } from 'zod';

import { AVATAR_IDS } from '../avatar/identity';
import { worldSyncSchema, worldViewSchema } from '../channels/protocol';
import {
  messageErrorCodeSchema,
  messageHistorySchema,
  messageSendInputSchema,
  roomMessageSchema,
} from '../messages/protocol';
import { voiceServiceStatusSchema, voiceStateSchema } from '../voice/protocol';

const directionSchema = z.enum(['down', 'left', 'right', 'up']);
const sceneSchema = z.union([
  z.literal('exterior'),
  z.string().regex(/^room:[a-z][a-z0-9_-]{0,63}$/u),
]);
const coordinateSchema = z.number().finite().min(0).max(100_000);
const presenceIdSchema = z.string().regex(/^p_[A-Za-z0-9_-]{43}$/u);

const requestIdSchema = z.uuid();

export const clientPresenceMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('move'),
    seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    x: coordinateSchema,
    y: coordinateSchema,
    direction: directionSchema,
    moving: z.boolean(),
    scene: sceneSchema,
  }),
  z.strictObject({
    type: z.literal('message-read'),
    requestId: requestIdSchema,
    roomKey: messageSendInputSchema.shape.roomKey,
  }),
  z.strictObject({
    type: z.literal('message-send'),
    requestId: requestIdSchema,
    input: messageSendInputSchema,
  }),
]);

export const presencePlayerSchema = z.strictObject({
  id: presenceIdSchema,
  displayName: z.string().min(1).max(100),
  avatarId: z.enum(AVATAR_IDS),
  x: coordinateSchema,
  y: coordinateSchema,
  direction: directionSchema,
  moving: z.boolean(),
  scene: sceneSchema,
});

export const serverPresenceMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('world-invalidated') }),
  z.strictObject({
    type: z.literal('welcome'),
    selfId: presenceIdSchema,
    selfAvatarId: z.enum(AVATAR_IDS),
    players: z.array(presencePlayerSchema).max(200),
    voiceService: voiceServiceStatusSchema,
    voiceState: voiceStateSchema.nullable(),
    worldView: worldViewSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('player'),
    player: presencePlayerSchema,
  }),
  z.strictObject({
    type: z.literal('leave'),
    id: presenceIdSchema,
  }),
  z.strictObject({
    type: z.literal('voice-state'),
    state: voiceStateSchema,
  }),
  z.strictObject({
    type: z.literal('voice-service'),
    service: voiceServiceStatusSchema,
  }),
  z.strictObject({ type: z.literal('world-view'), view: worldViewSchema }),
  z.strictObject({ type: z.literal('world-sync'), sync: worldSyncSchema }),
  z.strictObject({
    type: z.literal('message-history'),
    requestId: requestIdSchema,
    result: messageHistorySchema,
  }),
  z.strictObject({
    type: z.literal('message-read-error'),
    requestId: requestIdSchema,
    code: messageErrorCodeSchema,
  }),
  z.discriminatedUnion('status', [
    z.strictObject({
      type: z.literal('message-send-result'),
      requestId: requestIdSchema,
      status: z.literal('applied'),
      message: roomMessageSchema,
    }),
    z.strictObject({
      type: z.literal('message-send-result'),
      requestId: requestIdSchema,
      status: z.literal('rejected'),
      code: messageErrorCodeSchema,
    }),
    z.strictObject({
      type: z.literal('message-send-result'),
      requestId: requestIdSchema,
      status: z.literal('uncertain'),
      code: z.literal('MESSAGE_ACTION_UNCERTAIN'),
    }),
  ]),
  z.strictObject({ type: z.literal('room-message'), message: roomMessageSchema }),
]);

export type ClientPresenceMessage = z.infer<typeof clientPresenceMessageSchema>;
export type ClientPresenceLocation = Omit<
  Extract<ClientPresenceMessage, { type: 'move' }>,
  'type' | 'seq'
>;
export type PresencePlayer = z.infer<typeof presencePlayerSchema>;
export type ServerPresenceMessage = z.infer<typeof serverPresenceMessageSchema>;
