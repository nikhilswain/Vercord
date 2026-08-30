import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { layoutAtlas } from '../../../src/domain/layout/atlas';
import type { MapSnapshot } from '../../../src/domain/map/snapshot';
import { MapPageView } from '../../../src/features/map/MapPageView';
import { demoMapFixtureResult } from '../../../src/features/map/fixtures/demo-map';
import { createMapViewState } from '../../../src/features/map/map-view-state';
import { flushAnimationFrames, setElementRect, triggerResize } from '../helpers/browser-api-mocks';
import { createLayoutSnapshotFixture } from '../../fixtures/map/map-snapshots';

if (!demoMapFixtureResult.ok) throw new Error('The invented demo fixture must parse.');
const demoSnapshot = demoMapFixtureResult.snapshot;

function initialiseFrame(width = 800, height = 600): HTMLDivElement {
  const frame = screen.getByRole('region', { name: 'Atlas viewport' });
  setElementRect(frame, { x: 0, y: 0, width, height });
  act(() => {
    triggerResize(frame, width, height);
    flushAnimationFrames(0);
    flushAnimationFrames(0);
  });
  return frame as HTMLDivElement;
}

function matrixText(): string {
  return document.querySelector('[data-map-world]')?.getAttribute('transform') ?? '';
}

function renderReady(snapshot: MapSnapshot) {
  const createGeometry = vi.fn(layoutAtlas);
  render(
    <MapPageView state={createMapViewState(snapshot, 'fixture')} createGeometry={createGeometry} />,
  );
  initialiseFrame();
  return createGeometry;
}

describe('ready atlas exploration', () => {
  it('shares selection and safe details without recomputing geometry', () => {
    const createGeometry = renderReady(demoSnapshot);
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const beforeZoom = matrixText();
    zoomIn.click();
    expect(matrixText()).not.toBe(beforeZoom);
    screen.getByRole('button', { name: 'Fit map' }).click();

    const search = screen.getByRole('combobox', { name: 'Search rooms' });
    fireEvent.change(search, { target: { value: 'welcome' } });
    const beforeSelection = matrixText();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(matrixText()).toBe(beforeSelection);
    const details = screen.getByRole('region', { name: 'Room details' });
    expect(details).toHaveTextContent('welcome');
    expect(details).toHaveTextContent('(150, 146)');
    screen.getByRole('button', { name: 'Close room details' }).click();
    expect(search).toHaveFocus();

    const directory = screen.getByRole('navigation', { name: 'Room directory' });
    const directoryWelcome = within(directory).getByRole('button', { name: /welcome.*text/iu });
    directoryWelcome.click();
    expect(details).toHaveTextContent('welcome');
    screen.getByRole('button', { name: 'Close room details' }).click();
    expect(directoryWelcome).toHaveFocus();

    const spatialLabel = within(screen.getByRole('img', { name: 'Northstar Commons atlas' }))
      .getAllByText('welcome', { exact: true })
      .find((element) => element.tagName.toLowerCase() === 'text');
    if (!spatialLabel) throw new Error('Visible spatial room label was not rendered.');
    fireEvent.click(spatialLabel);
    expect(details).toHaveTextContent('welcome');
    expect(document.body.innerHTML).not.toContain('room-welcome');
    expect(document.body.innerHTML).not.toContain('area-arrivals');
    expect(screen.getAllByRole('region', { name: 'Room details' })).toHaveLength(1);
    expect(createGeometry).toHaveBeenCalledTimes(1);
  });

  it('animates an offscreen directory selection after reset', () => {
    const large = createLayoutSnapshotFixture([10, 10, 10, 10]);
    renderReady(large);
    screen.getByRole('button', { name: 'Reset view' }).click();
    const before = matrixText();
    const directory = screen.getByRole('navigation', { name: 'Room directory' });
    within(directory)
      .getByRole('button', { name: /Room 1\.1.*text$/iu })
      .click();
    act(() => flushAnimationFrames(0));
    act(() => flushAnimationFrames(220));
    expect(matrixText()).not.toBe(before);
    expect(screen.getByRole('region', { name: 'Room details' })).toHaveTextContent('Room 1.1');
  });
});
