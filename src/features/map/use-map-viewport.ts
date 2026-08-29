import {
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { AtlasGeometry } from '../../domain/layout/geometry';
import {
  fitTransform,
  formatZoomPercent,
  panBy,
  resetTransform,
  VIEWPORT_LIMITS,
  type ViewportSize,
  type ViewTransform,
  zoomAtPoint,
} from './viewport-transform';

export interface MapViewportController {
  frameRef: React.RefObject<HTMLDivElement | null>;
  worldRef: React.RefObject<SVGGElement | null>;
  zoomPercent: string;
  fit(): void;
  reset(): void;
  zoomIn(): void;
  zoomOut(): void;
  frameHandlers: Pick<
    HTMLAttributes<HTMLDivElement>,
    | 'onKeyDown'
    | 'onClickCapture'
    | 'onPointerDown'
    | 'onPointerMove'
    | 'onPointerUp'
    | 'onPointerCancel'
    | 'onLostPointerCapture'
  >;
}

interface ActivePointer {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  captured: boolean;
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
  const pointerRef = useRef<ActivePointer | null>(null);
  const suppressNextClickRef = useRef(false);
  const clickGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport.width > 0 && viewport.height > 0) {
      applyTransform(fitTransform(bounds, viewport));
    }
  }, [applyTransform, bounds]);

  const reset = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport.width > 0 && viewport.height > 0) {
      applyTransform(resetTransform(bounds, viewport));
    }
  }, [applyTransform, bounds]);

  const zoomBy = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current;
      if (viewport.width <= 0 || viewport.height <= 0) return;
      applyTransform(
        zoomAtPoint(
          transformRef.current,
          { x: viewport.width / 2, y: viewport.height / 2 },
          factor,
          bounds,
          viewport,
        ),
      );
    },
    [applyTransform, bounds],
  );

  const zoomIn = useCallback(() => zoomBy(VIEWPORT_LIMITS.zoomFactor), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / VIEWPORT_LIMITS.zoomFactor), [zoomBy]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.currentTarget !== event.target) return;
      const delta = (() => {
        switch (event.key) {
          case 'ArrowLeft':
            return { x: VIEWPORT_LIMITS.keyboardPanPixels, y: 0 };
          case 'ArrowRight':
            return { x: -VIEWPORT_LIMITS.keyboardPanPixels, y: 0 };
          case 'ArrowUp':
            return { x: 0, y: VIEWPORT_LIMITS.keyboardPanPixels };
          case 'ArrowDown':
            return { x: 0, y: -VIEWPORT_LIMITS.keyboardPanPixels };
          default:
            return null;
        }
      })();
      if (!delta) return;
      event.preventDefault();
      applyTransform(panBy(transformRef.current, delta.x, delta.y, bounds, viewportRef.current));
    },
    [applyTransform, bounds],
  );

  const armClickGuard = useCallback(() => {
    suppressNextClickRef.current = true;
    if (clickGuardTimerRef.current !== null) clearTimeout(clickGuardTimerRef.current);
    clickGuardTimerRef.current = setTimeout(() => {
      suppressNextClickRef.current = false;
      clickGuardTimerRef.current = null;
    }, 0);
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerRef.current || event.pointerType === 'touch') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      captured: false,
    };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.id !== event.pointerId) return;
      if (
        !pointer.captured &&
        Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) <
          VIEWPORT_LIMITS.dragThresholdPixels
      ) {
        return;
      }
      if (!pointer.captured) {
        event.currentTarget.setPointerCapture(pointer.id);
        pointer.captured = true;
      }
      event.preventDefault();
      const deltaX = event.clientX - pointer.lastX;
      const deltaY = event.clientY - pointer.lastY;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      applyTransform(
        panBy(transformRef.current, deltaX, deltaY, bounds, viewportRef.current),
        false,
      );
    },
    [applyTransform, bounds],
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, guardClick: boolean) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.id !== event.pointerId) return;
      pointerRef.current = null;
      if (!pointer.captured) return;
      if (event.currentTarget.hasPointerCapture(pointer.id)) {
        event.currentTarget.releasePointerCapture(pointer.id);
      }
      if (guardClick) armClickGuard();
    },
    [armClickGuard],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => finishPointer(event, true),
    [finishPointer],
  );
  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => finishPointer(event, false),
    [finishPointer],
  );
  const onLostPointerCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => finishPointer(event, false),
    [finishPointer],
  );
  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressNextClickRef.current) return;
    suppressNextClickRef.current = false;
    if (clickGuardTimerRef.current !== null) clearTimeout(clickGuardTimerRef.current);
    clickGuardTimerRef.current = null;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  useEffect(
    () => () => {
      if (clickGuardTimerRef.current !== null) clearTimeout(clickGuardTimerRef.current);
    },
    [],
  );

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

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      const factor =
        event.deltaY < 0 ? VIEWPORT_LIMITS.zoomFactor : 1 / VIEWPORT_LIMITS.zoomFactor;
      applyTransform(
        zoomAtPoint(
          transformRef.current,
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          factor,
          bounds,
          viewportRef.current,
        ),
      );
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [applyTransform, bounds]);

  return {
    frameRef,
    worldRef,
    zoomPercent,
    fit,
    reset,
    zoomIn,
    zoomOut,
    frameHandlers: {
      onKeyDown,
      onClickCapture,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
    },
  };
}
