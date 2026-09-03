import { AVATAR_IDS } from '../../../domain/avatar/identity';
import type { Rect, WorldTheme } from './types';

const DUNGEON_COLUMNS = 12;
const DUNGEON_TILE_SIZE = 16;

function dungeonTile(index: number): Rect {
  return {
    x: (index % DUNGEON_COLUMNS) * DUNGEON_TILE_SIZE,
    y: Math.floor(index / DUNGEON_COLUMNS) * DUNGEON_TILE_SIZE,
    width: DUNGEON_TILE_SIZE,
    height: DUNGEON_TILE_SIZE,
  };
}

export const KENNEY_TINY_TOWN_THEME: WorldTheme = {
  id: 'kenney-tiny-town',
  name: 'Tiny Town Commons',
  atlasUrl: '/game-assets/tiny-town/tiles.png',
  sourceTileSize: 16,
  sheetColumns: 12,
  worldTileSize: 48,
  avatar: {
    layers: AVATAR_IDS.map((id) => ({
      id: `tiny-character-${id}`,
      url: `/game-assets/tiny-characters/avatars/${id}.png`,
    })),
    variants: AVATAR_IDS.map((id) => ({
      id,
      layerIds: [`tiny-character-${id}`],
    })),
    defaultVariantId: 'avatar-02',
    frameWidth: 16,
    frameHeight: 17,
    directionColumns: {
      down: 0,
      up: 2,
      left: 3,
      right: 1,
    },
    idleFrameRow: 0,
    walkFrameRows: [0, 1, 0, 2],
    flipX: {
      down: false,
      up: false,
      left: false,
      right: false,
    },
    renderSize: 48,
    animationMs: 120,
    collider: {
      width: 18,
      height: 20,
      offsetX: -9,
      offsetY: -18,
    },
  },
  interiorAtlas: {
    url: '/game-assets/tiny-dungeon/tiles.png',
    renderScale: 2,
    sprites: {
      armchair: dungeonTile(73),
      art: dungeonTile(56),
      blueRug: dungeonTile(57),
      bookshelf: dungeonTile(75),
      chair: dungeonTile(73),
      curtain: dungeonTile(29),
      desk: dungeonTile(90),
      planter: dungeonTile(32),
      rug: dungeonTile(0),
      sofa: dungeonTile(80),
      table: dungeonTile(72),
      window: dungeonTile(41),
    },
  },
  exterior: {
    buildings: [
      {
        id: 'blue-roof-cottage',
        doorColumn: 1,
        tiles: [
          [48, 49, 50],
          [60, 63, 62],
          [72, 73, 75],
          [72, 85, 75],
        ],
      },
      {
        id: 'orange-roof-cottage',
        doorColumn: 1,
        tiles: [
          [52, 53, 54],
          [64, 67, 66],
          [76, 77, 79],
          [76, 89, 79],
        ],
      },
      {
        id: 'blue-roof-workshop',
        doorColumn: 2,
        tiles: [
          [48, 49, 49, 50],
          [60, 61, 63, 62],
          [72, 73, 73, 75],
          [72, 84, 85, 75],
        ],
      },
      {
        id: 'orange-roof-hall',
        doorColumn: 2,
        tiles: [
          [52, 53, 53, 54],
          [64, 65, 67, 66],
          [76, 77, 77, 79],
          [76, 88, 89, 79],
        ],
      },
      {
        id: 'slate-roof-stone-house',
        doorColumn: 1,
        tiles: [
          [48, 49, 50],
          [60, 63, 62],
          [76, 77, 79],
          [76, 89, 79],
        ],
      },
      {
        id: 'terracotta-roof-townhouse',
        doorColumn: 2,
        tiles: [
          [52, 53, 53, 54],
          [64, 65, 67, 66],
          [72, 73, 73, 75],
          [72, 84, 85, 75],
        ],
      },
    ],
  },
  tiles: {
    ground: 0,
    path: 25,
    plaza: 1,
    player: {
      right: 0,
      down: 0,
      up: 0,
      left: 0,
    },
  },
};
