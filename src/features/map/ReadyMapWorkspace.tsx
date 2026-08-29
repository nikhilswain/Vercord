import type { AtlasGeometry } from '../../domain/layout/geometry';
import type { MapSnapshot } from '../../domain/map/snapshot';
import { AtlasMap } from './components/AtlasMap';
import { MapViewport } from './components/MapViewport';
import type { MapSource } from './map-view-state';

export interface ReadyMapWorkspaceProps {
  snapshot: MapSnapshot;
  geometry: AtlasGeometry;
  source: MapSource;
  stale: boolean;
}

export function ReadyMapWorkspace({ snapshot, geometry }: ReadyMapWorkspaceProps) {
  return (
    <MapViewport snapshot={snapshot} geometry={geometry}>
      <AtlasMap
        snapshot={snapshot}
        geometry={geometry}
        selectedRoomKey={null}
        matchingRoomKeys={null}
      />
    </MapViewport>
  );
}
