import { describe, expect, it } from 'vitest';

import {
  MAP_ROOM_TYPES,
  mapSnapshotSchema,
  parseMapSnapshot,
} from '../../../../src/domain/map/snapshot';
import {
  createEmptyMapSnapshotFixture,
  createLayoutSnapshotFixture,
  createMapSnapshotFixture,
} from '../../../fixtures/map/map-snapshots';

function expectInvalid(value: unknown): void {
  expect(mapSnapshotSchema.safeParse(value).success).toBe(false);
}

describe('MapSnapshot schema', () => {
  it('accepts the exact versioned shape, empty arrays, offsets, and every room type', () => {
    expect(parseMapSnapshot(createMapSnapshotFixture())).toEqual(createMapSnapshotFixture());
    expect(mapSnapshotSchema.safeParse(createEmptyMapSnapshotFixture()).success).toBe(true);
    const value = createLayoutSnapshotFixture([MAP_ROOM_TYPES.length]);
    value.areas[0]!.rooms.forEach((room, index) => {
      room.type = MAP_ROOM_TYPES[index]!;
      room.order = 0;
    });
    value.generatedAt = '2026-08-29T03:30:00Z';
    expect(mapSnapshotSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    { slug: 'UPPERCASE' },
    { slug: '-leading' },
    { slug: 'double--hyphen' },
    { slug: 'ab' },
    { generatedAt: '2026-08-29' },
    { generatedAt: '2026-08-29T03:30:00' },
  ])('rejects invalid root values %#', (change) => {
    expectInvalid({ ...createMapSnapshotFixture(), ...change });
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects order %s', (order) => {
    const value = createMapSnapshotFixture();
    value.areas[0]!.rooms[0]!.order = order;
    expectInvalid(value);
  });

  it('rejects unknown fields at every object level', () => {
    const root = { ...createMapSnapshotFixture(), guildId: 'invented-guild' };
    expectInvalid(root);
    const server = createMapSnapshotFixture();
    expectInvalid({
      ...server,
      server: { ...server.server, iconUrl: 'https://example.test/icon.png' },
    });
    const area = createMapSnapshotFixture();
    expectInvalid({
      ...area,
      areas: [{ ...area.areas[0]!, memberCount: 5 }],
    });
    const roomValue = createMapSnapshotFixture();
    expectInvalid({
      ...roomValue,
      areas: [
        {
          ...roomValue.areas[0]!,
          rooms: [{ ...roomValue.areas[0]!.rooms[0]!, topic: 'private-looking' }],
        },
      ],
    });
  });

  it.each([
    ['ownerId', 'owner-key'],
    ['permissions', 8],
    ['permission_overwrites', []],
    ['memberCount', 99],
    ['nsfw', true],
    ['ageRestricted', true],
  ] as const)('rejects private field %s rather than stripping it', (field, payload) => {
    const value = createMapSnapshotFixture();
    const roomValue = { ...value.areas[0]!.rooms[0]!, [field]: payload };
    expectInvalid({
      ...value,
      areas: [{ ...value.areas[0]!, rooms: [roomValue] }],
    });
  });

  it('rejects duplicate area and globally duplicate room keys', () => {
    const duplicateArea = createLayoutSnapshotFixture([1, 1]);
    duplicateArea.areas[1]!.key = duplicateArea.areas[0]!.key;
    expectInvalid(duplicateArea);

    const duplicateRoom = createLayoutSnapshotFixture([1, 1]);
    duplicateRoom.areas[1]!.rooms[0]!.key = duplicateRoom.areas[0]!.rooms[0]!.key;
    expectInvalid(duplicateRoom);
  });

  it('accepts exactly 1,000 rooms and rejects 1,001 total rooms', () => {
    expect(mapSnapshotSchema.safeParse(createLayoutSnapshotFixture([1_000])).success).toBe(true);
    expectInvalid(createLayoutSnapshotFixture([600, 401]));
    expectInvalid(createLayoutSnapshotFixture(Array.from({ length: 101 }, () => 0)));
  });
});
