import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { layoutAtlas } from '../../../src/domain/layout/atlas';
import {
  useRoomExplorer,
  type RoomExplorerController,
} from '../../../src/features/map/use-room-explorer';
import type { MapViewportController } from '../../../src/features/map/use-map-viewport';
import { createMapSnapshotFixture } from '../../fixtures/map/map-snapshots';

const snapshot = createMapSnapshotFixture();
const geometry = layoutAtlas(snapshot);

function renderExplorer(): {
  controller(): RoomExplorerController;
  frame: HTMLDivElement;
  ensureRoomVisible: ReturnType<typeof vi.fn>;
  unmount(): void;
} {
  const frame = document.createElement('div');
  frame.tabIndex = 0;
  document.body.append(frame);
  const ensureRoomVisible = vi.fn();
  const viewport = {
    frameRef: { current: frame },
    ensureRoomVisible,
  } as Pick<MapViewportController, 'frameRef' | 'ensureRoomVisible'>;
  const rendered = renderHook(() => useRoomExplorer(snapshot, geometry, viewport));
  return {
    controller: () => rendered.result.current,
    frame,
    ensureRoomVisible,
    unmount: () => {
      rendered.unmount();
      frame.remove();
    },
  };
}

describe('useRoomExplorer', () => {
  it('resets and wraps active results and restores null matching for an empty query', () => {
    const harness = renderExplorer();
    act(() => harness.controller().setQuery('arrivals'));
    expect(harness.controller().matches.map(({ room }) => room.label)).toEqual([
      'welcome',
      'broadcasts',
    ]);
    expect(harness.controller().matchingRoomKeys).toEqual(
      new Set(['room-welcome', 'room-broadcasts']),
    );
    act(() => harness.controller().setActiveResultIndex(-1));
    expect(harness.controller().activeResultIndex).toBe(1);
    act(() => harness.controller().setActiveResultIndex(2));
    expect(harness.controller().activeResultIndex).toBe(0);
    act(() => harness.controller().clearQuery());
    expect(harness.controller().query).toBe('');
    expect(harness.controller().matches).toEqual([]);
    expect(harness.controller().matchingRoomKeys).toBeNull();
    expect(harness.controller().activeResultIndex).toBe(0);
    harness.unmount();
  });

  it('selects only known rooms, exposes safe facts, and restores a connected HTML origin', () => {
    const harness = renderExplorer();
    const origin = document.createElement('button');
    document.body.append(origin);
    act(() => harness.controller().selectRoom('room-unknown', origin));
    expect(harness.controller().selectedDetails).toBeNull();
    act(() => harness.controller().selectRoom('room-welcome', origin));
    expect(harness.controller().selectedRoomKey).toBe('room-welcome');
    expect(harness.controller().selectedDetails).toEqual({
      roomLabel: 'welcome',
      roomType: 'text',
      areaLabel: 'Arrivals',
      coordinate: { x: 150, y: 146 },
    });
    expect(harness.ensureRoomVisible).toHaveBeenCalledWith(geometry.areas[0]!.rooms[0]);
    act(() => harness.controller().clearSelection());
    expect(origin).toHaveFocus();
    expect(harness.controller().selectedDetails).toBeNull();
    origin.remove();
    harness.unmount();
  });

  it('falls back to the viewport for disconnected and non-HTML origins', () => {
    const harness = renderExplorer();
    const disconnected = document.createElement('button');
    act(() => harness.controller().selectRoom('room-welcome', disconnected));
    act(() => harness.controller().clearSelection());
    expect(harness.frame).toHaveFocus();

    const svgOrigin = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    document.body.append(svgOrigin);
    act(() => harness.controller().selectRoom('room-welcome', svgOrigin as unknown as HTMLElement));
    act(() => harness.controller().clearSelection());
    expect(harness.frame).toHaveFocus();
    svgOrigin.remove();
    harness.unmount();
  });
});
