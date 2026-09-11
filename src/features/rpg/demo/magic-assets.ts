import { JUNGLE_WILDLIFE_ASSETS, type JungleWildlifeAsset } from './wildlife-assets';

export type MagicEffectId =
  | 'fire-bolt'
  | 'water-bolt'
  | 'fire-cast'
  | 'water-cast'
  | 'fire-impact'
  | 'water-impact'
  | 'fire-death'
  | 'water-death'
  | 'poison-death'
  | 'spike-trap';

export interface MagicEffectAsset {
  id: MagicEffectId;
  textureKey: string;
  imageUrl: string;
  sourceUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  /** Real frames only; transparent atlas padding is excluded. */
  frameCount: number;
  /** Frame indices in chronological order. */
  frames: readonly number[];
  /** Duration of one complete animation, in milliseconds. */
  durationMs: number;
  loop: boolean;
  origin: Readonly<{ x: number; y: number }>;
  suggestedScale: number;
  impactAtMs?: number;
  animationNotes: readonly string[];
}

export type MagicCreatureAsset = Omit<JungleWildlifeAsset, 'id'> & {
  id: 'forest-guardian' | 'green-slime';
};

const craftpixLicense = '/game-assets/magic-demo/LICENSE-CraftPix.txt';
const craftpixAuthor = 'CraftPix / Free Game Assets (GUI, Sprite, Tilesets)';
const sourceUrls = {
  spells: 'https://craftpix.net/freebies/free-water-and-fire-magic-sprite-vector-pack/',
  traps: 'https://craftpix.net/freebies/free-magic-and-traps-top-down-pixel-art-asset/',
  explosions: 'https://craftpix.net/freebies/free-animated-explosion-sprite-pack/',
  pixelExplosions: 'https://craftpix.net/freebies/11-free-pixel-art-explosion-sprites/',
} as const;

function effect(
  id: MagicEffectId,
  source: keyof typeof sourceUrls,
  size: readonly [number, number],
  count: number,
  durationMs: number,
  options: Partial<
    Pick<MagicEffectAsset, 'loop' | 'origin' | 'suggestedScale' | 'impactAtMs'>
  > = {},
  animationNotes: readonly string[] = [],
): MagicEffectAsset {
  return {
    id,
    textureKey: `magic-demo-${id}`,
    imageUrl: `/game-assets/magic-demo/${id}.png`,
    sourceUrl: sourceUrls[source],
    author: craftpixAuthor,
    license: 'CraftPix Freebie Products License (game use)',
    licenseUrl: craftpixLicense,
    frameWidth: size[0],
    frameHeight: size[1],
    columns: Math.min(8, count),
    frameCount: count,
    frames: Array.from({ length: count }, (_, index) => index),
    durationMs,
    loop: false,
    origin: { x: 0.5, y: 0.5 },
    suggestedScale: 1,
    ...options,
    animationNotes,
  };
}

const boltNotes = [
  'Eight actual source spell frames, sampled at 64x36 with nearest filtering and crisp alpha edges.',
  'Prepared projectile points right: rotation 0 = east, PI/2 = south; origin follows the projectile head.',
] as const;
const deathNotes = [
  'Ten native pixel explosion frames in numeric order, reduced from 256x256 to 128x128 using nearest sampling.',
  'Visible peak diameter is approximately 90px; play once and return the sprite to its pool.',
] as const;

