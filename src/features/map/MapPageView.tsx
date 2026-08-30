import { useMemo } from 'react';

import { layoutAtlas } from '../../domain/layout/atlas';
import type { AtlasGeometry } from '../../domain/layout/geometry';
import { AtlasLayoutError } from '../../domain/layout/invariants';
import type { MapSnapshot } from '../../domain/map/snapshot';
import { MapToolbar } from './components/MapToolbar';
import { MapStatus } from './components/MapStatus';
import { MapWorkspaceShell } from './components/MapWorkspaceShell';
import { RoomDetails } from './components/RoomDetails';
import type { MapViewState } from './map-view-state';
import { ReadyMapWorkspace } from './ReadyMapWorkspace';

export interface MapPageViewProps {
  state: MapViewState;
  createGeometry?: (snapshot: MapSnapshot) => AtlasGeometry;
}

function InactiveMapWorkspace({ state }: { state: Exclude<MapViewState, { status: 'ready' }> }) {
  return (
    <MapWorkspaceShell
      toolbar={
        <MapToolbar
          search={
            <input
              className="map-search-input"
              type="search"
              role="combobox"
              aria-expanded="false"
              aria-label="Search rooms"
              disabled
            />
          }
          viewport={null}
        />
      }
      status={<MapStatus state={state} inFlow />}
      viewport={
        <div
          className="map-viewport map-viewport--status"
          role="region"
          aria-label="Atlas viewport"
          tabIndex={0}
        >
          <div className="map-viewport-clip" aria-hidden="true" />
        </div>
      }
      details={<RoomDetails details={null} onClose={() => undefined} />}
      directory={
        <nav className="map-directory" aria-label="Room directory">
          <h2>Room directory</h2>
        </nav>
      }
    />
  );
}

function ReadyMapRoute({
  state,
  createGeometry,
}: {
  state: Extract<MapViewState, { status: 'ready' }>;
  createGeometry: (snapshot: MapSnapshot) => AtlasGeometry;
}) {
  const result = useMemo(() => {
    try {
      return { ok: true as const, geometry: createGeometry(state.snapshot) };
    } catch (error) {
      if (error instanceof AtlasLayoutError) return { ok: false as const };
      throw error;
    }
  }, [state.snapshot, createGeometry]);

  if (!result.ok) return <InactiveMapWorkspace state={{ status: 'invalid' }} />;
  return <ReadyMapWorkspace {...state} geometry={result.geometry} />;
}

export function MapPageView({ state, createGeometry = layoutAtlas }: MapPageViewProps) {
  if (state.status !== 'ready') return <InactiveMapWorkspace state={state} />;
  return <ReadyMapRoute state={state} createGeometry={createGeometry} />;
}
