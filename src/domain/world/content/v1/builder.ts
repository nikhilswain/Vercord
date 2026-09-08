import type { Point, Rect } from './types';
import type { RpgSample, RpgStamp, RpgThemeId } from './types';
import { RPG_TEXTURES } from './assets';

export const TILE = 32;
export const COLS = 46;
export const ROWS = 34;
export type TilePoint = readonly [number, number];
export type TileArea = readonly [number, number, number, number];
const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});
export const at = (x: number, y: number): Point => ({ x: x * TILE, y: y * TILE });
export const cell = (x: number, y: number) => `${x},${y}`;

/** Paint an authoring mask shared by the pinned prefabs and initial world generation. */
export function paint(mask: Set<string>, x: number, y: number, width: number, height: number) {
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) mask.add(cell(col, row));
  }
}

export function makeSample(
  id: RpgThemeId,
  name: string,
  subtitle: string,
  spawn: Point,
): RpgSample {
  return {
    id,
    name,
    subtitle,
    bounds: rect(0, 0, COLS * TILE, ROWS * TILE),
    spawn,
    textures: RPG_TEXTURES,
    stamps: [],
    colliders: [],
    npcs: [],
    landmarks: [],
    lights: [],
    background: id === 'village' ? '#4b8035' : '#171723',
  };
}

export function ground(
  sample: RpgSample,
  texture: string,
  frame: number | string,
  x: number,
  y: number,
  depth = -100,
  alpha = 1,
) {
  sample.stamps.push({ texture, frame, ...at(x, y), depth, alpha });
}

export function object(
  sample: RpgSample,
  texture: string,
  frame: RpgStamp['frame'],
  x: number,
  y: number,
  footY: number,
) {
  sample.stamps.push({ texture, frame, ...at(x, y), depth: footY * TILE });
}

export function block(sample: RpgSample, x: number, y: number, width: number, height: number) {
  sample.colliders.push(rect(x * TILE, y * TILE, width * TILE, height * TILE));
}

/** Place a sign by its feet; art, depth, collision and reading point share that anchor. */
export function signpost(sample: RpgSample, x: number, y: number): Point {
  const base = at(x, y);
  // The 32×40 sprite's post meets the ground at (16, 38).
  sample.stamps.push({
    texture: 'rpg-signpost',
    x: base.x - 16,
    y: base.y - 38,
    depth: base.y,
  });
  sample.colliders.push(rect(base.x - 5, base.y - 6, 10, 6));
  // Read from in front of the post, outside its solid base and line-of-sight checks.
  return { x: base.x, y: base.y + 20 };
}
