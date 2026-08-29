import type { AtlasGeometry } from '../../domain/layout/geometry';
import type { MapSnapshot } from '../../domain/map/snapshot';
import { AtlasMap } from './components/AtlasMap';
import { MapToolbar } from './components/MapToolbar';
import { MapViewport } from './components/MapViewport';
import { SourceStatus } from './components/MapStatus';
import type { MapSource } from './map-view-state';
import { useMapViewport } from './use-map-viewport';

export interface ReadyMapWorkspaceProps {
  snapshot: MapSnapshot;
  geometry: AtlasGeometry;
  source: MapSource;
  stale: boolean;
}

export function ReadyMapWorkspace({ snapshot, geometry, source, stale }: ReadyMapWorkspaceProps) {
  const viewport = useMapViewport(geometry);
  return (
    <>
      <MapToolbar
        search={<input className="map-search-input" type="search" aria-label="Search rooms" disabled />}
        viewport={viewport}
      />
      <SourceStatus source={source} stale={stale} />
      <MapViewport snapshot={snapshot} geometry={geometry} controller={viewport}>
        <AtlasMap
          snapshot={snapshot}
          geometry={geometry}
          selectedRoomKey={null}
          matchingRoomKeys={null}
        />
      </MapViewport>
    </>
  );
}
