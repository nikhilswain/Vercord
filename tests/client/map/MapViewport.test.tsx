import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { layoutAtlas } from '../../../src/domain/layout/atlas';
import { MapViewport } from '../../../src/features/map/components/MapViewport';
import {
  type MapViewportController,
  useMapViewport,
} from '../../../src/features/map/use-map-viewport';
import {
  fitTransform,
  formatZoomPercent,
  type ViewTransform,
} from '../../../src/features/map/viewport-transform';
import { flushAnimationFrames, setElementRect, triggerResize } from '../helpers/browser-api-mocks';
import {
  createLayoutSnapshotFixture,
  createMapSnapshotFixture,
} from '../../fixtures/map/map-snapshots';

const snapshot = createMapSnapshotFixture();
const geometry = layoutAtlas(snapshot);
const largeSnapshot = createLayoutSnapshotFixture([10, 10, 10, 10]);
const largeGeometry = layoutAtlas(largeSnapshot);
let latestController: MapViewportController | null = null;

function getController(): MapViewportController {
  if (!latestController) throw new Error('Viewport controller was not published.');
  return latestController;
}

function ViewportHarness({
  useLargeFixture = false,
  onRoomClick = () => undefined,
}: {
  useLargeFixture?: boolean;
  onRoomClick?: () => void;
}) {
  const selectedSnapshot = useLargeFixture ? largeSnapshot : snapshot;
  const selectedGeometry = useLargeFixture ? largeGeometry : geometry;
  const controller = useMapViewport(selectedGeometry);
  latestController = controller;
  return (
    <MapViewport snapshot={selectedSnapshot} geometry={selectedGeometry} controller={controller}>
      <rect data-testid="pointer-room" x="48" y="48" width="96" height="56" onClick={onRoomClick} />
    </MapViewport>
  );
}

function readTransform(): ViewTransform {
  const value = document.querySelector('[data-map-world]')?.getAttribute('transform') ?? '';
  const match = /^matrix\(([-+\d.e]+) 0 0 ([-+\d.e]+) ([-+\d.e]+) ([-+\d.e]+)\)$/u.exec(value);
  if (!match || match[1] !== match[2]) throw new Error('Unexpected map transform: ' + value);
  return { scale: Number(match[1]), x: Number(match[3]), y: Number(match[4]) };
}

function readMatrixText(): string {
  return document.querySelector('[data-map-world]')?.getAttribute('transform') ?? '';
}

function sizeViewport(width = 800, height = 600): HTMLDivElement {
  const frame = screen.getByRole('region', { name: 'Atlas viewport' });
  setElementRect(frame, { x: 10, y: 20, width, height });
  act(() => {
    triggerResize(frame, width, height);
    flushAnimationFrames(0);
    flushAnimationFrames(0);
  });
  return frame as HTMLDivElement;
}

function renderViewport(
  options: {
    useLargeFixture?: boolean;
    onRoomClick?: () => void;
  } = {},
): HTMLDivElement {
  latestController = null;
  render(<ViewportHarness {...options} />);
  return sizeViewport();
}

afterEach(() => {
  vi.useRealTimers();
  latestController = null;
});

