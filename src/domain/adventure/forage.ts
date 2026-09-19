import type { ItemId } from './inventory';
export type ForageKind = 'healing' | 'collection' | 'mushroom' | 'emberleaf' | 'rivercress';
export const FORAGE_ITEMS: Record<ForageKind, ItemId> = {
  healing: 'healing-herb',
  collection: 'moonblossom',
  mushroom: 'forest-mushroom',
  emberleaf: 'emberleaf',
  rivercress: 'rivercress',
};
