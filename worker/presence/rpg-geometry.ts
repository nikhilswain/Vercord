import type { WorldScene } from '../../src/domain/world/document';
import type { Point, Rect } from '../../src/domain/world/content/v1/types';
import {
  containsRect,
  footprint,
  overlaps,
  WORLD_PLAYER_FEET,
} from '../../src/domain/world/geometry';

/** Test the feet origin against an obstacle expanded by the rig's solid feet. */
function crosses(first: Point, second: Point, obstacle: Rect): boolean {
  const epsilon = 0.00001;
  const box = {
    x: obstacle.x - WORLD_PLAYER_FEET.offsetX - WORLD_PLAYER_FEET.width + epsilon,
    y: obstacle.y - WORLD_PLAYER_FEET.offsetY - WORLD_PLAYER_FEET.height + epsilon,
    width: obstacle.width + WORLD_PLAYER_FEET.width - 2 * epsilon,
    height: obstacle.height + WORLD_PLAYER_FEET.height - 2 * epsilon,
  };
  let low = 0;
  let high = 1;
  for (const axis of ['x', 'y'] as const) {
    const delta = second[axis] - first[axis];
    const min = box[axis];
    const max = min + (axis === 'x' ? box.width : box.height);
    if (Math.abs(delta) < epsilon) {
      if (first[axis] < min || first[axis] > max) return false;
      continue;
    }
    const a = (min - first[axis]) / delta;
    const b = (max - first[axis]) / delta;
    low = Math.max(low, Math.min(a, b));
    high = Math.min(high, Math.max(a, b));
    if (low > high) return false;
  }
  return true;
}

const CELL = 256;

/** Index once on admission; movement only examines nearby walls and NPC feet. */
export class RpgCollisionMap {
  private readonly cells = new Map<string, Rect[]>();

  public constructor(public readonly scene: WorldScene) {
    for (const box of [...scene.colliders, ...scene.npcs.map(footprint)]) {
      for (let x = Math.floor(box.x / CELL); x <= Math.floor((box.x + box.width) / CELL); x++) {
        for (let y = Math.floor(box.y / CELL); y <= Math.floor((box.y + box.height) / CELL); y++) {
          const key = `${x}:${y}`;
          const entries = this.cells.get(key) ?? [];
          entries.push(box);
          this.cells.set(key, entries);
        }
      }
    }
  }

  public safe(point: Point): boolean {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const feet = footprint(point);
    return (
      containsRect(this.scene.bounds, feet) && !this.nearby(feet).some((box) => overlaps(feet, box))
    );
  }

  public sweptClear(first: Point, second: Point): boolean {
    const from = footprint(first);
    const to = footprint(second);
    const swept = {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x) + from.width,
      height: Math.abs(to.y - from.y) + from.height,
    };
    return !this.nearby(swept).some((box) => crosses(first, second, box));
  }

  private nearby(box: Rect): Rect[] {
    const result = new Set<Rect>();
    for (let x = Math.floor(box.x / CELL); x <= Math.floor((box.x + box.width) / CELL); x++)
      for (let y = Math.floor(box.y / CELL); y <= Math.floor((box.y + box.height) / CELL); y++)
        for (const entry of this.cells.get(`${x}:${y}`) ?? []) result.add(entry);
    return [...result];
  }
}
