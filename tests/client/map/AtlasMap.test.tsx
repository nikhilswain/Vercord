import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { layoutAtlas } from '../../../src/domain/layout/atlas';
import type { AtlasGeometry } from '../../../src/domain/layout/geometry';
import type { MapSnapshot } from '../../../src/domain/map/snapshot';
import { ReadyMapWorkspace } from '../../../src/features/map/ReadyMapWorkspace';
import { AtlasMap } from '../../../src/features/map/components/AtlasMap';
import { MapViewport } from '../../../src/features/map/components/MapViewport';
import { useMapViewport } from '../../../src/features/map/use-map-viewport';
import { createLayoutSnapshotFixture } from '../../fixtures/map/map-snapshots';

function ControlledMapViewport({
  snapshot,
  geometry,
  children,
}: {
  snapshot: MapSnapshot;
  geometry: AtlasGeometry;
  children: ReactNode;
}) {
  const controller = useMapViewport(geometry);
  return (
    <MapViewport snapshot={snapshot} geometry={geometry} controller={controller}>
      {children}
    </MapViewport>
  );
}

describe('static atlas SVG', () => {
  it('clips a maximum-length wide district label before the fixed room-count lane', () => {
    const snapshot = createLayoutSnapshotFixture([1]);
    snapshot.areas[0]!.label = 'W'.repeat(100);
    const geometry = layoutAtlas(snapshot);
    const { container } = render(
      <ControlledMapViewport snapshot={snapshot} geometry={geometry}>
        <AtlasMap
          snapshot={snapshot}
          geometry={geometry}
          selectedRoomKey={null}
          matchingRoomKeys={null}
        />
      </ControlledMapViewport>,
    );

    expect(geometry.areas[0]).toMatchObject({ width: 272 });
    expect(container.querySelector('#area-clip-0 rect')).toHaveAttribute('x', '72');
    expect(container.querySelector('#area-clip-0 rect')).toHaveAttribute('width', '128');
    expect(container.querySelector('.atlas-area > text:not(.atlas-room-count)')).toHaveTextContent(
      /^W{23}…$/,
    );
    expect(container.querySelector('.atlas-room-count')).toHaveAttribute('x', '296');
  });

  it('renders ordered layers, safe clips, icons, full titles, and conditional pointer behavior', () => {
    const snapshot = createLayoutSnapshotFixture([7, 1]);
    snapshot.server.displayName = 'Northstar Commons';
    const geometry = layoutAtlas(snapshot);
    const onSelectRoom = vi.fn();
    const { container } = render(
      <ControlledMapViewport snapshot={snapshot} geometry={geometry}>
        <AtlasMap
          snapshot={snapshot}
          geometry={geometry}
          selectedRoomKey={snapshot.areas[0]!.rooms[0]!.key}
          matchingRoomKeys={new Set([snapshot.areas[0]!.rooms[0]!.key])}
          onSelectRoom={onSelectRoom}
        />
      </ControlledMapViewport>,
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
    fireEvent.click(firstRoom!);
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

  it('connects ready spatial rooms to the shared explorer controls', () => {
    const snapshot = createLayoutSnapshotFixture([1]);
    const geometry = layoutAtlas(snapshot);
    const { container } = render(
      <ReadyMapWorkspace snapshot={snapshot} geometry={geometry} source="fixture" stale={false} />,
    );

    const room = container.querySelector('.atlas-room');
    expect(room).toHaveClass('atlas-room--interactive');
    expect(room).not.toHaveAttribute('tabindex');
    expect(room).not.toHaveAttribute('role');
    fireEvent.click(room!);
    expect(screen.getByRole('region', { name: 'Room details' })).toHaveTextContent('Room 1.1');
    expect(screen.getByRole('status', { name: 'Map zoom' })).toHaveTextContent('100%');
    expect(screen.getByText('Demo data')).toBeInTheDocument();
  });
});
