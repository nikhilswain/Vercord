import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AtlasLayoutError } from '../../../src/domain/layout/invariants';
import { createMapViewState } from '../../../src/features/map/map-view-state';
import { MapPageView } from '../../../src/features/map/MapPageView';
import {
  createEmptyMapSnapshotFixture,
  createLayoutSnapshotFixture,
  createMalformedMapSnapshotFixture,
} from '../../fixtures/map/map-snapshots';

describe('MapPageView', () => {
  it('maps validated input to exact ready, empty, invalid, and stale states', () => {
    const fixtureReady = createMapViewState(createLayoutSnapshotFixture([0]), 'fixture', true);
    expect(fixtureReady).toMatchObject({ status: 'ready', source: 'fixture', stale: false });
    expect(createMapViewState(createEmptyMapSnapshotFixture(), 'fixture')).toEqual({
      status: 'empty',
      source: 'fixture',
    });
    expect(createMapViewState(createMalformedMapSnapshotFixture(), 'fixture')).toEqual({
      status: 'invalid',
    });
    expect(createMapViewState(createLayoutSnapshotFixture([1]), 'public', true)).toMatchObject({
      status: 'ready',
      source: 'public',
      stale: true,
    });
  });

  it('renders stable states and converts AtlasLayoutError to invalid', () => {
    const { rerender } = render(<MapPageView state={{ status: 'loading' }} />);
    expect(screen.getByText('Charting the atlas')).toBeInTheDocument();

    rerender(
      <MapPageView
        state={createMapViewState(createLayoutSnapshotFixture([1]), 'fixture')}
        createGeometry={() => {
          throw new AtlasLayoutError();
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Map unavailable' })).toBeInTheDocument();
    expect(document.querySelector('[data-map-world]')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerender(<MapPageView state={{ status: 'unavailable' }} />);
    expect(screen.getByRole('heading', { name: 'Atlas unavailable' })).toBeInTheDocument();
  });
});
