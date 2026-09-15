import type { Point } from '../../world/engine/types';

export const RITUAL_RELEASE_MS = 1000;
export const RITUAL_TEXTURES = [
  { key: 'ritual-sun', url: '/game-assets/ritual-sigils/sun.svg' },
  { key: 'ritual-moon', url: '/game-assets/ritual-sigils/moon.svg' },
];
export interface RitualSeal extends Point {
  id: string;
  flag: string;
  kind: 'sun' | 'moon';
}
