import { describe, expect, it } from 'vitest';

import { layoutAtlas } from '../../../../src/domain/layout/atlas';
import { assertAtlasGeometry } from '../../../../src/domain/layout/invariants';
import {
  createEmptyMapSnapshotFixture,
  createLargeMapSnapshotFixture,
  createLayoutSnapshotFixture,
  createLongLabelMapSnapshotFixture,
  createUncategorizedMapSnapshotFixture,
} from '../../../fixtures/map/map-snapshots';

describe('atlas geometry invariants', () => {
  // Catches geometry that fails finite, containment, overlap, or exact source coverage requirements.
  it.each([
    createEmptyMapSnapshotFixture(),
    createUncategorizedMapSnapshotFixture(),
    createLongLabelMapSnapshotFixture(),
    createLayoutSnapshotFixture([1]),
    createLayoutSnapshotFixture([10, 4, 0, 9]),
    createLargeMapSnapshotFixture(),
  ])('accepts every focused fixture', (snapshot) => {
    expect(() => assertAtlasGeometry(snapshot, layoutAtlas(snapshot))).not.toThrow();
  });

  // Catches source-order-dependent geometry or a layout function that mutates its snapshot.
  it('is deterministic and does not mutate equivalent shuffled inputs', () => {
    const snapshot = createLayoutSnapshotFixture([3, 2]);
    const before = structuredClone(snapshot);
    const first = layoutAtlas(snapshot);
    const shuffled = structuredClone(snapshot);
    shuffled.areas.reverse();
    shuffled.areas.forEach((area) => area.rooms.reverse());
    expect(layoutAtlas(shuffled)).toEqual(first);
    expect(snapshot).toEqual(before);
  });

  // Catches an invariant checker that permits malformed dimensions, containment, coverage, or route keys.
  it.each(['width', 'area', 'room', 'route'] as const)('rejects corrupted %s geometry', (kind) => {
    const snapshot = createLayoutSnapshotFixture([2, 1]);
    const geometry = structuredClone(layoutAtlas(snapshot));
    if (kind === 'width') geometry.width = Number.NaN;
    if (kind === 'area') geometry.areas[0]!.x = -1;
    if (kind === 'room') geometry.areas[0]!.rooms[0]!.x = geometry.width + 1;
    if (kind === 'route') geometry.routes[0]!.key = 'wrong';
    expect(() => assertAtlasGeometry(snapshot, geometry)).toThrow('ATLAS_LAYOUT_INVALID');
  });
});
