import { z } from 'zod';

import { AVATAR_IDS } from '../avatar/identity';

const directionSchema = z.enum(['down', 'left', 'right', 'up']);
const sceneSchema = z.union([
  z.literal('exterior'),
  z.string().regex(/^room:[a-z][a-z0-9_-]{0,63}$/u),
]);
const coordinateSchema = z.number().finite().min(0).max(100_000);
const presenceIdSchema = z.string().regex(/^p_[A-Za-z0-9_-]{43}$/u);

export const clientPresenceMessageSchema = z.strictObject({
  type: z.literal('move'),
  seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  x: coordinateSchema,
  y: coordinateSchema,
  direction: directionSchema,
  moving: z.boolean(),
  scene: sceneSchema,
});

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
  z.strictObject({
    type: z.literal('welcome'),
    selfId: presenceIdSchema,
    selfAvatarId: z.enum(AVATAR_IDS),
    players: z.array(presencePlayerSchema).max(200),
  }),
  z.strictObject({
    type: z.literal('player'),
    player: presencePlayerSchema,
  }),
  z.strictObject({
    type: z.literal('leave'),
    id: presenceIdSchema,
  }),
]);

export type ClientPresenceMessage = z.infer<typeof clientPresenceMessageSchema>;
export type ClientPresenceLocation = Omit<ClientPresenceMessage, 'type' | 'seq'>;
export type PresencePlayer = z.infer<typeof presencePlayerSchema>;
export type ServerPresenceMessage = z.infer<typeof serverPresenceMessageSchema>;
