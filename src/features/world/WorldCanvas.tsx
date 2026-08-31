import { useEffect, useMemo, useRef, useState } from 'react';

import type { MapSnapshot } from '../../domain/map/snapshot';
import { createUrbanWorld } from './engine/urban-world';
import type { WorldPortal, WorldUiState } from './engine/types';
import { WorldEngine } from './engine/world-engine';

export interface WorldCanvasProps {
  snapshot: MapSnapshot;
}

const INITIAL_UI: WorldUiState = { area: null, nearbyPortal: null, zoom: 100 };

function ControlIcon({ children }: { children: string }) {
  return <span aria-hidden="true">{children}</span>;
}

export function WorldCanvas({ snapshot }: WorldCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const world = useMemo(() => createUrbanWorld(snapshot), [snapshot]);
  const [ready, setReady] = useState(false);
  const [assetError, setAssetError] = useState(false);
  const [ui, setUi] = useState<WorldUiState>(INITIAL_UI);
  const [selectedPortal, setSelectedPortal] = useState<WorldPortal | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const engine = new WorldEngine(canvas, world, {
      onReady: () => setReady(true),
      onAssetError: () => setAssetError(true),
      onUiChange: setUi,
      onOpenRoom: setSelectedPortal,
    });
    engineRef.current = engine;

    const resize = () => engine.resize(host.clientWidth, host.clientHeight);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    engine.start();

    return () => {
      resizeObserver.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, [world]);

  const toggleFullscreen = async () => {
    const host = hostRef.current;
    if (!host) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await host.requestFullscreen();
  };

  return (
    <div ref={hostRef} className="world-viewport">
      <canvas
        ref={canvasRef}
        className="world-canvas"
        tabIndex={0}
        aria-label={`Playable map of ${snapshot.server.displayName}. Use W A S D or arrow keys to move, or click a destination.`}
      />

      {!ready && !assetError ? (
        <div className="world-loading" role="status">
          <span className="world-loading-mark" aria-hidden="true" />
          <p>Building the world…</p>
        </div>
      ) : null}

      {assetError ? (
        <div className="world-loading world-loading--error" role="alert">
          <p>The world tiles could not be loaded.</p>
        </div>
      ) : null}

      <div className="world-location" aria-live="polite">
        <span className="world-location-kicker">Now exploring</span>
        <strong>{ui.area?.label ?? 'Central crossing'}</strong>
        <span>{ui.area ? `${ui.area.roomCount} mapped rooms` : world.name}</span>
      </div>

      <div className="world-controls" aria-label="World view controls">
        <button type="button" onClick={() => engineRef.current?.zoomIn()} aria-label="Zoom in">
          <ControlIcon>+</ControlIcon>
        </button>
        <span className="world-zoom" aria-label={`Zoom ${ui.zoom} percent`}>
          {ui.zoom}%
        </span>
        <button type="button" onClick={() => engineRef.current?.zoomOut()} aria-label="Zoom out">
          <ControlIcon>−</ControlIcon>
        </button>
        <button type="button" onClick={() => engineRef.current?.resetView()} aria-label="Center on avatar">
          <ControlIcon>◎</ControlIcon>
        </button>
        <button type="button" onClick={() => void toggleFullscreen()} aria-label="Toggle fullscreen">
          <ControlIcon>⛶</ControlIcon>
        </button>
      </div>

      <div className="world-help">
        <span><kbd>WASD</kbd> move</span>
        <span><kbd>Shift</kbd> sprint</span>
        <span><kbd>Click</kbd> walk</span>
        <span><kbd>Wheel</kbd> zoom</span>
      </div>

      {ui.nearbyPortal ? (
        <button
          type="button"
          className="world-interaction"
          onClick={() => engineRef.current?.interact()}
        >
          <kbd>E</kbd>
          <span>
            Open <strong>#{ui.nearbyPortal.room.label}</strong>
          </span>
        </button>
      ) : null}

      {selectedPortal ? (
        <aside className="world-room-panel" aria-label="Selected room">
          <button
            className="world-room-close"
            type="button"
            onClick={() => setSelectedPortal(null)}
            aria-label="Close room details"
          >
            ×
          </button>
          <span className="world-room-kicker">{selectedPortal.areaLabel}</span>
          <h2>#{selectedPortal.room.label}</h2>
          <p>
            This <strong>{selectedPortal.room.type}</strong> room is represented as a place in the
            world. Discord entry will connect here in a later slice.
          </p>
          <button type="button" className="world-room-action" disabled>
            Discord connection pending
          </button>
        </aside>
      ) : null}
    </div>
  );
}
