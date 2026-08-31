import type { WorldTheme } from './types';

export const KENNEY_URBAN_THEME: WorldTheme = {
  id: 'kenney-urban',
  name: 'Urban Commons',
  atlasUrl: '/game-assets/kenney-urban/tiles.png',
  sourceTileSize: 16,
  sheetColumns: 27,
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
