import { describe, expect, it } from 'vitest';

import { AVATAR_IDS } from '../../../src/domain/avatar/identity';
import { createRoomWorld } from '../../../src/features/world/engine/room-world';
import { KENNEY_TINY_TOWN_THEME } from '../../../src/features/world/engine/themes';
import type { WorldPortal } from '../../../src/features/world/engine/types';

const textPortal: WorldPortal = {
  x: 240,
  y: 240,
  key: 'room-general',
  areaKey: 'community',
  areaLabel: 'Community',
  room: {
    key: 'general',
    label: 'general',
    type: 'text',
    order: 0,
  },
  accent: '#9284f7',
  destination: 'room',
};

describe('Kenney shipping theme', () => {
  it('provides one CC0 Tiny Dungeon avatar sheet for every stable avatar id', () => {
    expect(KENNEY_TINY_TOWN_THEME.avatar?.variants.map(({ id }) => id)).toEqual(AVATAR_IDS);
    expect(KENNEY_TINY_TOWN_THEME.avatar?.layers).toHaveLength(AVATAR_IDS.length);
    expect(KENNEY_TINY_TOWN_THEME.avatar?.renderSize).toBe(48);
  });

  it('provides a compact Tiny Dungeon interior atlas in every environment', () => {
    expect(KENNEY_TINY_TOWN_THEME.interiorAtlas?.url).toBe('/game-assets/tiny-dungeon/tiles.png');
    expect(KENNEY_TINY_TOWN_THEME.interiorAtlas?.renderScale).toBe(2);
    expect(Object.keys(KENNEY_TINY_TOWN_THEME.interiorAtlas?.sprites ?? {})).toEqual(
      expect.arrayContaining(['chair', 'table', 'bookshelf', 'rug', 'curtain']),
    );
    expect(KENNEY_TINY_TOWN_THEME.interiorAtlas?.sprites).toMatchObject({
      art: { x: 128, y: 64, width: 16, height: 16 },
      blueRug: { x: 144, y: 64, width: 16, height: 16 },
      rug: { x: 0, y: 0, width: 16, height: 16 },
      sofa: { x: 128, y: 96, width: 16, height: 16 },
      table: { x: 0, y: 96, width: 16, height: 16 },
      window: { x: 80, y: 48, width: 16, height: 16 },
    });
  });

  it('builds compact room furniture on a shell aligned to the collision grid', () => {
    const world = createRoomWorld(textPortal, KENNEY_TINY_TOWN_THEME);

    expect(world.interiorStyle).toMatchObject({
      tileScale: 2,
      borderSize: 16,
      wallHeight: 48,
    });
    expect(
      world.props.some(
        ({ kind, width, height }) => kind === 'rug' && width === 96 && height === 64,
      ),
    ).toBe(true);
    expect(world.props.find(({ kind }) => kind === 'rug')?.tint).toBe('#d6a15f');
    expect(
      Math.max(...world.props.map(({ width, height }) => Math.max(width, height))),
    ).toBeLessThanOrEqual(96);
  });
});
