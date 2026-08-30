import { useCallback, useMemo, useRef, useState } from 'react';

import type { AtlasGeometry, RoomGeometry } from '../../domain/layout/geometry';
import { orderedMapAreas, orderedMapRooms } from '../../domain/map/order';
import type { MapRoomType, MapSnapshot } from '../../domain/map/snapshot';
import { searchMapRooms, type MapRoomMatch } from './search-map';
import type { MapViewportController } from './use-map-viewport';

export interface SafeRoomDetails {
  roomLabel: string;
  roomType: MapRoomType;
  areaLabel: string;
  coordinate: { x: number; y: number };
}

export interface RoomExplorerController {
  query: string;
  matches: MapRoomMatch[];
  matchingRoomKeys: ReadonlySet<string> | null;
  activeResultIndex: number;
  selectedRoomKey: string | null;
  selectedDetails: SafeRoomDetails | null;
  setQuery(value: string): void;
  setActiveResultIndex(index: number): void;
  selectRoom(roomKey: string, origin: HTMLElement | null): void;
  clearQuery(): void;
  clearSelection(): void;
}

interface IndexedRoom {
  areaLabel: string;
  roomLabel: string;
  roomType: MapRoomType;
  geometry: RoomGeometry;
}

export function useRoomExplorer(
  snapshot: MapSnapshot,
  geometry: AtlasGeometry,
  viewport: Pick<MapViewportController, 'frameRef' | 'ensureRoomVisible'>,
): RoomExplorerController {
  const [query, setQueryState] = useState('');
  const [activeResultIndex, setActiveResultIndexState] = useState(0);
  const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null);
  const originRef = useRef<HTMLElement | null>(null);

  const roomIndex = useMemo(() => {
    const geometryByKey = new Map<string, RoomGeometry>();
    for (const area of geometry.areas) {
      for (const room of area.rooms) geometryByKey.set(room.key, room);
    }
    const index = new Map<string, IndexedRoom>();
    for (const area of orderedMapAreas(snapshot)) {
      for (const room of orderedMapRooms(area)) {
        const roomGeometry = geometryByKey.get(room.key);
        if (roomGeometry) {
          index.set(room.key, {
            areaLabel: area.label,
            roomLabel: room.label,
            roomType: room.type,
            geometry: roomGeometry,
          });
        }
      }
    }
    return index;
  }, [geometry, snapshot]);

  const matches = useMemo(() => searchMapRooms(snapshot, query), [query, snapshot]);
  const matchingRoomKeys = useMemo(
    () => (query.length === 0 ? null : new Set(matches.map(({ room }) => room.key))),
    [matches, query.length],
  );
  const normalizedActiveIndex =
    matches.length === 0
      ? 0
      : ((activeResultIndex % matches.length) + matches.length) % matches.length;

  const selectedDetails = useMemo(() => {
    if (!selectedRoomKey) return null;
    const selected = roomIndex.get(selectedRoomKey);
    if (!selected) return null;
    return {
      roomLabel: selected.roomLabel,
      roomType: selected.roomType,
      areaLabel: selected.areaLabel,
      coordinate: {
        x: Math.round(selected.geometry.x + selected.geometry.width / 2),
        y: Math.round(selected.geometry.y + selected.geometry.height / 2),
      },
    };
  }, [roomIndex, selectedRoomKey]);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setActiveResultIndexState(0);
  }, []);
  const setActiveResultIndex = useCallback(
    (index: number) => {
      setActiveResultIndexState(
        matches.length === 0 ? 0 : ((index % matches.length) + matches.length) % matches.length,
      );
    },
    [matches.length],
  );
  const selectRoom = useCallback(
    (roomKey: string, origin: HTMLElement | null) => {
      const selected = roomIndex.get(roomKey);
      if (!selected) return;
      originRef.current = origin;
      setSelectedRoomKey(roomKey);
      viewport.ensureRoomVisible(selected.geometry);
    },
    [roomIndex, viewport],
  );
  const clearQuery = useCallback(() => {
    setQueryState('');
    setActiveResultIndexState(0);
  }, []);
  const clearSelection = useCallback(() => {
    const origin = originRef.current;
    originRef.current = null;
    setSelectedRoomKey(null);
    if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    else viewport.frameRef.current?.focus();
  }, [viewport.frameRef]);

  return {
    query,
    matches,
    matchingRoomKeys,
    activeResultIndex: normalizedActiveIndex,
    selectedRoomKey,
    selectedDetails,
    setQuery,
    setActiveResultIndex,
    selectRoom,
    clearQuery,
    clearSelection,
  };
}
