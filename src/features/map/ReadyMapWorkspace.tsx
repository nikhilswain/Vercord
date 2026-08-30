import type { AtlasGeometry } from '../../domain/layout/geometry';
import type { MapSnapshot } from '../../domain/map/snapshot';
import { AtlasMap } from './components/AtlasMap';
import { MapDirectory } from './components/MapDirectory';
import { MapSearch } from './components/MapSearch';
import { MapToolbar } from './components/MapToolbar';
import { MapViewport } from './components/MapViewport';
import { MapStatus } from './components/MapStatus';
import { MapWorkspaceShell } from './components/MapWorkspaceShell';
import { RoomDetails } from './components/RoomDetails';
import type { MapSource } from './map-view-state';
import { useMapViewport } from './use-map-viewport';
import { useRoomExplorer } from './use-room-explorer';

export interface ReadyMapWorkspaceProps {
  snapshot: MapSnapshot;
  geometry: AtlasGeometry;
  source: MapSource;
  stale: boolean;
}

export function ReadyMapWorkspace({ snapshot, geometry, source, stale }: ReadyMapWorkspaceProps) {
  const viewport = useMapViewport(geometry);
  const explorer = useRoomExplorer(snapshot, geometry, viewport);
  return (
    <MapWorkspaceShell
      toolbar={<MapToolbar search={<MapSearch explorer={explorer} />} viewport={viewport} />}
      status={<MapStatus state={{ status: 'ready', snapshot, source, stale }} compact />}
      viewport={
        <MapViewport snapshot={snapshot} geometry={geometry} controller={viewport}>
          <AtlasMap
            snapshot={snapshot}
            geometry={geometry}
            selectedRoomKey={explorer.selectedRoomKey}
            matchingRoomKeys={explorer.matchingRoomKeys}
            onSelectRoom={(roomKey) => explorer.selectRoom(roomKey, null)}
          />
        </MapViewport>
      }
      details={<RoomDetails details={explorer.selectedDetails} onClose={explorer.clearSelection} />}
      directory={<MapDirectory snapshot={snapshot} explorer={explorer} />}
    />
  );
}
