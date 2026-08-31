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
      left: 6,
      right: 7,
    },
    idleRows: {
      down: 0,
      up: 1,
      left: 2,
      right: 3,
    },
    renderSize: 64,
    animationMs: 110,
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
