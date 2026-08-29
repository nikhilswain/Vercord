import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { layoutAtlas } from '../../../src/domain/layout/atlas';
import { ReadyMapWorkspace } from '../../../src/features/map/ReadyMapWorkspace';
import { AtlasMap } from '../../../src/features/map/components/AtlasMap';
import { MapViewport } from '../../../src/features/map/components/MapViewport';
import { createLayoutSnapshotFixture } from '../../fixtures/map/map-snapshots';

describe('static atlas SVG', () => {
  it('renders ordered layers, safe clips, icons, full titles, and conditional pointer behavior', () => {
    const snapshot = createLayoutSnapshotFixture([7, 1]);
    snapshot.server.displayName = 'Northstar Commons';
    const geometry = layoutAtlas(snapshot);
    const onSelectRoom = vi.fn();
    const { container } = render(
      <MapViewport snapshot={snapshot} geometry={geometry}>
        <AtlasMap
          snapshot={snapshot}
          geometry={geometry}
          selectedRoomKey={snapshot.areas[0]!.rooms[0]!.key}
          matchingRoomKeys={new Set([snapshot.areas[0]!.rooms[0]!.key])}
          onSelectRoom={onSelectRoom}
        />
      </MapViewport>,
    );

    expect(screen.getByRole('img', { name: 'Northstar Commons atlas' })).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('#area-clip-0')).toBeInTheDocument();
    expect(container.querySelector('#room-clip-0-0')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-layer]')).toHaveLength(3);
    expect(container.querySelector('[data-layer="grid"]')?.nextElementSibling).toHaveAttribute(
      'data-layer',
      'routes',
    );
    expect(container.querySelector('[data-layer="routes"]')?.nextElementSibling).toHaveAttribute(
      'data-layer',
      'districts',
    );

    const firstRoom = container.querySelector('.atlas-room');
    expect(firstRoom).toHaveClass('atlas-room--interactive');
    expect(firstRoom).not.toHaveAttribute('tabindex');
    expect(firstRoom).not.toHaveAttribute('role');
    fireEvent.pointerUp(firstRoom!);
    expect(onSelectRoom).toHaveBeenCalledWith(snapshot.areas[0]!.rooms[0]!.key);
    expect(container.querySelectorAll('.room-type-icon')).toHaveLength(8);
    expect(container.querySelector('.is-selected')).toBeInTheDocument();
    expect(container.querySelector('.is-muted')).toBeInTheDocument();

    const nestedTitles = Array.from(
      container.querySelectorAll('[data-layer="districts"] title'),
    ).map((title) => title.textContent);
    expect(nestedTitles).toEqual(
      expect.arrayContaining([
        ...snapshot.areas.map(({ label }) => label),
        ...snapshot.areas.flatMap(({ rooms }) => rooms.map(({ label }) => label)),
      ]),
    );

    const serialized = container.innerHTML;
    for (const area of snapshot.areas) {
      expect(serialized).not.toContain(area.key);
      for (const room of area.rooms) expect(serialized).not.toContain(room.key);
    }
  });

  it('keeps the ready workspace static and source-status free', () => {
    const snapshot = createLayoutSnapshotFixture([1]);
    const geometry = layoutAtlas(snapshot);
    const { container } = render(
      <ReadyMapWorkspace snapshot={snapshot} geometry={geometry} source="fixture" stale={false} />,
    );

    expect(container.querySelector('.atlas-room')).not.toHaveClass('atlas-room--interactive');
    expect(container.querySelector('.atlas-room')).not.toHaveAttribute('tabindex');
    expect(container.querySelector('.atlas-room')).not.toHaveAttribute('role');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
