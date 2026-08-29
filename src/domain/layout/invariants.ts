import { orderedMapAreas, orderedMapRooms } from '../map/order';
import type { MapSnapshot } from '../map/snapshot';
import type { AtlasGeometry, Point, Rect } from './geometry';

export class AtlasLayoutError extends Error {
  readonly code = 'ATLAS_LAYOUT_INVALID' as const;

  constructor() {
    super('ATLAS_LAYOUT_INVALID');
    this.name = 'AtlasLayoutError';
  }
}

function reject(): never {
  throw new AtlasLayoutError();
}

function finite(value: number): void {
  if (!Number.isFinite(value) || value < 0) reject();
}

function checkPoint(point: Point, geometry: AtlasGeometry): void {
  finite(point.x);
  finite(point.y);
  if (point.x > geometry.width || point.y > geometry.height) reject();
}

function checkRect(rect: Rect, geometry: AtlasGeometry): void {
  finite(rect.x);
  finite(rect.y);
  finite(rect.width);
  finite(rect.height);
  if (rect.x + rect.width > geometry.width || rect.y + rect.height > geometry.height) reject();
}

function overlaps(left: Rect, right: Rect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function pairwiseNonOverlapping(rectangles: readonly Rect[]): void {
  rectangles.forEach((left, leftIndex) => {
    rectangles.slice(leftIndex + 1).forEach((right) => {
      if (overlaps(left, right)) reject();
    });
  });
}

export function assertAtlasGeometry(snapshot: MapSnapshot, geometry: AtlasGeometry): void {
  if (geometry.layoutVersion !== 1) reject();
  finite(geometry.width);
  finite(geometry.height);
  if (geometry.width < 720 || geometry.height < 480) reject();

  const sourceAreas = orderedMapAreas(snapshot);
  if (sourceAreas.length !== geometry.areas.length) reject();
  if (geometry.routes.length !== Math.max(0, sourceAreas.length - 1)) reject();
  pairwiseNonOverlapping(geometry.areas);
  const areaKeys = new Set<string>();
  const roomKeys = new Set<string>();

  geometry.areas.forEach((area, areaIndex) => {
    checkRect(area, geometry);
    if (areaKeys.has(area.key) || area.key !== sourceAreas[areaIndex]?.key) reject();
    areaKeys.add(area.key);
    const sourceRooms = orderedMapRooms(sourceAreas[areaIndex]!);
    if (sourceRooms.length !== area.rooms.length) reject();
    pairwiseNonOverlapping(area.rooms);
    area.rooms.forEach((room, roomIndex) => {
      checkRect(room, geometry);
      if (
        roomKeys.has(room.key) ||
        room.key !== sourceRooms[roomIndex]?.key ||
        room.areaKey !== area.key ||
        room.x < area.x + 24 ||
        room.y < area.y + 72 ||
        room.x + room.width > area.x + area.width - 24 ||
        room.y + room.height > area.y + area.height - 24
      ) {
        reject();
      }
      roomKeys.add(room.key);
    });
  });

  geometry.routes.forEach((route, index) => {
    if (route.key !== 'route-' + (index + 1)) reject();
    checkPoint(route.start, geometry);
    checkPoint(route.controlA, geometry);
    checkPoint(route.controlB, geometry);
    checkPoint(route.end, geometry);
  });
}
