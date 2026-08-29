import type { ReactNode } from 'react';

import type { AtlasGeometry } from '../../../domain/layout/geometry';
import type { MapSnapshot } from '../../../domain/map/snapshot';

export interface MapViewportProps {
  snapshot: MapSnapshot;
  geometry: AtlasGeometry;
  children: ReactNode;
}

export function MapViewport({ snapshot, geometry, children }: MapViewportProps) {
  const titleId = 'atlas-title';
  const descriptionId = 'atlas-description';
  return (
    <div className="map-viewport">
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        width={geometry.width}
        height={geometry.height}
        viewBox={'0 0 ' + geometry.width + ' ' + geometry.height}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={titleId}>{snapshot.server.displayName} atlas</title>
        <desc id={descriptionId}>A static spatial map of invented districts and rooms.</desc>
        <g data-map-world>{children}</g>
      </svg>
    </div>
  );
}
