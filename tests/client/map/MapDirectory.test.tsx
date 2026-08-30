import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { layoutAtlas } from '../../../src/domain/layout/atlas';
import { MapDirectory } from '../../../src/features/map/components/MapDirectory';
import { MapSearch } from '../../../src/features/map/components/MapSearch';
import { RoomDetails } from '../../../src/features/map/components/RoomDetails';
import { demoMapFixtureResult } from '../../../src/features/map/fixtures/demo-map';
import { useRoomExplorer } from '../../../src/features/map/use-room-explorer';
import type { MapViewportController } from '../../../src/features/map/use-map-viewport';

if (!demoMapFixtureResult.ok) throw new Error('The invented demo fixture must parse.');
const snapshot = demoMapFixtureResult.snapshot;
const geometry = layoutAtlas(snapshot);

function DirectoryHarness() {
  const viewport = {
    frameRef: { current: null },
    ensureRoomVisible: vi.fn(),
  } as Pick<MapViewportController, 'frameRef' | 'ensureRoomVisible'>;
  const explorer = useRoomExplorer(snapshot, geometry, viewport);
  return (
    <>
      <MapSearch explorer={explorer} />
      <MapDirectory snapshot={snapshot} explorer={explorer} />
      <RoomDetails details={explorer.selectedDetails} onClose={explorer.clearSelection} />
    </>
  );
}

describe('MapDirectory and RoomDetails', () => {
  it('wraps each directory room icon in a presentational SVG viewport', () => {
    render(<DirectoryHarness />);
    const directory = screen.getByRole('navigation', { name: 'Room directory' });
    const iconViewports = within(directory)
      .getAllByRole('button')
      .flatMap((button) => Array.from(button.querySelectorAll('svg[aria-hidden="true"]')));

    expect(iconViewports).toHaveLength(8);
    iconViewports.forEach((viewport) => {
      expect(viewport.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(viewport).toHaveAttribute('viewBox', '0 0 20 20');
      expect(viewport.querySelector('.room-type-icon')).toBeInTheDocument();
    });
  });

  it('renders exact demo area/room order, counts, full labels, and room types', () => {
    render(<DirectoryHarness />);
    const directory = screen.getByRole('navigation', { name: 'Room directory' });
    expect(
      within(directory)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Arrivals', 'Workshop', 'Commons', 'Quiet Wing', 'Uncategorized']);
    expect(within(directory).getAllByRole('list')).toHaveLength(5);
    expect(within(directory).getAllByRole('listitem')).toHaveLength(8);
    expect(within(directory).getByText('0 rooms')).toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /welcome.*text/iu })).toBeInTheDocument();
    expect(
      within(directory).getByRole('button', { name: /oddments.*unsupported/iu }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Room details' })).toHaveLength(1);
  });

  it('mutes nonmatches, marks selection without color alone, and exposes only safe facts', () => {
    render(<DirectoryHarness />);
    const input = screen.getByRole('combobox', { name: 'Search rooms' });
    fireEvent.change(input, { target: { value: 'welcome' } });
    const directory = screen.getByRole('navigation', { name: 'Room directory' });
    const welcome = within(directory).getByRole('button', { name: /welcome.*text/iu });
    const broadcasts = within(directory).getByRole('button', {
      name: /broadcasts.*announcement/iu,
    });
    expect(welcome).not.toHaveClass('is-muted');
    expect(broadcasts).toHaveClass('is-muted');

    fireEvent.click(welcome);
    expect(welcome).toHaveAttribute('aria-pressed', 'true');
    expect(welcome).toHaveClass('is-selected');
    expect(welcome).toHaveTextContent('Selected');
    const details = screen.getByRole('region', { name: 'Room details' });
    expect(details).toHaveTextContent('welcome');
    expect(details).toHaveTextContent('text');
    expect(details).toHaveTextContent('Arrivals');
    expect(details).toHaveTextContent('(150, 146)');
    expect(details).not.toHaveTextContent(/area-|room-|\b\d{17,20}\b/u);
    expect(document.body.innerHTML).not.toContain('room-welcome');
  });
});
