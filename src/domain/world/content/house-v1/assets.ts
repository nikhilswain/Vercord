import type { RpgTexture } from '../v1/types';

/** Original vector art; keep these frame meanings pinned for saved house-v1 rooms. */
export const HOUSE_TEXTURE: RpgTexture = {
  key: 'house-v1-furniture',
  url: '/game-assets/house-v1/furniture.svg',
  frames: {
    floor: { x: 0, y: 0, width: 32, height: 32 },
    wall: { x: 32, y: 0, width: 32, height: 64 },
    window: { x: 128, y: 0, width: 64, height: 64 },
    rug: { x: 0, y: 96, width: 128, height: 96 },
    table: { x: 128, y: 96, width: 96, height: 64 },
    chair: { x: 224, y: 96, width: 32, height: 48 },
    shelf: { x: 256, y: 0, width: 96, height: 80 },
    hearth: { x: 352, y: 0, width: 96, height: 96 },
    sofa: { x: 256, y: 96, width: 64, height: 64 },
    plant: { x: 320, y: 96, width: 32, height: 48 },
    counter: { x: 352, y: 128, width: 128, height: 64 },
    threshold: { x: 0, y: 208, width: 96, height: 32 },
  },
};
export const HOUSE_FRAMES = Object.keys(HOUSE_TEXTURE.frames!) as Array<
  | 'floor'
  | 'wall'
  | 'window'
  | 'rug'
  | 'table'
  | 'chair'
  | 'shelf'
  | 'hearth'
  | 'sofa'
  | 'plant'
  | 'counter'
  | 'threshold'
>;
