import type { RpgTexture } from './types';

/** Unmodified LPC sheets; frames are composed at native pixel size in the world. */
export const TOWN_HALL_TEXTURES: RpgTexture[] = [
  {
    key: 'town-hall-timber',
    url: '/game-assets/town-hall/cottage.png',
    frames: {
      wall: { x: 0, y: 0, width: 96, height: 128 },
      footing: { x: 0, y: 480, width: 96, height: 32 },
    },
  },
  {
    key: 'town-hall-thatch',
    url: '/game-assets/town-hall/thatched-roof.png',
    frames: { roof: { x: 88, y: 0, width: 120, height: 112 } },
  },
  {
    key: 'town-hall-details',
    url: '/game-assets/town-hall/decorations-medieval.png',
    frames: {
      porch: { x: 360, y: 352, width: 56, height: 96 },
      board: { x: 192, y: 160, width: 32, height: 64 },
      lantern: { x: 416, y: 64, width: 32, height: 32 },
      banner: { x: 64, y: 1216, width: 32, height: 80 },
    },
  },
];
