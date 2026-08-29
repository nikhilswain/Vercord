import { useMemo } from 'react';

import { layoutAtlas } from '../../domain/layout/atlas';
import type { AtlasGeometry } from '../../domain/layout/geometry';
import { AtlasLayoutError } from '../../domain/layout/invariants';
import type { MapSnapshot } from '../../domain/map/snapshot';
import { MapStatus } from './components/MapStatus';
import type { MapViewState } from './map-view-state';
import { ReadyMapWorkspace } from './ReadyMapWorkspace';

export interface MapPageViewProps {
  state: MapViewState;
  createGeometry?: (snapshot: MapSnapshot) => AtlasGeometry;
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

  if (!result.ok) return <MapStatus state={{ status: 'invalid' }} />;
  return <ReadyMapWorkspace {...state} geometry={result.geometry} />;
}

export function MapPageView({ state, createGeometry = layoutAtlas }: MapPageViewProps) {
  if (state.status !== 'ready') return <MapStatus state={state} />;
  return <ReadyMapRoute state={state} createGeometry={createGeometry} />;
}
