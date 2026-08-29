import type { MapRoom, MapRoomType, MapSnapshot } from '../../../src/domain/map/snapshot';

const ROOM_TYPES: readonly MapRoomType[] = [
  'text',
  'voice',
  'announcement',
  'stage',
  'forum',
  'media',
  'unsupported',
];

function room(areaIndex: number, roomIndex: number): MapRoom {
  return {
    key: 'room-' + areaIndex + '-' + roomIndex,
    label: 'Room ' + (areaIndex + 1) + '.' + (roomIndex + 1),
    type: ROOM_TYPES[roomIndex % ROOM_TYPES.length] ?? 'unsupported',
    order: roomIndex,
  };
}

export function createLayoutSnapshotFixture(roomCounts: readonly number[]): MapSnapshot {
  return {
    schemaVersion: 1,
    slug: 'layout-fixture',
    generatedAt: '2026-08-29T09:00:00+05:30',
    server: { displayName: 'Layout Workshop' },
    areas: roomCounts.map((roomCount, areaIndex) => ({
      key: 'area-' + areaIndex,
      label: 'Area ' + (areaIndex + 1),
      order: areaIndex,
      rooms: Array.from({ length: roomCount }, (_, roomIndex) => room(areaIndex, roomIndex)),
    })),
  };
}

export function createMapSnapshotFixture(): MapSnapshot {
  return structuredClone({
    schemaVersion: 1,
    slug: 'northstar-commons',
    generatedAt: '2026-08-29T09:00:00+05:30',
    server: { displayName: 'Northstar Commons' },
    areas: [
      {
        key: 'area-arrivals',
        label: 'Arrivals',
        order: 0,
        rooms: [
          { key: 'room-welcome', label: 'welcome', type: 'text', order: 0 },
          {
            key: 'room-broadcasts',
            label: 'broadcasts',
            type: 'announcement',
            order: 1,
          },
        ],
      },
    ],
  } satisfies MapSnapshot);
}

export function createEmptyMapSnapshotFixture(): MapSnapshot {
  const value = createMapSnapshotFixture();
  value.areas = [];
  return value;
}

export function createUncategorizedMapSnapshotFixture(): MapSnapshot {
  const value = createMapSnapshotFixture();
  value.areas = [
    {
      key: 'area-uncategorized',
      label: 'Uncategorized',
      order: 0,
      rooms: [{ key: 'room-oddments', label: 'oddments', type: 'unsupported', order: 0 }],
    },
  ];
  return value;
}

export function createLongLabelMapSnapshotFixture(): MapSnapshot {
  const value = createMapSnapshotFixture();
  value.server.displayName = 'N'.repeat(100);
  value.areas[0]!.label = 'A'.repeat(100);
  value.areas[0]!.rooms[0]!.label = '🧭'.repeat(100);
  return value;
}

export function createLargeMapSnapshotFixture(): MapSnapshot {
  return createLayoutSnapshotFixture(Array.from({ length: 100 }, () => 10));
}

export function createMalformedMapSnapshotFixture(): unknown {
  return {
    ...createMapSnapshotFixture(),
    memberCount: 42,
  };
}
