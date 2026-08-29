import { useId, type ReactNode } from 'react';

import type { AtlasGeometry } from '../../../domain/layout/geometry';
import type { MapSnapshot } from '../../../domain/map/snapshot';
import type { MapViewportController } from '../use-map-viewport';

export interface MapViewportProps {
  snapshot: MapSnapshot;
  geometry: AtlasGeometry;
  children: ReactNode;
  controller: MapViewportController;
}

export function MapViewport({ snapshot, children, controller }: MapViewportProps) {
  const idBase = useId();
  const titleId = idBase + '-title-0';
  const descriptionId = idBase + '-description-0';
  const instructionId = idBase + '-instruction-0';
  return (
    <div
      {...controller.frameHandlers}
      ref={controller.frameRef}
      className={'map-viewport' + (controller.touchNavigationActive ? ' is-touch-navigation' : '')}
      role="region"
      aria-label="Atlas viewport"
      aria-describedby={instructionId}
      tabIndex={0}
    >
      <p id={instructionId} className="sr-only">
        Arrow keys pan the map. Use the Map view controls to zoom, fit, or reset.
      </p>
      <div className="map-viewport-clip">
        <svg
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          width="100%"
          height="100%"
        >
          <title id={titleId}>{snapshot.server.displayName} atlas</title>
          <desc id={descriptionId}>
            A spatial atlas of invented districts and rooms. Search and the room directory provide
            complete keyboard selection.
          </desc>
          <g ref={controller.worldRef} className="atlas-world" data-map-world>
            {children}
          </g>
        </svg>
      </div>
      {controller.anyCoarsePointer ? (
        <button
          className="map-touch-navigation"
          type="button"
          data-map-control="touch-navigation"
          onClick={controller.toggleTouchNavigation}
        >
          {controller.touchNavigationActive ? 'Done moving' : 'Move map'}
        </button>
      ) : null}
    </div>
  );
}
