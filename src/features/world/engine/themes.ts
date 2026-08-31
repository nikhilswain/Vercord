import type { WorldTheme } from './types';

export const KENNEY_URBAN_THEME: WorldTheme = {
  id: 'kenney-urban',
  name: 'Urban Commons',
  atlasUrl: '/game-assets/kenney-urban/tiles.png',
  sourceTileSize: 16,
  sheetColumns: 27,
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
      bookshelf: { x: 160, y: 112, width: 32, height: 64 },
      desk: { x: 192, y: 128, width: 48, height: 32 },
      planter: { x: 240, y: 80, width: 16, height: 48 },
      screen: { x: 64, y: 48, width: 32, height: 32 },
      sofa: { x: 0, y: 128, width: 48, height: 32 },
      table: { x: 64, y: 80, width: 48, height: 48 },
    },
  },
  tiles: {
    ground: 28,
    path: 8,
    roof: 21,
    tree: 178,
    player: {
      right: 23,
      down: 24,
      up: 25,
      left: 26,
    },
  },
};
