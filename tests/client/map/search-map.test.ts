import { describe, expect, it } from 'vitest';

import type { MapSnapshot } from '../../../src/domain/map/snapshot';
import { normalizeMapSearchText, searchMapRooms } from '../../../src/features/map/search-map';
import { createMapSnapshotFixture } from '../../fixtures/map/map-snapshots';

function createSearchSnapshot(): MapSnapshot {
  const snapshot = createMapSnapshotFixture();
  snapshot.areas = [
    {
      key: 'area-z',
      label: 'Workshop',
      order: 1,
      rooms: [{ key: 'room-z', label: 'voice lounge', type: 'voice', order: 0 }],
    },
    {
      key: 'area-b',
      label: 'Commons',
      order: 0,
      rooms: [
        { key: 'room-c', label: 'quiet   room', type: 'text', order: 1 },
        { key: 'room-a', label: 'welcome', type: 'text', order: 1 },
      ],
    },
    {
      key: 'area-a',
      label: 'Arrivals',
      order: 0,
      rooms: [{ key: 'room-b', label: 'broadcasts', type: 'text', order: 0 }],
    },
  ];
  return snapshot;
}

describe('map search', () => {
  it('uses NFKC and JavaScript lowercase without trimming', () => {
    const snapshot = createSearchSnapshot();
    expect(normalizeMapSearchText('ＷＥＬＣＯＭＥ')).toBe('welcome');
    expect(searchMapRooms(snapshot, 'ＷＥＬＣＯＭＥ').map(({ room }) => room.label)).toEqual([
      'welcome',
    ]);
    expect(searchMapRooms(snapshot, '   ').map(({ room }) => room.label)).toEqual(['quiet   room']);
    expect(searchMapRooms(snapshot, '')).toEqual([]);
  });

  it('matches room, area, and type and sorts ties by key without mutating input', () => {
    const snapshot = createSearchSnapshot();
    const before = structuredClone(snapshot);
    expect(searchMapRooms(snapshot, 'arrivals').map(({ room }) => room.label)).toEqual([
      'broadcasts',
    ]);
    expect(searchMapRooms(snapshot, 'voice').map(({ room }) => room.label)).toEqual([
      'voice lounge',
    ]);
    expect(searchMapRooms(snapshot, 'text').map(({ room }) => room.label)).toEqual([
      'broadcasts',
      'welcome',
      'quiet   room',
    ]);
    expect(snapshot).toEqual(before);
  });
});
