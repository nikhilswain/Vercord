import type { RpgDirection } from '../types';

export type JungleWildlifeId = 'bear' | 'snake' | 'slime';
export type JungleWildlifeAction = 'idle' | 'walk' | 'attack' | 'hurt' | 'death';

export interface JungleWildlifeAnimation {
  /** Duration of one complete animation cycle, in milliseconds. */
  durationMs: number;
  loop: boolean;
  /** Zero-based frame numbers in the prepared, row-major atlas. */
  frames: Readonly<Record<RpgDirection, readonly number[]>>;
  /** Suggested damage timing, measured from the start of the attack. */
  impactAtMs?: number;
  /** Native attack time reached during windup; the attack continues from this pose. */
  windupEndAtMs?: number;
}

export interface JungleWildlifeAsset {
  id: JungleWildlifeId;
  textureKey: string;
  imageUrl: string;
  sourceUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  /** Includes unused transparent cells at the end of short slime rows. */
  frameCount: number;
  feet: Readonly<{ x: number; y: number }>;
  origin: Readonly<{ x: number; y: number }>;
  /** Integer scale recommended beside the roughly 50 px LPC player. */
  suggestedScale: number;
  /** Directions rendered by mirroring their native frame sequence. */
  flipXDirections?: readonly RpgDirection[];
  animations: Readonly<Record<JungleWildlifeAction, JungleWildlifeAnimation>>;
  animationNotes: readonly string[];
}

const electricLemonSource =
  'https://electriclemon.itch.io/animal-wildlife-free-pack-retro-rpg-series';
const electricLemonLicense = '/game-assets/jungle-demo/LICENSE-Electric-Lemon.txt';

