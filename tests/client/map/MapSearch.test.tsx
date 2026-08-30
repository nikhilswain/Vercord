import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { layoutAtlas } from '../../../src/domain/layout/atlas';
import { MapSearch } from '../../../src/features/map/components/MapSearch';
import { useRoomExplorer } from '../../../src/features/map/use-room-explorer';
import type { MapViewportController } from '../../../src/features/map/use-map-viewport';
import { createMapSnapshotFixture } from '../../fixtures/map/map-snapshots';

const snapshot = createMapSnapshotFixture();
const geometry = layoutAtlas(snapshot);

function SearchHarness() {
  const viewport = {
    frameRef: { current: null },
    ensureRoomVisible: vi.fn(),
  } as Pick<MapViewportController, 'frameRef' | 'ensureRoomVisible'>;
  const explorer = useRoomExplorer(snapshot, geometry, viewport);
  return (
    <>
      <MapSearch explorer={explorer} />
      <output data-testid="selected-room">{explorer.selectedDetails?.roomLabel ?? ''}</output>
    </>
  );
}

function renderSearch(): HTMLInputElement {
  render(<SearchHarness />);
  return screen.getByRole('combobox', { name: 'Search rooms' });
}

describe('MapSearch', () => {
  it('opens only for a non-empty query, announces count/no-results, and uses ordinal IDs', () => {
    const input = renderSearch();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'arrivals' } });
    expect(screen.getByRole('status', { name: 'Search result count' })).toHaveTextContent(
      '2 results',
    );
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getAllByRole('option')[0]).toHaveAttribute(
      'id',
      expect.stringMatching(/-option-0$/u),
    );
    expect(document.body.innerHTML).not.toContain('room-welcome');
    expect(document.body.innerHTML).not.toContain('room-broadcasts');

    fireEvent.change(input, { target: { value: 'no such room' } });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByText('No rooms found')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Search result count' })).toHaveTextContent(
      '0 results',
    );
  });

  it('wraps arrows, ignores composing Enter, selects after composition, and clears with focus', () => {
    const input = renderSearch();
    fireEvent.change(input, { target: { value: 'arrivals' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringMatching(/-option-1$/u));
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('selected-room')).toHaveTextContent('');
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('selected-room')).toHaveTextContent('broadcasts');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: 'welcome' } });
    const clear = screen.getByRole('button', { name: 'Clear room search' });
    expect(clear).toHaveClass('map-search-clear');
    fireEvent.click(clear);
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });
});
