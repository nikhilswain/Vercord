import type { ItemId } from '../../../domain/adventure/inventory';

export interface ItemArt {
  key: string;
  url: string;
  width: number;
  height: number;
  frame?: number;
  frameWidth?: number;
  frameHeight?: number;
  crop?: { x: number; y: number; size: number };
}
const icon = (file: string): ItemArt => ({
  key: `item:${file}`,
  url: `/game-assets/inventory-icons/${file}.png`,
  width: 32,
  height: 32,
});
const forage = (frame: number): ItemArt => ({
  key: 'item:forage',
  url: '/game-assets/lpc-world/flowers.png',
  width: 352,
  height: 160,
  frameWidth: 32,
  frameHeight: 32,
  frame,
});

/** Inventory and world pickups use the same licensed artwork and sprite frames. */
export const ITEM_ART: Record<ItemId, ItemArt> = {
  'healing-bottle': icon('healing-bottle'),
  'battle-bottle': icon('battle-bottle'),
  'swiftstep-bottle': icon('swiftstep-bottle'),
  thornseed: icon('thornseed'),
  emberleaf: icon('emberleaf'),
  'spark-pollen': icon('spark-pollen'),
  'forest-mushroom': icon('forest-mushroom'),
  rivercress: icon('rivercress'),
  'roasted-meat': icon('roasted-meat'),
  'pan-mushrooms': icon('pan-mushrooms'),
  'mushroom-broth': icon('mushroom-broth'),
  'trail-stew': {
    key: 'item:stew',
    url: '/game-assets/house-v2/cauldron.png',
    width: 32,
    height: 160,
    frameWidth: 32,
    frameHeight: 32,
    frame: 1,
  },
  'hearth-stone': icon('hearth-stone'),
  'healing-herb': icon('healing-herb'),
  moonblossom: forage(8),
  'raw-meat': icon('raw-meat'),
  'raw-fowl': icon('raw-fowl'),
  'wild-hide': icon('wild-hide'),
  feather: icon('feather'),
  'mira-notes': icon('mira-notes'),
  'slime-resin': {
    ...icon('slime-resin'),
    width: 1254,
    height: 1254,
    frame: 0,
    crop: { x: 256, y: 256, size: 800 },
  },
  trailcloth: icon('trailcloth'),
  'resin-wrap': {
    key: 'item:resin-wrap',
    url: '/game-assets/inventory-icons/resin-wrap.png',
    width: 64,
    height: 64,
    frameWidth: 16,
    frameHeight: 16,
    frame: 5,
  },
};
