import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MapSnapshot } from '../../../src/domain/map/snapshot';
import { MapPageView } from '../../../src/features/map/MapPageView';
import { demoMapFixtureResult } from '../../../src/features/map/fixtures/demo-map';
import { createMapViewState } from '../../../src/features/map/map-view-state';
import {
  flushAnimationFrames,
  setBrowserMediaState,
  setElementRect,
  triggerResize,
} from '../helpers/browser-api-mocks';
import { createLayoutSnapshotFixture } from '../../fixtures/map/map-snapshots';

const demoSnapshot = (() => {
  if (!demoMapFixtureResult.ok) throw new Error('The invented demo fixture must parse.');
  return demoMapFixtureResult.snapshot;
})();

function renderAccessibleMap(snapshot: MapSnapshot): HTMLDivElement {
  render(<MapPageView state={createMapViewState(snapshot, 'fixture')} />);
  const frame = screen.getByRole('region', { name: 'Atlas viewport' });
  setElementRect(frame, { width: 800, height: 600 });
  act(() => {
    triggerResize(frame, 800, 600);
    flushAnimationFrames(0);
    flushAnimationFrames(0);
  });
  return frame as HTMLDivElement;
}

describe('atlas component accessibility', () => {
  it('links visible instructions, names every control, separates live regions, and keeps IDs private', () => {
    const frame = renderAccessibleMap(demoSnapshot);
    const instructionId = frame.getAttribute('aria-describedby');
    expect(instructionId).toBeTruthy();
    expect(document.getElementById(instructionId!)).toHaveTextContent(/Arrow keys pan/u);
    for (const name of ['Zoom in', 'Zoom out', 'Fit map', 'Reset view']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    const search = screen.getByRole('combobox', { name: 'Search rooms' });
    fireEvent.change(search, { target: { value: 'welcome' } });
    const zoomStatus = screen.getByRole('status', { name: 'Map zoom' });
    const resultStatus = screen.getByRole('status', { name: 'Search result count' });
    expect(zoomStatus).not.toBe(resultStatus);

    const serialized = document.body.innerHTML;
    for (const area of demoSnapshot.areas) {
      expect(serialized).not.toContain(area.key);
      for (const room of area.rooms) expect(serialized).not.toContain(room.key);
    }
    const opaqueKeys = demoSnapshot.areas.flatMap((area) => [
      area.key,
      ...area.rooms.map((room) => room.key),
    ]);
    for (const element of document.querySelectorAll(
      '[id], [aria-describedby], [aria-labelledby], [aria-controls], [aria-activedescendant]',
    )) {
      const relationships = [
        element.getAttribute('id'),
        element.getAttribute('aria-describedby'),
        element.getAttribute('aria-labelledby'),
        element.getAttribute('aria-controls'),
        element.getAttribute('aria-activedescendant'),
      ].join(' ');
      for (const opaqueKey of opaqueKeys) expect(relationships).not.toContain(opaqueKey);
    }
  });

  it('adds text plus ring/notch selection cues and keeps one details node', () => {
    const { container } = render(
      <MapPageView state={createMapViewState(demoSnapshot, 'fixture')} />,
    );
    const directory = screen.getByRole('navigation', { name: 'Room directory' });
    // React 19 does not flush these directory selections for raw DOM clicks in jsdom.
    fireEvent.click(within(directory).getByRole('button', { name: /welcome.*text/iu }));
    const selectedDirectoryRoom = within(directory).getByRole('button', {
      name: /welcome.*text/iu,
    });
    expect(selectedDirectoryRoom).toHaveTextContent('Selected');
    expect(selectedDirectoryRoom).toHaveClass('is-selected');
    expect(
      container.querySelector('.atlas-room.is-selected .atlas-room-selection-ring'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('.atlas-room.is-selected .atlas-room-selection-notch'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Room details' })).toHaveLength(1);
  });

  it('updates coarse ownership live, escapes from the focused toggle, and centres immediately under reduced motion', () => {
    const large = createLayoutSnapshotFixture([10, 10, 10, 10]);
    const frame = renderAccessibleMap(large);
    expect(screen.queryByRole('button', { name: 'Move map' })).not.toBeInTheDocument();
    act(() => setBrowserMediaState({ anyCoarsePointer: true }));
    // React 19 does not flush this state transition for the raw DOM click in jsdom.
    fireEvent.click(screen.getByRole('button', { name: 'Move map' }));
    const done = screen.getByRole('button', { name: 'Done moving' });
    done.focus();
    fireEvent.keyDown(done, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Move map' })).toHaveFocus();
    expect(frame).not.toHaveClass('is-touch-navigation');

    screen.getByRole('button', { name: 'Reset view' }).click();
    act(() => setBrowserMediaState({ reducedMotion: true }));
    const animationSpy = vi.spyOn(window, 'requestAnimationFrame');
    const beforeFrames = animationSpy.mock.calls.length;
    const lastRoom = within(screen.getByRole('navigation', { name: 'Room directory' })).getByRole(
      'button',
      { name: /Room 4\.10/iu },
    );
    fireEvent.click(lastRoom);
    expect(animationSpy).toHaveBeenCalledTimes(beforeFrames);
    expect(screen.getByRole('region', { name: 'Room details' })).toHaveTextContent('Room 4.10');
    animationSpy.mockRestore();
  });
});