/** Fixed atlas frames: create textures/animations once, reuse pooled sprites at runtime. */
export const MAGIC_EFFECT_ASSETS: Readonly<Record<MagicEffectId, MagicEffectAsset>> = {
  'fire-bolt': effect(
    'fire-bolt',
    'spells',
    [64, 36],
    8,
    400,
    {
      loop: true,
      origin: { x: 0.72, y: 0.5 },
    },
    boltNotes,
  ),
  'water-bolt': effect(
    'water-bolt',
    'spells',
    [64, 36],
    8,
    400,
    {
      loop: true,
      origin: { x: 0.72, y: 0.5 },
    },
    boltNotes,
  ),
  'fire-cast': effect('fire-cast', 'spells', [32, 32], 8, 360, {}, [
    'Eight native fire-orb frames sampled at 32x32; suitable at the casting hand during windup.',
  ]),
  'water-cast': effect('water-cast', 'spells', [32, 32], 12, 360, {}, [
    'Twelve native water-orb frames sampled at 32x32; last atlas row has four unused cells.',
  ]),
  'fire-impact': effect('fire-impact', 'traps', [48, 48], 8, 480, {}, [
    'Native eight-frame barrel burst: bright impact, smoke ring, and dissipating embers.',
  ]),
  'water-impact': effect('water-impact', 'explosions', [48, 48], 4, 240, {}, [
    'Four native blue splash frames from Explosion_7/4, sampled from 150x150 PNG exports.',
  ]),
  'fire-death': effect('fire-death', 'pixelExplosions', [128, 128], 10, 650, {}, deathNotes),
  'water-death': effect('water-death', 'pixelExplosions', [128, 128], 10, 650, {}, deathNotes),
  'poison-death': effect('poison-death', 'pixelExplosions', [128, 128], 10, 650, {}, deathNotes),
  'spike-trap': effect(
    'spike-trap',
    'traps',
    [32, 32],
    6,
    720,
    {
      suggestedScale: 2,
      impactAtMs: 240,
    },
    ['Six native frames show stakes rising, holding, and retracting.'],
  ),
};

export const FOREST_GUARDIAN_ASSET: Readonly<MagicCreatureAsset> = {
  id: 'forest-guardian',
  textureKey: 'magic-demo-forest-guardian',
  imageUrl: '/game-assets/magic-demo/forest-guardian.png',
  sourceUrl: 'https://craftpix.net/freebies/free-forest-bosses-pixel-art-sprite-sheet-pack/',
  author: craftpixAuthor,
  license: 'CraftPix Freebie Products License (game use)',
  licenseUrl: craftpixLicense,
  frameWidth: 128,
  frameHeight: 96,
  columns: 8,
  frameCount: 52,
  feet: { x: 64, y: 96 },
  origin: { x: 0.5, y: 1 },
  suggestedScale: 2,
  animations: {
    idle: {
      durationMs: 800,
      loop: true,
      frames: { left: [0, 1, 2, 3], right: [4, 5, 6, 7], down: [4, 5, 6, 7], up: [4, 5, 6, 7] },
    },
    walk: {
      durationMs: 600,
      loop: true,
      frames: {
        left: [8, 9, 10, 11, 12, 13],
        right: [14, 15, 16, 17, 18, 19],
        down: [14, 15, 16, 17, 18, 19],
        up: [14, 15, 16, 17, 18, 19],
      },
    },
    attack: {
      durationMs: 720,
      impactAtMs: 360,
      loop: false,
      frames: {
        left: [20, 21, 22, 23, 24, 25],
        right: [26, 27, 28, 29, 30, 31],
        down: [26, 27, 28, 29, 30, 31],
        up: [26, 27, 28, 29, 30, 31],
      },
    },
    hurt: {
      durationMs: 240,
      loop: false,
      frames: {
        left: [32, 33, 34, 35],
        right: [36, 37, 38, 39],
        down: [36, 37, 38, 39],
        up: [36, 37, 38, 39],
      },
    },
    death: {
      durationMs: 780,
      loop: false,
      frames: {
        left: [40, 41, 42, 43, 44, 45],
        right: [46, 47, 48, 49, 50, 51],
        down: [46, 47, 48, 49, 50, 51],
        up: [46, 47, 48, 49, 50, 51],
      },
    },
  },
  animationNotes: [
    'Animated two-headed flower from the same author’s free forest bosses pack.',
    'Source faces left. Right frames are exact horizontal mirrors; up/down reuse the right side view.',
    'Native 96x96 cells padded to 128x96 around a shared foot anchor, retaining the full attack reach.',
    '52 animation frames; the final four atlas cells are transparent padding and must not be animated.',
  ],
};

export const GREEN_SLIME_ASSET: Readonly<MagicCreatureAsset> = {
  ...JUNGLE_WILDLIFE_ASSETS.slime,
  id: 'green-slime',
  textureKey: 'magic-demo-green-slime',
  imageUrl: '/game-assets/magic-demo/green-slime.png',
  animationNotes: [
    ...JUNGLE_WILDLIFE_ASSETS.slime.animationNotes,
    'Five blue shades are replaced by a green palette in the atlas; pale highlights and red mouth remain distinct.',
  ],
};
