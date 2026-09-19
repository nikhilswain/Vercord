import type { Point, Rect } from '../../../domain/world/content/v1/types';
import type { ForestLayout } from '../../../domain/world/forest/layout';
import { containsRect, overlaps } from '../../../domain/world/geometry';
import { SpatialIndex } from '../pathfinding';

export type HabitatKind = 'woodland' | 'verge' | 'open';
export interface HabitatPoint extends Point {
  habitat: HabitatKind;
  sector: number;
}

/** A conservative walkable flood fill prevents encounters inside water or sealed tree pockets.
 * Built once per region, never in the frame loop. Every cell reserves a full 32px walking lane.
 */
export class ForestHabitat {
  readonly points: HabitatPoint[] = [];
  readonly safeAreas: Rect[];
  private readonly collisions: SpatialIndex<Rect>;
  private readonly roads: SpatialIndex<Rect>;
  private readonly reached: Uint8Array;
  private readonly columns: number;

  constructor(readonly layout: ForestLayout) {
    const { scene } = layout,
      { bounds } = scene;
    this.columns = bounds.width / 32;
    const rows = bounds.height / 32;
    this.reached = new Uint8Array(this.columns * rows);
    this.safeAreas = [layout.camp, ...layout.portals].map((p) => ({
      x: p.x - 320,
      y: p.y - 320,
      width: 640,
      height: 640,
    }));
    this.collisions = new SpatialIndex(scene.colliders);
    this.roads = new SpatialIndex(scene.terrain!.roads);
    const blocked = new Uint8Array(this.reached.length);
    for (const box of scene.colliders) {
      const left = Math.max(0, Math.floor(box.x / 32));
      const right = Math.min(this.columns, Math.ceil((box.x + box.width) / 32));
      const top = Math.max(0, Math.floor(box.y / 32));
      const bottom = Math.min(rows, Math.ceil((box.y + box.height) / 32));
      for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++) blocked[y * this.columns + x] = 1;
    }
    const start = Math.floor(scene.spawn.y / 32) * this.columns + Math.floor(scene.spawn.x / 32);
    const queue: number[] = blocked[start] ? [] : [start];
    if (!blocked[start]) this.reached[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]!,
        col = current % this.columns,
        row = Math.floor(current / this.columns);
      for (const next of [
        col > 0 ? current - 1 : -1,
        col + 1 < this.columns ? current + 1 : -1,
        row > 0 ? current - this.columns : -1,
        row + 1 < rows ? current + this.columns : -1,
      ]) {
        if (next < 0 || blocked[next] || this.reached[next]) continue;
        this.reached[next] = 1;
        queue.push(next);
      }
    }
    const trees = new SpatialIndex(
      scene.stamps
        .filter((s) => s.texture === 'lpc-trees')
        .map((s) => ({ x: s.x + 48, y: s.depth!, width: 1, height: 1 })),
    );
    for (const index of queue) {
      const p = {
        x: (index % this.columns) * 32 + 16,
        y: Math.floor(index / this.columns) * 32 + 16,
      };
      if (!this.canPlace(p, 24)) continue;
      const near = { x: p.x - 160, y: p.y - 160, width: 320, height: 320 };
      const woodland =
        !this.onRoad(p) &&
        trees.query(near).some((t) => p.y > t.y + 12 && Math.hypot(p.x - t.x, p.y - t.y) < 165);
      this.points.push({
        ...p,
        habitat: woodland
          ? 'woodland'
          : this.roads.query(near).some((r) => overlaps(r, near))
            ? 'verge'
            : 'open',
        sector:
          Math.min(3, Math.floor(p.x / (bounds.width / 4))) +
          Math.min(3, Math.floor(p.y / (bounds.height / 4))) * 4,
      });
    }
  }

  onRoad(p: Point, fully = false, radius = 24): boolean {
    const box = { x: p.x - radius, y: p.y - radius, width: radius * 2, height: radius * 2 };
    return this.roads.query(box).some((r) => (fully ? containsRect(r, box) : overlaps(r, box)));
  }

  /** Keep hunting patches within a short woodland approach to the navigation network. */
  nearTrail(p: Point, reach = 640): boolean {
    return this.roads
      .query({ x: p.x - reach, y: p.y - reach, width: reach * 2, height: reach * 2 })
      .some(
        (r) =>
          Math.hypot(
            Math.max(r.x - p.x, 0, p.x - r.x - r.width),
            Math.max(r.y - p.y, 0, p.y - r.y - r.height),
          ) <= reach,
      );
  }

  canPlace(p: Point, radius: number): boolean {
    const index = Math.floor(p.y / 32) * this.columns + Math.floor(p.x / 32);
    const box = { x: p.x - radius, y: p.y - radius, width: radius * 2, height: radius * 2 };
    return (
      this.reached[index] === 1 &&
      containsRect(this.layout.scene.bounds, box) &&
      !this.safeAreas.some((r) => overlaps(r, box)) &&
      !this.collisions.query(box).some((r) => overlaps(r, box))
    );
  }
}
