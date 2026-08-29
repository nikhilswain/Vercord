import { describe, expect, it } from 'vitest';

import { layoutAtlas, shouldWrapShelf } from '../../../../src/domain/layout/atlas';
import { createLayoutSnapshotFixture } from '../../../fixtures/map/map-snapshots';

describe('layoutAtlas', () => {
  // Catches an implementation that starts districts or room grids at the wrong fixed offsets.
  it('returns the exact empty and one-room geometry', () => {
    expect(layoutAtlas(createLayoutSnapshotFixture([]))).toEqual({
      layoutVersion: 1,
      width: 720,
      height: 480,
      areas: [],
      routes: [],
    });
    const geometry = layoutAtlas(createLayoutSnapshotFixture([1]));
    expect(geometry.areas[0]).toMatchObject({
      x: 48,
      y: 48,
      width: 272,
      height: 148,
    });
    expect(geometry.areas[0]!.rooms[0]).toMatchObject({
      x: 72,
      y: 120,
      width: 156,
      height: 52,
    });
  });

  // Catches a grid measurement that uses an incorrect square-root column or row formula.
  it.each([
    [4, 372, 212],
    [5, 540, 212],
    [10, 708, 276],
  ])('measures %i rooms as %i by %i', (rooms, width, height) => {
    expect(layoutAtlas(createLayoutSnapshotFixture([rooms])).areas[0]).toMatchObject({
      width,
      height,
    });
  });

  // Catches an inclusive shelf edge check that wraps a candidate ending exactly at 1,584.
  it('uses a strict shelf boundary at candidate edge 1,584', () => {
    expect(shouldWrapShelf(1_000, 584, true)).toBe(false);
    expect(shouldWrapShelf(1_000, 585, true)).toBe(true);
    expect(shouldWrapShelf(1_000, 585, false)).toBe(false);
  });

  // Catches in-place source sorting and label-size-dependent placement.
  it('uses stable key order without mutating input or measuring labels', () => {
    const source = createLayoutSnapshotFixture([2]);
    source.areas[0]!.rooms.reverse();
    source.areas[0]!.rooms.forEach((room) => {
      room.order = 0;
    });
    const beforeFirstLayout = structuredClone(source);
    const first = layoutAtlas(source);
    expect(source).toEqual(beforeFirstLayout);
    source.areas[0]!.label = 'A'.repeat(100);
    source.areas[0]!.rooms[0]!.label = 'B'.repeat(100);
    const beforeSecondLayout = structuredClone(source);
    const second = layoutAtlas(source);
    expect(source).toEqual(beforeSecondLayout);
    expect(first.areas[0]!.rooms.map(({ key }) => key)).toEqual(['room-0-0', 'room-0-1']);
    expect(second.areas.map(({ width, height, rooms }) => ({ width, height, rooms }))).toEqual(
      first.areas.map(({ width, height, rooms }) => ({ width, height, rooms })),
    );
  });

  // Catches route sequencing or control points that do not track the two adjacent district edges.
  it('connects adjacent areas with stable routes and independently cycling variants', () => {
    const geometry = layoutAtlas(createLayoutSnapshotFixture([1, 1, 1, 1]));
    expect(geometry.areas.map(({ variant }) => variant)).toEqual([
      'violet',
      'cyan',
      'amber',
      'violet',
    ]);
    expect(geometry.routes.map(({ key, variant }) => ({ key, variant }))).toEqual([
      { key: 'route-1', variant: 'violet' },
      { key: 'route-2', variant: 'cyan' },
      { key: 'route-3', variant: 'amber' },
    ]);
    const first = geometry.routes[0]!;
    expect(first.start.x).toBe(geometry.areas[0]!.x + geometry.areas[0]!.width);
    expect(first.end.x).toBe(geometry.areas[1]!.x);
    expect(first.controlA.x).toBe((first.start.x + first.end.x) / 2);
    expect(first.controlB.x).toBe((first.start.x + first.end.x) / 2);
    expect(first.controlA.y).toBe(first.start.y);
    expect(first.controlB.y).toBe(first.end.y);
  });

  // Catches shelf wrapping that uses the prior district height instead of the shelf's tallest height.
  it('wraps valid districts below the tallest shelf with reset x 48', () => {
    const geometry = layoutAtlas(createLayoutSnapshotFixture([10, 1, 10]));
    expect(geometry.areas[2]!.x).toBe(48);
    expect(geometry.areas[2]!.y).toBe(
      geometry.areas[0]!.y + Math.max(geometry.areas[0]!.height, geometry.areas[1]!.height) + 32,
    );
    expect(geometry.width).toBeGreaterThanOrEqual(720);
    expect(geometry.height).toBe(
      Math.max(480, geometry.areas[2]!.y + geometry.areas[2]!.height + 48),
    );
  });
});
