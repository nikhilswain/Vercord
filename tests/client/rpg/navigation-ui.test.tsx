import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RpgAtlasDialog from '../../../src/features/rpg/atlas/RpgAtlasDialog';
import type { WorldTown } from '../../../src/domain/world/protocol';
import type { RpgSample } from '../../../src/features/rpg/types';

const sample: RpgSample = {
  id: 'village',
  name: 'Town',
  subtitle: '',
  bounds: { x: 0, y: 0, width: 1000, height: 1000 },
  spawn: { x: 100, y: 100 },
  textures: [],
  stamps: [],
  colliders: [],
  npcs: [],
  lights: [],
  background: '#14291f',
  landmarks: [
    {
      id: 'house:one',
      name: 'Old label',
      description: '',
      x: 500,
      y: 500,
      radius: 64,
      kind: 'view',
    },
    {
      id: 'house:private',
      name: 'Private house',
      description: '',
      x: 300,
      y: 300,
      radius: 64,
      kind: 'view',
    },
  ],
};
const town = {
  continuous: true,
  districts: [
    {
      key: 'district',
      label: 'Neighborhood',
      streets: [
        {
          id: 'street',
          number: 1,
          rooms: [{ key: 'channel:one', label: 'Library', type: 'text', landmarkId: 'house:one' }],
        },
      ],
    },
  ],
} as WorldTown;

beforeEach(() => localStorage.clear());

describe('atlas destinations', () => {
  it('selects a house with the real doorway identity instead of opening a pin form', () => {
    const navigate = vi.fn(() => ({ ok: true as const }));
    render(
      <RpgAtlasDialog
        sample={sample}
        town={town}
        name="Town"
        scope="test"
        position={sample.spawn}
        onClose={vi.fn()}
        onNavigate={navigate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select Library' }));
    expect(screen.queryByRole('dialog', { name: 'Leave a pin' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Navigate to' }));
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'place:house:one',
        name: 'Library',
        point: { x: 500, y: 500 },
      }),
    );
    expect(screen.queryByRole('button', { name: 'Select Private house' })).not.toBeInTheDocument();
  });

  it('selects an existing pin, offers explicit editing, and stops its route on deletion', () => {
    localStorage.setItem(
      'dmap.atlas.pins.v1/test',
      JSON.stringify([{ id: 'pin', name: 'Meet here', kind: 'location', x: 500, y: 550 }]),
    );
    const stop = vi.fn();
    render(
      <RpgAtlasDialog
        sample={sample}
        town={town}
        name="Town"
        scope="test"
        position={sample.spawn}
        onClose={vi.fn()}
        onNavigate={() => ({ ok: true })}
        onStopNavigation={stop}
        navigation={{
          target: {
            id: 'pin:pin',
            name: 'Meet here',
            kind: 'pin',
            scene: 'overworld',
            point: { x: 500, y: 550 },
            radius: 48,
          },
          scene: 'overworld',
          status: 'guiding',
          path: [],
          distance: 100,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select Meet here pin' }));
    expect(screen.getByRole('button', { name: 'Stop navigation' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Edit pin' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit pin' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Edit pin' })).getByRole('button', {
        name: 'Remove pin',
      }),
    );
    expect(stop).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem('dmap.atlas.pins.v1/test')!)).toEqual([]);
  });

  it('shows a failed route inline and supports keyboard place selection', () => {
    render(
      <RpgAtlasDialog
        sample={sample}
        town={town}
        name="Town"
        scope="test"
        position={sample.spawn}
        onClose={vi.fn()}
        onNavigate={() => ({ ok: false, message: 'The gate is closed.' })}
      />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Select Library' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Navigate to' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The gate is closed.');
  });
});
