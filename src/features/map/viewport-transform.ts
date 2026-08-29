import type { Rect } from '../../domain/layout/geometry';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

export const VIEWPORT_LIMITS = {
  minimumScale: 0.01,
  maximumScale: 3,
  zoomFactor: 1.2,
  fitInset: 24,
  recoverableMapPixels: 64,
  keyboardPanPixels: 48,
  dragThresholdPixels: 4,
  programmaticDurationMs: 220,
} as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampScale(scale: number): number {
  return clamp(scale, VIEWPORT_LIMITS.minimumScale, VIEWPORT_LIMITS.maximumScale);
}

function clampAxis(
  translation: number,
  worldStart: number,
  worldLength: number,
  viewportLength: number,
  scale: number,
): number {
  const scaledLength = worldLength * scale;
  if (scaledLength <= viewportLength) {
    return (viewportLength - scaledLength) / 2 - worldStart * scale;
  }
  return clamp(
    translation,
    VIEWPORT_LIMITS.recoverableMapPixels - (worldStart + worldLength) * scale,
    viewportLength - VIEWPORT_LIMITS.recoverableMapPixels - worldStart * scale,
  );
}

export function clampTransform(
  transform: ViewTransform,
  world: Rect,
  viewport: ViewportSize,
): ViewTransform {
  const scale = clampScale(transform.scale);
  return {
    x: clampAxis(transform.x, world.x, world.width, viewport.width, scale),
    y: clampAxis(transform.y, world.y, world.height, viewport.height, scale),
    scale,
  };
}

export function fitTransform(world: Rect, viewport: ViewportSize): ViewTransform {
  const usableWidth = Math.max(1, viewport.width - VIEWPORT_LIMITS.fitInset * 2);
  const usableHeight = Math.max(1, viewport.height - VIEWPORT_LIMITS.fitInset * 2);
  const scale = clampScale(Math.min(usableWidth / world.width, usableHeight / world.height));
  return clampTransform({ x: 0, y: 0, scale }, world, viewport);
}

export function resetTransform(world: Rect, viewport: ViewportSize): ViewTransform {
  return clampTransform(
    {
      x: (viewport.width - world.width) / 2 - world.x,
      y: (viewport.height - world.height) / 2 - world.y,
      scale: 1,
    },
    world,
    viewport,
  );
}

export function zoomAtPoint(
  transform: ViewTransform,
  point: { x: number; y: number },
  factor: number,
  world: Rect,
  viewport: ViewportSize,
): ViewTransform {
  const nextScale = clampScale(transform.scale * factor);
  const ratio = nextScale / transform.scale;
  return clampTransform(
    {
      x: point.x - (point.x - transform.x) * ratio,
      y: point.y - (point.y - transform.y) * ratio,
      scale: nextScale,
    },
    world,
    viewport,
  );
}

export function panBy(
  transform: ViewTransform,
  deltaX: number,
  deltaY: number,
  world: Rect,
  viewport: ViewportSize,
): ViewTransform {
  return clampTransform(
    { x: transform.x + deltaX, y: transform.y + deltaY, scale: transform.scale },
    world,
    viewport,
  );
}

export function formatZoomPercent(transform: ViewTransform): string {
  return Math.round(transform.scale * 100) + '%';
}
