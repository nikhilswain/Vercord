import type { WorldTheme } from './types';

export const KENNEY_TINY_TOWN_THEME: WorldTheme = {
  id: 'kenney-tiny-town',
  name: 'Tiny Town Commons',
  atlasUrl: '/game-assets/tiny-town/tiles.png',
  sourceTileSize: 16,
  sheetColumns: 12,
  worldTileSize: 48,
  avatar: {
    layerUrls: [
      '/game-assets/mana-seed/base.png',
      '/game-assets/mana-seed/outfit.png',
      '/game-assets/mana-seed/hair.png',
    ],
    frameSize: 64,
    walkFrames: 6,
    walkRows: {
      down: 4,
      up: 5,
      left: 7,
      right: 6,
    },
    idleRows: {
      down: 0,
      up: 1,
      left: 3,
      right: 2,
    },
    renderSize: 64,
    animationMs: 110,
    collider: {
      width: 18,
      height: 26,
      offsetX: -9,
      offsetY: -24,
    },
  },
  interiorAtlas: {
    url: '/game-assets/pixel-lands/interiors.png',
    sprites: {
      bookshelf: { x: 160, y: 128, width: 32, height: 48 },
      chair: { x: 112, y: 48, width: 16, height: 32 },
      desk: { x: 192, y: 128, width: 48, height: 32 },
      planter: { x: 240, y: 96, width: 16, height: 16 },
      rug: { x: 64, y: 80, width: 48, height: 48 },
      screen: { x: 64, y: 48, width: 32, height: 32 },
      sofa: { x: 0, y: 128, width: 48, height: 32 },
      table: { x: 192, y: 128, width: 48, height: 32 },
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
