import { orderedMapAreas, orderedMapRooms } from '../../domain/map/order';
import type { MapArea, MapRoom, MapSnapshot } from '../../domain/map/snapshot';

export interface MapRoomMatch {
  area: MapArea;
  room: MapRoom;
}

export function normalizeMapSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

export function searchMapRooms(snapshot: MapSnapshot, query: string): MapRoomMatch[] {
  const normalizedQuery = normalizeMapSearchText(query);
  if (normalizedQuery.length === 0) return [];
  const matches: MapRoomMatch[] = [];
  for (const area of orderedMapAreas(snapshot)) {
    for (const room of orderedMapRooms(area)) {
      const values = [room.label, area.label, room.type].map(normalizeMapSearchText);
      if (values.some((value) => value.includes(normalizedQuery))) matches.push({ area, room });
    }
  }
  return matches;
}
