import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AtlasGeometry } from '../../domain/layout/geometry';
import {
  fitTransform,
  formatZoomPercent,
  type ViewportSize,
  type ViewTransform,
} from './viewport-transform';

export interface MapViewportController {
  frameRef: React.RefObject<HTMLDivElement | null>;
  worldRef: React.RefObject<SVGGElement | null>;
  zoomPercent: string;
}

export function useMapViewport(geometry: AtlasGeometry): MapViewportController {
  const frameRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const bounds = useMemo(
    () => ({ x: 0, y: 0, width: geometry.width, height: geometry.height }),
    [geometry.height, geometry.width],
  );
  const transformRef = useRef<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const viewportRef = useRef<ViewportSize>({ width: 0, height: 0 });
  const zoomFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [zoomPercent, setZoomPercent] = useState('100%');

  const applyTransform = useCallback((next: ViewTransform, publish = true) => {
    transformRef.current = next;
    worldRef.current?.setAttribute(
      'transform',
      `matrix(${next.scale} 0 0 ${next.scale} ${next.x} ${next.y})`,
    );
    if (!publish || zoomFrameRef.current !== null) return;
    zoomFrameRef.current = requestAnimationFrame(() => {
      zoomFrameRef.current = null;
      setZoomPercent(formatZoomPercent(transformRef.current));
    });
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = (size: ViewportSize) => {
      viewportRef.current = size;
      applyTransform(fitTransform(bounds, size));
    };
    const initial = { width: frame.clientWidth, height: frame.clientHeight };
    if (initial.width > 0 && initial.height > 0) fit(initial);
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      const previous = viewportRef.current;
      if (
        Math.abs(next.width - previous.width) < 1 &&
        Math.abs(next.height - previous.height) < 1
      ) {
        return;
      }
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        fit(next);
      });
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
      if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current);
      zoomFrameRef.current = null;
    };
  }, [applyTransform, bounds]);

  return { frameRef, worldRef, zoomPercent };
}
