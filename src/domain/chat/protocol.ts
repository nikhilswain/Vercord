import { z } from 'zod';

export const CHAT_BODY_LIMIT = 1000;
export const CHAT_PAGE_SIZE = 50;
export const CHAT_ROOM_LIMIT = 500;
export const CHAT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const CHAT_BUFFER_LIMIT = 200;
export const PARTY_LIMIT = 4;
export const chatPlayerIdSchema = z.string().regex(/^p_[A-Za-z0-9_-]{43}$/u);
export const chatPersonSchema = z.strictObject({
  id: chatPlayerIdSchema,
  name: z.string().min(1).max(100),
});
export const chatOnlinePersonSchema = chatPersonSchema.extend({
  area: z.string().trim().max(80).optional(),
  status: z.enum(['online', 'away']).optional(),
});
export const partyInvitationSchema = z.strictObject({
  id: z.uuid(),
  from: chatPersonSchema,
  to: chatPersonSchema,
  partyName: z.string().min(1).max(100),
  expiresAt: z.number().int().positive(),
});
export const chatRoomIdSchema = z.string().min(1).max(180);
export const chatRoomSchema = z.strictObject({
  id: chatRoomIdSchema,
  kind: z.enum(['global', 'party', 'direct']),
  name: z.string().min(1).max(100),
  members: z.array(chatPersonSchema).max(8),
  latestSequence: z.number().int().nonnegative().optional(),
});
export const chatMessageSchema = z.strictObject({
  id: z.uuid(),
  requestId: z.uuid(),
  sequence: z.number().int().positive(),
  roomId: chatRoomIdSchema,
  sender: chatPersonSchema,
  body: z.string().min(1).max(CHAT_BODY_LIMIT),
  sentAt: z.number().int().nonnegative(),
});
export const chatCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ping') }),
  z.strictObject({
    type: z.literal('presence'),
    area: z.string().trim().max(80),
    away: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('party-invite'),
    requestId: z.uuid(),
    peerId: chatPlayerIdSchema,
  }),
  z.strictObject({
    type: z.literal('party-answer'),
    requestId: z.uuid(),
    invitationId: z.uuid(),
    accept: z.boolean(),
  }),
  z.strictObject({ type: z.literal('party-leave'), requestId: z.uuid() }),
  z.strictObject({ type: z.literal('direct'), requestId: z.uuid(), peerId: chatPlayerIdSchema }),
  z.strictObject({
    type: z.literal('history'),
    requestId: z.uuid(),
    roomId: chatRoomIdSchema,
    before: z.number().int().positive().optional(),
  }),
  z.strictObject({
    type: z.literal('send'),
    requestId: z.uuid(),
    roomId: chatRoomIdSchema,
    body: z
      .string()
      .trim()
      .min(1)
      .max(CHAT_BODY_LIMIT)
      .refine((value) =>
        Array.from(value).every((char) => {
          const code = char.codePointAt(0)!;
          return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
        }),
      ),
  }),
]);
export const chatErrorCodeSchema = z.enum([
  'INVALID_MESSAGE',
  'NOT_ALLOWED',
  'RATE_LIMITED',
  'UNAVAILABLE',
  'CONFLICT',
  'SESSION_EXPIRED',
  'PARTY_FULL',
  'ALREADY_IN_PARTY',
  'INVITATION_EXPIRED',
]);
export const chatEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('pong') }),
  z.strictObject({
    type: z.literal('welcome'),
    self: chatPersonSchema,
    people: z.array(chatOnlinePersonSchema).max(200),
    rooms: z.array(chatRoomSchema).max(100),
  }),
  z.strictObject({ type: z.literal('people'), people: z.array(chatOnlinePersonSchema).max(200) }),
  z.strictObject({
    type: z.literal('social'),
    invitations: z.array(partyInvitationSchema).max(20),
    requestId: z.uuid().optional(),
  }),
  z.strictObject({ type: z.literal('rooms'), rooms: z.array(chatRoomSchema).max(100) }),
  z.strictObject({
    type: z.literal('history'),
    requestId: z.uuid(),
    room: chatRoomSchema,
    messages: z.array(chatMessageSchema).max(CHAT_PAGE_SIZE),
    hasMore: z.boolean(),
  }),
  z.strictObject({ type: z.literal('message'), room: chatRoomSchema, message: chatMessageSchema }),
  z.strictObject({ type: z.literal('ack'), requestId: z.uuid(), message: chatMessageSchema }),
  z.strictObject({
    type: z.literal('error'),
    requestId: z.uuid().optional(),
    code: chatErrorCodeSchema,
  }),
]);
export type ChatPerson = z.infer<typeof chatPersonSchema>;
export type ChatOnlinePerson = z.infer<typeof chatOnlinePersonSchema>;
export type PartyInvitation = z.infer<typeof partyInvitationSchema>;
export type ChatRoom = z.infer<typeof chatRoomSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatCommand = z.infer<typeof chatCommandSchema>;
export type ChatEvent = z.infer<typeof chatEventSchema>;
export type ChatErrorCode = z.infer<typeof chatErrorCodeSchema>;
export const GLOBAL_CHAT: ChatRoom = { id: 'global', kind: 'global', name: 'World', members: [] };
export function directRoomId(a: string, b: string): string {
  return `direct:${[a, b].sort().join(':')}`;
}
