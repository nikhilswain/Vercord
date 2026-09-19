import { z } from 'zod';
import { isSafeMapDisplayText } from '../map/labels';
import { MAP_ROOM_TYPES } from '../map/snapshot';
import { parseWorldDocument } from './document';
import { WORLD_THEME_IDS } from './catalog/themes';
import { isHouseSceneId, type HouseSceneId } from './catalog/scenes';
import { houseInteriorSchema } from './interiors';
import { forestVisitSchema } from './forest/catalog';

export const worldThemeIdSchema = z.enum(WORLD_THEME_IDS);
export const houseSceneIdSchema = z
  .string()
  .refine(isHouseSceneId)
  .transform((value) => value as HouseSceneId);
const label = z.string().min(1).max(200).refine(isSafeMapDisplayText);
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/u);
const townRoom = z.strictObject({
  key,
  label,
  type: z.enum(MAP_ROOM_TYPES),
  landmarkId: z.string().regex(/^house:[0-9]{1,5}$/u),
});
export const streetSelectionSchema = z.union([z.literal('square'), z.uuid()]).optional();
export type StreetSelection = z.infer<typeof streetSelectionSchema>;
export const worldTownSchema = z
  .strictObject({
    continuous: z.literal(true).optional(),
    activeStreetId: z.uuid().nullable(),
    districts: z
      .array(
        z.strictObject({
          key,
          label,
          anchors: z
            .array(
              z.strictObject({ x: z.number().min(0).max(32768), y: z.number().min(0).max(32768) }),
            )
            .max(256)
            .optional(),
          streets: z
            .array(
              z.strictObject({
                id: z.uuid(),
                number: z.number().int().positive().max(2000),
                rooms: z.array(townRoom).max(6),
              }),
            )
            .max(1000),
        }),
      )
      .max(100),
  })
  .superRefine((town, context) => {
    const streets = town.districts.flatMap((district) => district.streets);
    const rooms = streets.flatMap((street) => street.rooms);
    if (
      rooms.length > 1000 ||
      new Set(rooms.map((room) => room.key)).size !== rooms.length ||
      new Set(streets.map((street) => street.id)).size !== streets.length ||
      (town.continuous && new Set(rooms.map((room) => room.landmarkId)).size !== rooms.length) ||
      new Set(town.districts.map((district) => district.key)).size !== town.districts.length ||
      streets.some(
        (street) =>
          new Set(street.rooms.map((room) => room.landmarkId)).size !== street.rooms.length,
      ) ||
      (town.activeStreetId !== null && !streets.some((street) => street.id === town.activeStreetId))
    ) {
      context.addIssue({ code: 'custom', message: 'Invalid town directory' });
    }
  });
export type WorldTown = z.infer<typeof worldTownSchema>;

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
  .max(1000);

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
  town: worldTownSchema.optional(),
  interior: houseInteriorSchema.optional(),
  forest: forestVisitSchema.optional(),
});

export const savedWorldResponseSchema = savedWorldViewSchema.extend({
  player: z.strictObject({
    displayName: label,
    memberKey: z.string().regex(/^m_[A-Za-z0-9_-]{43}$/u),
  }),
});

export type WorldBindings = z.infer<typeof worldBindingsSchema>;
export type SavedWorldResponse = z.infer<typeof savedWorldResponseSchema>;
