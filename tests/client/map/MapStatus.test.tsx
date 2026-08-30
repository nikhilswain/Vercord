import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MapStatus, SourceStatus } from '../../../src/features/map/components/MapStatus';
import { createMapSnapshotFixture } from '../../fixtures/map/map-snapshots';

const snapshot = createMapSnapshotFixture();

describe('MapStatus copy and roles', () => {
  it('keeps the compact header source seam to one status surface', () => {
    const { container } = render(
      <span className="map-status">
        <SourceStatus source="fixture" stale={false} />
      </span>,
    );

    expect(container.querySelectorAll('.map-status')).toHaveLength(1);
    expect(screen.getByText('Demo data', { exact: true })).toBeInTheDocument();
  });

  it('renders loading as one polite status with three app-owned dots', () => {
    const { container } = render(<MapStatus state={{ status: 'loading' }} inFlow />);
    expect(screen.getByRole('status')).toHaveTextContent('Charting the atlas');
    expect(container.querySelectorAll('.map-loading-dot')).toHaveLength(3);
    expect(container.querySelector('.map-status')).toHaveClass('is-in-flow');
  });

  it('renders empty as ordinary content and each failure as exactly one safe alert', () => {
    const { rerender } = render(<MapStatus state={{ status: 'empty', source: 'fixture' }} />);
    expect(screen.getByRole('heading', { name: 'No published rooms' })).toBeInTheDocument();
    expect(screen.getByText('This map has no published areas yet.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(<MapStatus state={{ status: 'invalid' }} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Map unavailable' })).toBeInTheDocument();
    expect(
      screen.getByText('The supplied map data could not be drawn safely.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).not.toHaveTextContent(/schema|guild|worker|https?:/iu);

    rerender(<MapStatus state={{ status: 'unavailable' }} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Atlas unavailable' })).toBeInTheDocument();
    expect(screen.getByText('The map cannot be reached right now.')).toBeInTheDocument();
  });

  it('labels fixture and fresh public ready states without false stale semantics', () => {
    const { rerender } = render(
      <MapStatus state={{ status: 'ready', snapshot, source: 'fixture', stale: true }} compact />,
    );
    expect(screen.getByText('Demo data', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/Update delayed/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.querySelector('.map-status')).toHaveClass('is-compact');

    rerender(
      <MapStatus state={{ status: 'ready', snapshot, source: 'public', stale: false }} compact />,
    );
    expect(screen.getByText('Published map', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('2026-08-29 03:30 UTC')).toBeInstanceOf(HTMLTimeElement);
    expect(screen.getByText('2026-08-29 03:30 UTC')).toHaveAttribute(
      'datetime',
      '2026-08-29T09:00:00+05:30',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('announces delayed updates only for stale public ready state', () => {
    render(<MapStatus state={{ status: 'ready', snapshot, source: 'public', stale: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Published map · Update delayed');
    expect(document.querySelector('.map-status-icon')).toBeInTheDocument();
  });
});
