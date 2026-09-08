import type { Rect } from './types';
import type { RpgSample, RpgTexture } from './types';
import { at } from './builder';

interface Prefab {
  width: number;
  height: number;
  base: Rect;
}

/** Original artwork baselines also define solid bases; roof overhangs never collide. */
const PREFABS = {
  longhouse: { width: 256, height: 192, base: { x: 16, y: 120, width: 224, height: 60 } },
  cottage: { width: 160, height: 160, base: { x: 12, y: 100, width: 136, height: 48 } },
  smithy: { width: 192, height: 160, base: { x: 16, y: 96, width: 160, height: 52 } },
  runestone: { width: 48, height: 72, base: { x: 11, y: 58, width: 30, height: 8 } },
  hearth: { width: 64, height: 48, base: { x: 9, y: 27, width: 48, height: 15 } },
  banner: { width: 32, height: 96, base: { x: 15, y: 84, width: 8, height: 7 } },
  supplies: { width: 64, height: 48, base: { x: 4, y: 30, width: 55, height: 12 } },
} as const satisfies Record<string, Prefab>;

export const NORSE_TEXTURES: RpgTexture[] = [
  ...Object.keys(PREFABS).map((name) => ({
    key: `norse-${name}`,
    url: `/game-assets/norse/${name}.svg`,
  })),
  { key: 'norse-longboat', url: '/game-assets/norse/longboat.svg' },
  { key: 'norse-terrain', url: '/game-assets/norse/terrain.svg', frameWidth: 32, frameHeight: 32 },
];

export function norseProp(sample: RpgSample, name: keyof typeof PREFABS, x: number, y: number) {
  const origin = at(x, y);
  const { width, height, base } = PREFABS[name];
  const depth = origin.y + base.y + base.height;
  sample.stamps.push({ texture: `norse-${name}`, ...origin, width, height, depth });
  sample.colliders.push({ ...base, x: origin.x + base.x, y: origin.y + base.y });
  return { x: origin.x + width / 2, y: depth + 24 };
}
