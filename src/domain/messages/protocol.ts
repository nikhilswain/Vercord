import { z } from 'zod';

import { channelKeySchema } from '../channels/protocol';
import { discordTimestampSchema } from '../discord/source-schema';

export const MESSAGE_HISTORY_LIMIT = 20;
export const MESSAGE_CONTENT_MAX_LENGTH = 4_000;
export const MESSAGE_SEND_MAX_LENGTH = 2_000;

export type MessageSlowmodePolicy = {
  actorKey: string;
  roomKey: string;
  intervalMs: number;
  bypass: boolean;
};

// Server-only observation metadata; never part of RoomMessage.
export const messageSlowmodeObservationSchema = z.strictObject({
  actorKey: z.string().regex(/^m_[A-Za-z0-9_-]{43}$/u),
  nextAllowedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type MessageSlowmodeObservation = z.infer<typeof messageSlowmodeObservationSchema>;

const boundedCountSchema = z.number().int().nonnegative().max(100);
const displayNameSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => !/\p{Cc}/u.test(value));
const avatarUrlSchema = z.url().max(2_048).nullable();
const messageKeySchema = z.string().regex(/^x_[A-Za-z0-9_-]{43}$/u);

export const roomMessageSchema = z.strictObject({
  id: messageKeySchema,
  roomKey: channelKeySchema,
  author: z.strictObject({
    displayName: displayNameSchema,
    avatarUrl: avatarUrlSchema,
    bot: z.boolean(),
  }),
  content: z.string().max(MESSAGE_CONTENT_MAX_LENGTH),
  createdAt: discordTimestampSchema,
  attachmentCount: boundedCountSchema,
  embedCount: boundedCountSchema,
});

export const messageHistorySchema = z
  .strictObject({
    roomKey: channelKeySchema,
    messages: z.array(roomMessageSchema).max(MESSAGE_HISTORY_LIMIT),
    canRead: z.boolean(),
    canSend: z.boolean(),
  })
  .superRefine((history, context) => {
    const ids = new Set<string>();
    let previousTimestamp = Number.NEGATIVE_INFINITY;
    for (const [index, message] of history.messages.entries()) {
      if (message.roomKey !== history.roomKey)
        context.addIssue({
          code: 'custom',
          message: 'Message belongs to another room',
          path: ['messages', index, 'roomKey'],
        });
      if (ids.has(message.id))
        context.addIssue({
          code: 'custom',
          message: 'Duplicate message',
          path: ['messages', index, 'id'],
        });
      ids.add(message.id);
      const timestamp = Date.parse(message.createdAt);
      if (timestamp < previousTimestamp)
        context.addIssue({
          code: 'custom',
          message: 'Messages must be chronological',
          path: ['messages', index, 'createdAt'],
        });
      previousTimestamp = timestamp;
    }
  });

export const messageSendInputSchema = z.strictObject({
  roomKey: channelKeySchema,
  content: z
    .string()
    .min(1)
    .max(MESSAGE_SEND_MAX_LENGTH)
    .refine((value) => value.trim().length > 0),
});

export const messageErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'GUILD_MEMBERSHIP_REQUIRED',
  'MESSAGE_MEMBER_FORBIDDEN',
  'MESSAGE_BOT_FORBIDDEN',
  'MESSAGE_MEMBER_PENDING',
  'MESSAGE_MEMBER_TIMED_OUT',
  'MESSAGE_CHANNEL_NOT_FOUND',
  'MESSAGE_RATE_LIMITED',
  'MESSAGE_REQUEST_EXPIRED',
  'MESSAGE_LIMIT_REACHED',
  'MESSAGE_READ_FAILED',
  'MESSAGE_SEND_REJECTED',
  'MESSAGE_ACTION_UNCERTAIN',
  'INVALID_REQUEST',
  'GATEWAY_UPDATE_REQUIRED',
  'WORLD_SOURCE_UNAVAILABLE',
]);

export type RoomMessage = z.infer<typeof roomMessageSchema>;
export type MessageHistory = z.infer<typeof messageHistorySchema>;
export type MessageSendInput = z.infer<typeof messageSendInputSchema>;
export type MessageErrorCode = z.infer<typeof messageErrorCodeSchema>;
