import type { ReactNode } from 'react';

import type { MapViewportController } from '../use-map-viewport';
import { MapControlButton } from './MapControlButton';

export interface MapToolbarProps {
  search: ReactNode;
  viewport: MapViewportController | null;
}

function ControlIcon({ kind }: { kind: 'plus' | 'minus' | 'fit' | 'reset' }) {
  const path = {
    plus: 'M10 4v12M4 10h12',
    minus: 'M4 10h12',
    fit: 'M8 4H4v4m8-4h4v4M8 16H4v-4m8 4h4v-4',
    reset: 'M5 6a7 7 0 1 1-1 7m1-7V3m0 3h3',
  }[kind];
  return (
    <svg className="map-control-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export function MapToolbar({ search, viewport }: MapToolbarProps) {
  return (
    <div className="map-toolbar" aria-label="Atlas tools">
      <div className="map-toolbar-group map-toolbar-search" role="group" aria-label="Search rooms">
        {search}
      </div>
      <div className="map-toolbar-group" role="group" aria-label="Map view">
        <MapControlButton
          label="Zoom in"
          icon={<ControlIcon kind="plus" />}
          disabled={!viewport}
          onClick={viewport?.zoomIn}
        />
        <MapControlButton
          label="Zoom out"
          icon={<ControlIcon kind="minus" />}
          disabled={!viewport}
          onClick={viewport?.zoomOut}
        />
        <MapControlButton
          label="Fit map"
          icon={<ControlIcon kind="fit" />}
          disabled={!viewport}
          onClick={viewport?.fit}
        />
        <MapControlButton
          label="Reset view"
          icon={<ControlIcon kind="reset" />}
          disabled={!viewport}
          onClick={viewport?.reset}
        />
        <output className="map-zoom-status" role="status" aria-label="Map zoom" aria-live="polite">
          {viewport?.zoomPercent ?? '100%'}
        </output>
      </div>
    </div>
  );
}
