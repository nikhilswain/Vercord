import type { AtlasGeometry } from '../../domain/layout/geometry';
import type { MapSnapshot } from '../../domain/map/snapshot';
import { AtlasMap } from './components/AtlasMap';
import { MapViewport } from './components/MapViewport';
import type { MapSource } from './map-view-state';
import { useMapViewport } from './use-map-viewport';

export interface ReadyMapWorkspaceProps {
  snapshot: MapSnapshot;
  geometry: AtlasGeometry;
  source: MapSource;
  stale: boolean;
}

export function ReadyMapWorkspace({ snapshot, geometry }: ReadyMapWorkspaceProps) {
  const viewport = useMapViewport(geometry);
  return (
    <MapViewport snapshot={snapshot} geometry={geometry} controller={viewport}>
      <AtlasMap
        snapshot={snapshot}
        geometry={geometry}
        selectedRoomKey={null}
        matchingRoomKeys={null}
      />
    </MapViewport>
  );
}
