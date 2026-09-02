import type { WorldTheme } from './types';

const LOCAL_GAME_ASSETS_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_GAME_ASSETS === 'true';

export const KENNEY_TINY_TOWN_THEME: WorldTheme = {
  id: 'kenney-tiny-town',
  name: 'Tiny Town Commons',
  atlasUrl: '/game-assets/tiny-town/tiles.png',
  sourceTileSize: 16,
  sheetColumns: 12,
  worldTileSize: 48,
  avatar: LOCAL_GAME_ASSETS_ENABLED
    ? {
        layers: [
          ...['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((version) => ({
            id: `base-${version}`,
            url: `/game-assets/mana-seed/avatars/base/v${version}.png`,
          })),
          ...['fstr_v01', 'fstr_v02', 'fstr_v03', 'fstr_v04', 'fstr_v05'].map((variant) => ({
            id: `outfit-${variant}`,
            url: `/game-assets/mana-seed/avatars/outfit/${variant}.png`,
          })),
          ...['pfpn_v01', 'pfpn_v02', 'pfpn_v03', 'pfpn_v04', 'pfpn_v05'].map((variant) => ({
            id: `outfit-${variant}`,
            url: `/game-assets/mana-seed/avatars/outfit/${variant}.png`,
          })),
          ...[
            'bob1_v00',
            'bob1_v03',
            'bob1_v05',
            'bob1_v08',
            'bob1_v11',
            'dap1_v01',
            'dap1_v03',
            'dap1_v05',
            'dap1_v07',
            'dap1_v09',
            'dap1_v11',
            'dap1_v13',
          ].map((variant) => ({
            id: `hair-${variant}`,
            url: `/game-assets/mana-seed/avatars/hair/${variant}.png`,
          })),
        ],
        variants: [
          {
            id: 'avatar-01',
            layerIds: ['base-00', 'outfit-fstr_v01', 'hair-bob1_v00'],
          },
          {
            id: 'avatar-02',
            layerIds: ['base-01', 'outfit-fstr_v02', 'hair-bob1_v03'],
          },
          {
            id: 'avatar-03',
            layerIds: ['base-02', 'outfit-fstr_v03', 'hair-bob1_v05'],
          },
          {
            id: 'avatar-04',
            layerIds: ['base-03', 'outfit-fstr_v04', 'hair-bob1_v08'],
          },
          {
            id: 'avatar-05',
            layerIds: ['base-04', 'outfit-fstr_v05', 'hair-bob1_v11'],
          },
          {
            id: 'avatar-06',
            layerIds: ['base-05', 'outfit-pfpn_v01', 'hair-dap1_v01'],
          },
          {
            id: 'avatar-07',
            layerIds: ['base-06', 'outfit-pfpn_v02', 'hair-dap1_v03'],
          },
          {
            id: 'avatar-08',
            layerIds: ['base-07', 'outfit-pfpn_v03', 'hair-dap1_v05'],
          },
          {
            id: 'avatar-09',
            layerIds: ['base-08', 'outfit-pfpn_v04', 'hair-dap1_v07'],
          },
          {
            id: 'avatar-10',
            layerIds: ['base-09', 'outfit-pfpn_v05', 'hair-dap1_v09'],
          },
          {
            id: 'avatar-11',
            layerIds: ['base-10', 'outfit-fstr_v01', 'hair-dap1_v11'],
          },
          {
            id: 'avatar-12',
            layerIds: ['base-01', 'outfit-fstr_v05', 'hair-dap1_v13'],
          },
        ],
        defaultVariantId: 'avatar-02',
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
      }
    : undefined,
  interiorAtlas: LOCAL_GAME_ASSETS_ENABLED
    ? {
        url: '/game-assets/pixel-lands/interiors.png',
        sprites: {
          armchair: { x: 128, y: 0, width: 32, height: 32 },
          art: { x: 240, y: 144, width: 16, height: 16 },
          blueRug: { x: 80, y: 48, width: 32, height: 32 },
          bookshelf: { x: 160, y: 128, width: 32, height: 48 },
          chair: { x: 112, y: 48, width: 16, height: 32 },
          curtain: { x: 192, y: 96, width: 32, height: 32 },
          desk: { x: 192, y: 128, width: 48, height: 32 },
          planter: { x: 224, y: 96, width: 16, height: 32 },
          rug: { x: 80, y: 80, width: 48, height: 48 },
          sofa: { x: 0, y: 128, width: 48, height: 32 },
          table: { x: 192, y: 128, width: 48, height: 32 },
          window: { x: 104, y: 8, width: 16, height: 16 },
        },
      }
    : undefined,
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
