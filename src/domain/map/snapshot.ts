import { z } from 'zod';

import { MapDomainError } from './errors';
import { isSafeMapDisplayText } from './labels';

export const MAP_ROOM_TYPES = [
  'text',
  'voice',
  'announcement',
  'stage',
  'forum',
  'media',
  'unsupported',
] as const;

export type MapRoomType = (typeof MAP_ROOM_TYPES)[number];
export interface MapRoom {
  key: string;
  label: string;
  type: MapRoomType;
  order: number;
}
export interface MapArea {
  key: string;
  label: string;
  order: number;
  rooms: MapRoom[];
}
export interface MapSnapshot {
  schemaVersion: 1;
  slug: string;
  generatedAt: string;
  server: { displayName: string };
  areas: MapArea[];
}

const labelSchema = z.string().refine(isSafeMapDisplayText);
const keySchema = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const orderSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const roomSchema = z.strictObject({
  key: keySchema,
  label: labelSchema,
  type: z.enum(MAP_ROOM_TYPES),
  order: orderSchema,
});
const areaSchema = z.strictObject({
  key: keySchema,
  label: labelSchema,
  order: orderSchema,
  rooms: z.array(roomSchema).max(1_000),
});
const mapSnapshotBaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  slug: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  generatedAt: z.iso.datetime({ offset: true }),
  server: z.strictObject({ displayName: labelSchema }),
  areas: z.array(areaSchema).max(100),
});

export const mapSnapshotSchema: z.ZodType<MapSnapshot> = mapSnapshotBaseSchema.superRefine(
  (snapshot, context) => {
    const areaKeys = new Set<string>();
    const roomKeys = new Set<string>();
    let totalRooms = 0;

    snapshot.areas.forEach((area, areaIndex) => {
      if (areaKeys.has(area.key)) {
        context.addIssue({
          code: 'custom',
          path: ['areas', areaIndex, 'key'],
          message: 'Duplicate area key',
        });
      }
      areaKeys.add(area.key);
      area.rooms.forEach((room, roomIndex) => {
        totalRooms += 1;
        if (roomKeys.has(room.key)) {
          context.addIssue({
            code: 'custom',
            path: ['areas', areaIndex, 'rooms', roomIndex, 'key'],
            message: 'Duplicate room key',
          });
        }
        roomKeys.add(room.key);
      });
    });

    if (totalRooms > 1_000) {
      context.addIssue({
        code: 'custom',
        path: ['areas'],
        message: 'Map contains more than 1,000 rooms',
      });
    }
  },
);

export function parseMapSnapshot(value: unknown): MapSnapshot {
  const parsed = mapSnapshotSchema.safeParse(value);
  if (!parsed.success) throw new MapDomainError();
  return parsed.data;
}
