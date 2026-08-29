import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { layoutAtlas } from '../../../src/domain/layout/atlas';
import { MapToolbar } from '../../../src/features/map/components/MapToolbar';
import { MapViewport } from '../../../src/features/map/components/MapViewport';
import { useMapViewport } from '../../../src/features/map/use-map-viewport';
import { flushAnimationFrames, setElementRect, triggerResize } from '../helpers/browser-api-mocks';
import { createLayoutSnapshotFixture } from '../../fixtures/map/map-snapshots';

const snapshot = createLayoutSnapshotFixture([10, 10, 10]);
const geometry = layoutAtlas(snapshot);

function ToolbarHarness() {
  const viewport = useMapViewport(geometry);
  return (
    <>
      <MapToolbar search={<input aria-label="Search rooms" />} viewport={viewport} />
      <MapViewport snapshot={snapshot} geometry={geometry} controller={viewport}>
        <rect x="0" y="0" width="10" height="10" />
      </MapViewport>
    </>
  );
}

function matrixText(): string {
  return document.querySelector('[data-map-world]')?.getAttribute('transform') ?? '';
}

describe('MapToolbar', () => {
  it('names groups and icon controls, links ordinal tooltips, and performs camera actions', () => {
    render(<ToolbarHarness />);
    const frame = screen.getByRole('region', { name: 'Atlas viewport' });
    setElementRect(frame, { width: 800, height: 600 });
    act(() => {
      triggerResize(frame, 800, 600);
      flushAnimationFrames(0);
      flushAnimationFrames(0);
    });
    expect(screen.getByRole('group', { name: 'Search rooms' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Map view' })).toBeInTheDocument();
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    expect(zoomIn).toHaveClass('map-control-button');
    const tooltipId = zoomIn.getAttribute('aria-describedby');
    expect(tooltipId).toMatch(/-tooltip-0$/u);
    expect(document.getElementById(tooltipId!)).toHaveTextContent('Zoom in');
    const before = matrixText();
    zoomIn.click();
    expect(matrixText()).not.toBe(before);
    act(() => flushAnimationFrames(1));
    expect(screen.getByRole('status', { name: 'Map zoom' })).toHaveTextContent('%');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Fit map' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeEnabled();
  });

  it('renders a stable disabled Map view group without a ready controller', () => {
    render(<MapToolbar search={<input disabled aria-label="Search rooms" />} viewport={null} />);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Map zoom' })).toHaveTextContent('100%');
  });
});
