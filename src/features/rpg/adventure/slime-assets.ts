import type { JungleWildlifeAsset } from '../demo/wildlife-assets';
import type { SlimeVariant } from './types';

/** Body and shadow colors only; the original eyes, cream highlights and outlines stay intact. */
export const SLIME_PALETTES = {
  pink: { body: [255, 184, 186], shadow: [203, 128, 167] },
  green: { body: [162, 221, 142], shadow: [92, 156, 108] },
  blue: { body: [141, 208, 243], shadow: [88, 143, 190] },
} as const satisfies Record<
  SlimeVariant,
  { body: readonly [number, number, number]; shadow: readonly [number, number, number] }
>;

const crawl = {
  down: [0, 1, 2, 3, 4],
  left: [5, 6, 7, 8, 9],
  right: [5, 6, 7, 8, 9],
  up: [10, 11, 12, 13, 14],
};
const held = { down: [0], left: [5], right: [5], up: [10] };

/** The free download contains crawl/idle only. Combat motion is authored in slime-motion.ts. */
export const MOMO_SLIME_ASSET: Readonly<JungleWildlifeAsset> = {
  id: 'slime',
  textureKey: 'momo-mama-free',
  imageUrl: '/game-assets/momo-slime/mm-demo.png',
  sourceUrl: 'https://chiecola.itch.io/momo-mama-slime',
  author: 'chiecola',
  license: 'chiecola asset license (commercial/noncommercial game use)',
  licenseUrl: '/game-assets/momo-slime/CREDITS.md',
  frameWidth: 64,
  frameHeight: 64,
  columns: 5,
  frameCount: 15,
  feet: { x: 32, y: 50 },
  origin: { x: 0.5, y: 50 / 64 },
  suggestedScale: 1,
  flipXDirections: ['right'],
  animations: {
    idle: { durationMs: 900, loop: true, frames: crawl },
    walk: { durationMs: 560, loop: true, frames: crawl },
    attack: { durationMs: 600, impactAtMs: 330, loop: false, frames: held },
    hurt: { durationMs: 180, loop: false, frames: held },
    death: { durationMs: 500, loop: false, frames: held },
  },
  animationNotes: [
    'Unmodified free mm-demo.png: five frames each facing down, left and up. Right mirrors left at runtime.',
    'Original pink design with Dmap green/blue render palettes; all variants share the free frames.',
    'Attack, hurt and defeat hold a free pose with code-driven compression, jump, recoil and collapse.',
    'No paid attack, hurt, death, spin, recolor or Aseprite files are included.',
  ],
};
