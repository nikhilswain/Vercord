import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { layoutAtlas } from '../../../src/domain/layout/atlas';
import { MapViewport } from '../../../src/features/map/components/MapViewport';
import {
  type MapViewportController,
  useMapViewport,
} from '../../../src/features/map/use-map-viewport';
import {
  centerRect,
  fitTransform,
  formatZoomPercent,
  isRectVisible,
  type ViewTransform,
} from '../../../src/features/map/viewport-transform';
import {
  flushAnimationFrames,
  setBrowserMediaState,
  setElementRect,
  triggerResize,
} from '../helpers/browser-api-mocks';
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

  it('keeps a sub-threshold room click and captures at an exact Euclidean 4px', () => {
    const onRoomClick = vi.fn();
    const frame = renderViewport({ useLargeFixture: true, onRoomClick });
    const room = screen.getByTestId('pointer-room');
    fireEvent.pointerDown(room, {
      pointerId: 7,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(room, { pointerId: 7, pointerType: 'mouse', clientX: 103, clientY: 100 });
    expect(frame.hasPointerCapture(7)).toBe(false);
    fireEvent.pointerUp(room, { pointerId: 7, pointerType: 'mouse', clientX: 103, clientY: 100 });
    fireEvent.click(room);
    expect(onRoomClick).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(room, {
      pointerId: 8,
      pointerType: 'mouse',
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(room, { pointerId: 8, pointerType: 'mouse', clientX: 100, clientY: 104 });
    expect(frame.hasPointerCapture(8)).toBe(true);
    fireEvent.pointerCancel(room, { pointerId: 8, pointerType: 'mouse' });
    expect(frame.hasPointerCapture(8)).toBe(false);
  });

  it('lets the first pointer win and ignores other pointer ids', () => {
    const frame = renderViewport({ useLargeFixture: true });
    const room = screen.getByTestId('pointer-room');
    fireEvent.pointerDown(room, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerDown(room, {
      pointerId: 2,
      pointerType: 'mouse',
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    const before = readMatrixText();
    fireEvent.pointerMove(room, { pointerId: 2, pointerType: 'mouse', clientX: 180, clientY: 180 });
    fireEvent.pointerUp(room, { pointerId: 2, pointerType: 'mouse' });
    expect(readMatrixText()).toBe(before);
    expect(frame.hasPointerCapture(2)).toBe(false);
    fireEvent.pointerMove(room, { pointerId: 1, pointerType: 'mouse', clientX: 54, clientY: 50 });
    expect(frame.hasPointerCapture(1)).toBe(true);
    fireEvent.pointerUp(room, { pointerId: 1, pointerType: 'mouse' });
  });

  it('suppresses exactly one synthesized post-drag click and has a timeout fallback', () => {
    vi.useFakeTimers();
    const onRoomClick = vi.fn();
    renderViewport({ useLargeFixture: true, onRoomClick });
    const room = screen.getByTestId('pointer-room');
    fireEvent.pointerDown(room, {
      pointerId: 3,
      pointerType: 'mouse',
      button: 0,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerMove(room, { pointerId: 3, pointerType: 'mouse', clientX: 66, clientY: 60 });
    fireEvent.pointerUp(room, { pointerId: 3, pointerType: 'mouse', clientX: 66, clientY: 60 });
    fireEvent.click(room);
    expect(onRoomClick).not.toHaveBeenCalled();
    fireEvent.click(room);
    expect(onRoomClick).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(room, {
      pointerId: 4,
      pointerType: 'mouse',
      button: 0,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerMove(room, { pointerId: 4, pointerType: 'mouse', clientX: 64, clientY: 60 });
    fireEvent.pointerUp(room, { pointerId: 4, pointerType: 'mouse', clientX: 64, clientY: 60 });
    act(() => vi.runOnlyPendingTimers());
    fireEvent.click(room);
    expect(onRoomClick).toHaveBeenCalledTimes(2);
  });

  it('cleans active state after cancel and lost capture', () => {
    const frame = renderViewport({ useLargeFixture: true });
    const room = screen.getByTestId('pointer-room');
    fireEvent.pointerDown(room, {
      pointerId: 11,
      pointerType: 'pen',
      button: 0,
      clientX: 80,
      clientY: 80,
    });
    fireEvent.pointerMove(room, { pointerId: 11, pointerType: 'pen', clientX: 84, clientY: 80 });
    fireEvent.pointerCancel(room, { pointerId: 11, pointerType: 'pen' });
    const afterCancel = readMatrixText();
    fireEvent.pointerMove(room, { pointerId: 11, pointerType: 'pen', clientX: 120, clientY: 80 });
    expect(readMatrixText()).toBe(afterCancel);

    fireEvent.pointerDown(room, {
      pointerId: 12,
      pointerType: 'pen',
      button: 0,
      clientX: 80,
      clientY: 80,
    });
    fireEvent.pointerMove(room, { pointerId: 12, pointerType: 'pen', clientX: 84, clientY: 80 });
    fireEvent.lostPointerCapture(frame, { pointerId: 12, pointerType: 'pen' });
    const afterLoss = readMatrixText();
    fireEvent.pointerMove(room, { pointerId: 12, pointerType: 'pen', clientX: 120, clientY: 80 });
    expect(readMatrixText()).toBe(afterLoss);
  });

  it('does not move a visible room and centres an offscreen room over 220ms', () => {
    const frame = renderViewport({ useLargeFixture: true });
    const initial = readTransform();
    const visibleRoom = largeGeometry.areas
      .flatMap((area) => area.rooms)
      .find((room) => isRectVisible(initial, room, { width: 800, height: 600 }));
    if (!visibleRoom) throw new Error('The fitted fixture must expose a visible room.');
    const beforeVisible = readMatrixText();
    act(() => getController().ensureRoomVisible(visibleRoom));
    expect(readMatrixText()).toBe(beforeVisible);

    act(() => getController().reset());
    const reset = readTransform();
    const offscreenRoom = largeGeometry.areas
      .flatMap((area) => area.rooms)
      .find((room) => !isRectVisible(reset, room, { width: 800, height: 600 }));
    if (!offscreenRoom) throw new Error('The reset fixture must contain an offscreen room.');
    const destination = centerRect(
      reset,
      offscreenRoom,
      { x: 0, y: 0, width: largeGeometry.width, height: largeGeometry.height },
      { width: 800, height: 600 },
    );
    const visibleFromReset = largeGeometry.areas
      .flatMap((area) => area.rooms)
      .find((room) => isRectVisible(reset, room, { width: 800, height: 600 }));
    if (!visibleFromReset) throw new Error('The reset fixture must expose a visible room.');

    act(() => getController().ensureRoomVisible(offscreenRoom));
    act(() => flushAnimationFrames(0));
    expect(readTransform()).toEqual(reset);
    act(() => getController().ensureRoomVisible(visibleFromReset));
    act(() => flushAnimationFrames(220));
    expect(readTransform()).toEqual(reset);

    act(() => getController().ensureRoomVisible(offscreenRoom));
    act(() => flushAnimationFrames(0));
    act(() => flushAnimationFrames(220));
    expect(readTransform()).toEqual(destination);
    expect(frame).toBeInTheDocument();
  });

  it('moves immediately under reduced motion and direct input cancels an active motion', () => {
    const frame = renderViewport({ useLargeFixture: true });
    act(() => getController().reset());
    const room = largeGeometry.areas
      .flatMap((area) => area.rooms)
      .find((candidate) => !isRectVisible(readTransform(), candidate, { width: 800, height: 600 }));
    if (!room) throw new Error('The reset fixture must contain an offscreen room.');

    act(() => setBrowserMediaState({ reducedMotion: true }));
    const frameSpy = vi.spyOn(window, 'requestAnimationFrame');
    const frameCount = frameSpy.mock.calls.length;
    act(() => getController().ensureRoomVisible(room));
    expect(frameSpy).toHaveBeenCalledTimes(frameCount);
    expect(isRectVisible(readTransform(), room, { width: 800, height: 600 })).toBe(true);
    frameSpy.mockRestore();

    act(() => setBrowserMediaState({ reducedMotion: false }));
    act(() => getController().reset());
    act(() => getController().ensureRoomVisible(room));
    act(() => flushAnimationFrames(0));
    fireEvent.keyDown(frame, { key: 'ArrowLeft' });
    const interrupted = readMatrixText();
    act(() => flushAnimationFrames(220));
    expect(readMatrixText()).toBe(interrupted);
  });

  it('keeps a resize fit after cancelling an active room motion', () => {
    const frame = renderViewport({ useLargeFixture: true });
    act(() => getController().reset());
    const room = largeGeometry.areas
      .flatMap((area) => area.rooms)
      .find((candidate) => !isRectVisible(readTransform(), candidate, { width: 800, height: 600 }));
    if (!room) throw new Error('The reset fixture must contain an offscreen room.');

    act(() => getController().ensureRoomVisible(room));
    act(() => flushAnimationFrames(0));
    act(() => {
      triggerResize(frame, 640, 480);
      flushAnimationFrames(20);
      flushAnimationFrames(20);
    });
    const resizedFit = fitTransform(
      { x: 0, y: 0, width: largeGeometry.width, height: largeGeometry.height },
      { width: 640, height: 480 },
    );
    expect(readTransform()).toEqual(resizedFit);
    act(() => flushAnimationFrames(240));
    expect(readTransform()).toEqual(resizedFit);
  });
});
