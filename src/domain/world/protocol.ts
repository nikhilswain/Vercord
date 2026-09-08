import { z } from 'zod';
import { isSafeMapDisplayText } from '../map/labels';
import { MAP_ROOM_TYPES } from '../map/snapshot';
import { parseWorldDocument } from './document';

export const worldThemeIdSchema = z.enum(['village', 'norse']);
const label = z.string().min(1).max(200).refine(isSafeMapDisplayText);

export const worldBindingsSchema = z
  .array(
    z.strictObject({
      landmarkId: z.string().min(1).max(100),
      rooms: z
        .array(
          z.strictObject({
            key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/u),
            label,
            type: z.enum(MAP_ROOM_TYPES),
          }),
        )
        .max(1_000),
    }),
  )
  .max(100);

export const savedWorldViewSchema = z.strictObject({
  document: z.unknown().transform((value, context) => {
    try {
      return parseWorldDocument(value);
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid saved world' });
      return z.NEVER;
    }
  }),
  checksum: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: z.number().int().nonnegative(),
  server: z.strictObject({ displayName: label }),
  bindings: worldBindingsSchema,
});

export const savedWorldResponseSchema = savedWorldViewSchema.extend({
  player: z.strictObject({
    displayName: label,
    memberKey: z.string().regex(/^m_[A-Za-z0-9_-]{43}$/u),
  }),
});

export type WorldBindings = z.infer<typeof worldBindingsSchema>;
export type SavedWorldResponse = z.infer<typeof savedWorldResponseSchema>;