/** Only the prepared game atlases are shipped; original archives stay ignored. */
export const JUNGLE_WILDLIFE_ASSETS: Readonly<Record<JungleWildlifeId, JungleWildlifeAsset>> = {
  bear: {
    id: 'bear',
    textureKey: 'jungle-demo-bear',
    imageUrl: '/game-assets/jungle-demo/bear.png',
    sourceUrl: electricLemonSource,
    author: 'Electric Lemon',
    license: 'Electric Lemon Games Public License (game/application use)',
    licenseUrl: electricLemonLicense,
    frameWidth: 32,
    frameHeight: 32,
    columns: 4,
    frameCount: 40,
    feet: { x: 16, y: 26 },
    origin: { x: 0.5, y: 26 / 32 },
    suggestedScale: 2,
    animations: {
      idle: {
        durationMs: 1000,
        loop: true,
        frames: { right: [0], left: [4], down: [8], up: [12] },
      },
      walk: {
        durationMs: 500,
        loop: true,
        frames: {
          right: [0, 1, 2, 3],
          left: [4, 5, 6, 7],
          down: [8, 9, 10, 11],
          up: [12, 13, 14, 15],
        },
      },
      attack: {
        durationMs: 520,
        impactAtMs: 260,
        loop: false,
        frames: {
          right: [16, 17, 18, 19],
          left: [20, 21, 22, 23],
          down: [24, 25, 26, 27],
          up: [28, 29, 30, 31],
        },
      },
      hurt: {
        durationMs: 180,
        loop: false,
        frames: { right: [32], left: [36], down: [32], up: [36] },
      },
      death: {
        durationMs: 600,
        loop: false,
        frames: {
          right: [32, 33, 34, 35],
          left: [36, 37, 38, 39],
          down: [32, 33, 34, 35],
          up: [36, 37, 38, 39],
        },
      },
    },
    animationNotes: [
      'Four native walking and attack directions. Idle holds the first walk frame.',
      'The source has two side-facing death strips. Down uses the right strip; up uses the left strip.',
      'No separate hurt animation is supplied. Hurt reuses the first death/recoil pose.',
      'Regular 24 px frames are padded by 4 px into the 32 px combat frame size.',
    ],
  },
  snake: {
    id: 'snake',
    textureKey: 'jungle-demo-snake',
    imageUrl: '/game-assets/jungle-demo/snake.png',
    sourceUrl: electricLemonSource,
    author: 'Electric Lemon',
    license: 'Electric Lemon Games Public License (game/application use)',
    licenseUrl: electricLemonLicense,
    frameWidth: 24,
    frameHeight: 24,
    columns: 4,
    frameCount: 48,
    feet: { x: 12, y: 18 },
    origin: { x: 0.5, y: 18 / 24 },
    suggestedScale: 2,
    animations: {
      idle: {
        durationMs: 700,
        loop: true,
        frames: {
          right: [0, 1, 2, 3],
          left: [4, 5, 6, 7],
          down: [40],
          up: [44],
        },
      },
      walk: {
        durationMs: 560,
        loop: true,
        frames: {
          right: [8, 9, 10, 11],
          left: [12, 13, 14, 15],
          down: [16, 17, 18, 19],
          up: [20, 21, 22, 23],
        },
      },
      attack: {
        durationMs: 440,
        impactAtMs: 220,
        loop: false,
        frames: {
          right: [32, 33, 34, 35],
          left: [36, 37, 38, 39],
          down: [40, 41, 42, 43],
          up: [44, 45, 46, 47],
        },
      },
      hurt: {
        durationMs: 160,
        loop: false,
        frames: { right: [24], left: [28], down: [24], up: [28] },
      },
      death: {
        durationMs: 480,
        loop: false,
        frames: {
          right: [24, 25, 26, 27],
          left: [28, 29, 30, 31],
          down: [24, 25, 26, 27],
          up: [28, 29, 30, 31],
        },
      },
    },
    animationNotes: [
      'Four native walking and attack directions. Up/down idle holds the matching attack windup pose.',
      'The source has two side-facing death strips. Down uses the right strip; up uses the left strip.',
      'No separate hurt animation is supplied. Hurt reuses the first death/recoil pose.',
      'Regular 16 px frames are padded by 4 px into the 24 px combat frame size.',
    ],
  },
  slime: {
    id: 'slime',
    textureKey: 'jungle-demo-slime',
    imageUrl: '/game-assets/jungle-demo/slime.png',
    sourceUrl: 'https://rvros.itch.io/pixel-art-animated-slime',
    author: 'rvros',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    frameWidth: 32,
    frameHeight: 25,
    columns: 5,
    frameCount: 50,
    feet: { x: 16, y: 25 },
    origin: { x: 0.5, y: 1 },
    suggestedScale: 2,
    animations: {
      idle: {
        durationMs: 640,
        loop: true,
        frames: {
          left: [0, 1, 2, 3],
          right: [25, 26, 27, 28],
          down: [25, 26, 27, 28],
          up: [25, 26, 27, 28],
        },
      },
      walk: {
        durationMs: 480,
        loop: true,
        frames: {
          left: [5, 6, 7, 8],
          right: [30, 31, 32, 33],
          down: [30, 31, 32, 33],
          up: [30, 31, 32, 33],
        },
      },
      attack: {
        durationMs: 550,
        impactAtMs: 220,
        loop: false,
        frames: {
          left: [10, 11, 12, 13, 14],
          right: [35, 36, 37, 38, 39],
          down: [35, 36, 37, 38, 39],
          up: [35, 36, 37, 38, 39],
        },
      },
      hurt: {
        durationMs: 280,
        loop: false,
        frames: {
          left: [15, 16, 17, 18],
          right: [40, 41, 42, 43],
          down: [40, 41, 42, 43],
          up: [40, 41, 42, 43],
        },
      },
      death: {
        durationMs: 500,
        loop: false,
        frames: {
          left: [20, 21, 22, 23],
          right: [45, 46, 47, 48],
          down: [45, 46, 47, 48],
          up: [45, 46, 47, 48],
        },
      },
    },
    animationNotes: [
      'All five actions are native source animations.',
      'Source art faces left. Right-facing frames are exact horizontal mirrors.',
      'The source is side-facing; up/down reuse the right-facing frames.',
      'Atlas rows 0-4 are idle/move/attack/hurt/death; rows 5-9 contain their horizontal mirrors.',
    ],
  },
};
