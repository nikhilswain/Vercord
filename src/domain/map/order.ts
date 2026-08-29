import type { MapArea, MapRoom, MapSnapshot } from './snapshot';

function byOrderThenKey(
  left: { order: number; key: string },
  right: { order: number; key: string },
): number {
  if (left.order !== right.order) return left.order - right.order;
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}

export function orderedMapAreas(snapshot: MapSnapshot): MapArea[] {
  return [...snapshot.areas].sort(byOrderThenKey);
}

export function orderedMapRooms(area: MapArea): MapRoom[] {
  return [...area.rooms].sort(byOrderThenKey);
}