describe('MapViewport camera', () => {
  it('uses one transformed world without an SVG viewBox and refits meaningful resize', () => {
    const frame = renderViewport();
    const image = screen.getByRole('img', { name: 'Northstar Commons atlas' });
    expect(frame).toHaveAttribute('tabindex', '0');
    expect(image).not.toHaveAttribute('viewBox');
    expect(image).not.toHaveAttribute('preserveAspectRatio');
    expect(readTransform()).toEqual(
      fitTransform(
        { x: 0, y: 0, width: geometry.width, height: geometry.height },
        { width: 800, height: 600 },
      ),
    );
    expect(readMatrixText()).toMatch(/^matrix\([-+\d.e]+ 0 0 [-+\d.e]+ [-+\d.e]+ [-+\d.e]+\)$/u);
    expect(getController().zoomPercent).toMatch(/%$/u);

    const before = readMatrixText();
    act(() => {
      triggerResize(frame, 800.5, 600.5);
      flushAnimationFrames(1);
    });
    expect(readMatrixText()).toBe(before);
    act(() => {
      triggerResize(frame, 640, 480);
      flushAnimationFrames(2);
      flushAnimationFrames(2);
    });
    expect(readTransform()).toEqual(
      fitTransform(
        { x: 0, y: 0, width: geometry.width, height: geometry.height },
        { width: 640, height: 480 },
      ),
    );
  });

  it('links visible instructions and contains no opaque snapshot key in relationship IDs', () => {
    const frame = renderViewport();
    const descriptionId = frame.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)).toHaveTextContent(/Arrow keys pan/u);
    expect(document.body.innerHTML).not.toContain('room-welcome');
    expect(document.body.innerHTML).not.toContain('area-arrivals');
  });

  it('publishes zoom after geometry replaces a pending publication frame', () => {
    latestController = null;
    const { rerender } = render(<ViewportHarness />);
    const frame = screen.getByRole('region', { name: 'Atlas viewport' }) as HTMLDivElement;
    setElementRect(frame, { x: 10, y: 20, width: 800, height: 600 });
    act(() => {
      triggerResize(frame, 800, 600);
      flushAnimationFrames(0);
    });

    rerender(<ViewportHarness useLargeFixture />);
    act(() => {
      triggerResize(frame, 640, 480);
      flushAnimationFrames(1);
      flushAnimationFrames(1);
    });

    expect(getController().zoomPercent).toBe(formatZoomPercent(readTransform()));
  });

  it('uses a non-passive native wheel listener and preserves the pointer world point', () => {
    const addSpy = vi.spyOn(HTMLDivElement.prototype, 'addEventListener');
    const frame = renderViewport({ useLargeFixture: true });
    expect(
      addSpy.mock.calls.some(
        ([type, , options]) =>
          type === 'wheel' && (options as AddEventListenerOptions | undefined)?.passive === false,
      ),
    ).toBe(true);
    act(() => getController().reset());
    const before = readTransform();
    const localPoint = { x: 600, y: 200 };
    const worldPoint = {
      x: (localPoint.x - before.x) / before.scale,
      y: (localPoint.y - before.y) / before.scale,
    };
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 610,
      clientY: 220,
      deltaY: -120,
    });
    act(() => frame.dispatchEvent(wheel));
    const after = readTransform();
    expect(wheel.defaultPrevented).toBe(true);
    expect(after.x + worldPoint.x * after.scale).toBeCloseTo(localPoint.x, 8);
    expect(after.y + worldPoint.y * after.scale).toBeCloseTo(localPoint.y, 8);
    addSpy.mockRestore();
  });

  it('supports fit, reset, 1.2x buttons, and frame-only arrow panning', () => {
    const frame = renderViewport({ useLargeFixture: true });
    act(() => getController().reset());
    expect(readTransform().scale).toBe(1);
    act(() => getController().zoomIn());
    expect(readTransform().scale).toBe(1.2);
    act(() => getController().zoomOut());
    expect(readTransform().scale).toBe(1);
    act(() => getController().fit());
    expect(readTransform()).toEqual(
      fitTransform(
        { x: 0, y: 0, width: largeGeometry.width, height: largeGeometry.height },
        { width: 800, height: 600 },
      ),
    );
    act(() => getController().zoomIn());
    expect(readTransform().scale).toBeGreaterThan(
      fitTransform(
        { x: 0, y: 0, width: largeGeometry.width, height: largeGeometry.height },
        { width: 800, height: 600 },
      ).scale,
    );

    const beforeArrow = readMatrixText();
    fireEvent.keyDown(frame, { key: 'ArrowRight' });
    expect(readMatrixText()).not.toBe(beforeArrow);
    const afterArrow = readMatrixText();
    fireEvent.keyDown(screen.getByTestId('pointer-room'), { key: 'ArrowLeft' });
    expect(readMatrixText()).toBe(afterArrow);
  });
});
