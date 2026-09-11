/** Game-ready composites of Tiago Patrício's free V1.0 sample. */
export type TiagoDemoAppearanceId = 'demo-tiago-charcoal' | 'demo-tiago-moss' | 'demo-tiago-rust';

export type TiagoDemoDirection = 'up' | 'left' | 'down' | 'right';

export type TiagoDemoAnimation = {
  readonly frameRate: number;
  readonly frames: Readonly<Record<TiagoDemoDirection, readonly number[]>>;
};

export type TiagoDemoCharacter = {
  readonly id: TiagoDemoAppearanceId;
  readonly name: string;
  readonly description: string;
  readonly textureKey: string;
  readonly atlasUrl: string;
  readonly previewUrl: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly feet: { readonly x: number; readonly y: number };
  /** Uniform scale: the 64px silhouette becomes 51.2px high alongside tall LPC. */
  readonly scale: number;
  readonly previewFrame: number;
  readonly animations: {
    readonly idle: TiagoDemoAnimation;
    readonly walk: TiagoDemoAnimation;
  };
};

export const TIAGO_DEMO_ANIMATIONS = {
  idle: {
    frameRate: 2,
    frames: { up: [0, 1], left: [4, 5], down: [8, 9], right: [12, 13] },
  },
  walk: {
    frameRate: 8,
    frames: {
      up: [16, 17, 18, 19],
      left: [20, 21, 22, 23],
      down: [24, 25, 26, 27],
      right: [28, 29, 30, 31],
    },
  },
} as const satisfies TiagoDemoCharacter['animations'];

const character = (
  id: TiagoDemoAppearanceId,
  name: string,
  description: string,
): TiagoDemoCharacter => ({
  id,
  name,
  description,
  textureKey: id,
  atlasUrl: `/game-assets/tiago-demo/${id}.png`,
  previewUrl: `/game-assets/tiago-demo/${id}-preview.png`,
  frameWidth: 32,
  frameHeight: 64,
  atlasWidth: 128,
  atlasHeight: 512,
  feet: { x: 16, y: 64 },
  scale: 0.8,
  previewFrame: 8,
  animations: TIAGO_DEMO_ANIMATIONS,
});

export const TIAGO_DEMO_CHARACTERS: readonly TiagoDemoCharacter[] = [
  character(
    'demo-tiago-charcoal',
    'Tiago · Charcoal',
    'Original charcoal outfit, brown hair, and warm skin.',
  ),
  character(
    'demo-tiago-moss',
    'Tiago · Moss',
    'Moss shirt, dark trousers, brown hair, beard, and deep skin.',
  ),
  character(
    'demo-tiago-rust',
    'Tiago · Rust',
    'Rust shirt, slate trousers, brown hair, and light skin.',
  ),
];

export function getTiagoDemoCharacter(id: string): TiagoDemoCharacter | undefined {
  return TIAGO_DEMO_CHARACTERS.find((entry) => entry.id === id);
}

export function isTiagoDemoAppearance(id: string): id is TiagoDemoAppearanceId {
  return getTiagoDemoCharacter(id) !== undefined;
}
