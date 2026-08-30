import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AtlasLayoutError } from '../../../src/domain/layout/invariants';
import { MapPageView } from '../../../src/features/map/MapPageView';
import { createMapViewState, type MapViewState } from '../../../src/features/map/map-view-state';
import { createLayoutSnapshotFixture } from '../../fixtures/map/map-snapshots';

function expectStableLandmarks(): void {
  const toolbar = screen.getByLabelText('Atlas tools');
  const status = document.querySelector('.map-status');
  const viewport = screen.getByRole('region', { name: 'Atlas viewport' });
  const details = screen.getByRole('region', { name: 'Room details' });
  const directory = screen.getByRole('navigation', { name: 'Room directory' });
  if (!status) throw new Error('Stable status node was not rendered.');
  const ordered = [toolbar, status, viewport, details, directory];
  ordered.slice(0, -1).forEach((node, index) => {
    expect(node.compareDocumentPosition(ordered[index + 1]!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(screen.getAllByRole('region', { name: 'Room details' })).toHaveLength(1);
}

describe('MapWorkspaceShell', () => {
  it('keeps stable landmarks for initial loading, empty, invalid, and unavailable states', () => {
    const states: MapViewState[] = [
      { status: 'loading' },
      { status: 'empty', source: 'fixture' },
      { status: 'invalid' },
      { status: 'unavailable' },
    ];
    const { rerender } = render(<MapPageView state={states[0]!} />);
    for (const state of states) {
      rerender(<MapPageView state={state} />);
      expectStableLandmarks();
      expect(screen.getByRole('combobox', { name: 'Search rooms' })).toBeDisabled();
      expect(document.querySelector('[data-map-world]')).not.toBeInTheDocument();
    }
  });

  it('keeps the same shell for ready zero-room districts and layout failure', () => {
    const zeroRoomDistrict = createLayoutSnapshotFixture([0]);
    const { container, rerender } = render(
      <MapPageView state={createMapViewState(zeroRoomDistrict, 'fixture')} />,
    );
    expectStableLandmarks();
    expect(container.querySelector('[data-map-world]')).toBeInTheDocument();
    expect(container.querySelectorAll('.atlas-area')).toHaveLength(1);

    rerender(
      <MapPageView
        state={createMapViewState(createLayoutSnapshotFixture([1]), 'fixture')}
        createGeometry={() => {
          throw new AtlasLayoutError();
        }}
      />,
    );
    expectStableLandmarks();
    expect(container.querySelector('[data-map-world]')).not.toBeInTheDocument();
  });
});
