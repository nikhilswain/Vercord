import { describe, expect, it } from 'vitest';

import { orderedMapAreas, orderedMapRooms } from '../../../../src/domain/map/order';
import { createLayoutSnapshotFixture } from '../../../fixtures/map/map-snapshots';

describe('map authored ordering', () => {
  it('sorts copies by order and ASCII key without mutating input', () => {
    const snapshot = createLayoutSnapshotFixture([2, 1]);
    snapshot.areas[0]!.order = 2;
    snapshot.areas[1]!.order = 2;
    snapshot.areas[0]!.key = 'area-z';
    snapshot.areas[1]!.key = 'area-a';
    snapshot.areas[0]!.rooms[0]!.order = 1;
    snapshot.areas[0]!.rooms[1]!.order = 1;
    snapshot.areas[0]!.rooms[0]!.key = 'room-z';
    snapshot.areas[0]!.rooms[1]!.key = 'room-a';
    const before = structuredClone(snapshot);

    expect(orderedMapAreas(snapshot).map(({ key }) => key)).toEqual(['area-a', 'area-z']);
    expect(orderedMapRooms(snapshot.areas[0]!).map(({ key }) => key)).toEqual(['room-a', 'room-z']);
    expect(snapshot).toEqual(before);
  });
});
