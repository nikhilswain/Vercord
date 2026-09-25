import { TILE } from './content/v1/builder';
import type { Point, Rect } from './content/v1/types';
import type {
  ContinuousTownBlock,
  ContinuousTownLayout,
  ContinuousTownPlot,
} from './continuous-town';
import { containsRect, overlaps } from './geometry';
import { seededRandom, shuffled } from './random';

export const CONTINUOUS_TOWN_BLOCK_SIZE = 2048;

export function frontage(plot: ContinuousTownPlot): Point {
  return { x: plot.x + 5 * TILE, y: plot.y + 10 * TILE };
}

function roofAreas(block: ContinuousTownBlock, vault?: Point): Rect[] {
  const areas = block.plots.map((plot) => ({ ...plot, width: 10 * TILE, height: 8 * TILE }));
  if (block.id === 0 && vault)
    areas.push({ ...vault, variant: 0, width: 14 * TILE, height: 8 * TILE });
  return areas;
}

interface BlockLink {
  parent: ContinuousTownBlock;
  local: Point;
  remote: Point;
  bridge: Rect;
}

/** Every new block chooses an earlier neighbor; optional second links make small loops. */
export function blockLinks(
  block: ContinuousTownBlock,
  layout: ContinuousTownLayout,
  size: number,
  vault?: Point,
): BlockLink[] {
  if (block.id === 0 || block.roadStyle !== 2) return [];
  const random = seededRandom(`${layout.seed}:lanes-v2:links:${block.id}`);
  const neighbors = shuffled(
    layout.blocks.filter(
      (candidate) =>
        candidate.id < block.id &&
        Math.abs(candidate.x - block.x) + Math.abs(candidate.y - block.y) === size,
    ),
    random,
  );
  return neighbors.slice(0, random() < 0.3 ? 2 : 1).map((parent) => {
    const vertical = parent.x === block.x;
    let maxGate = size / TILE - 5;
    // A horizontal link reaches the parent's side, which for the civic block 0 can be where the
    // vault stands; keep the gate above the vault so the lane never crosses it.
    if (!vertical && parent.id === 0 && vault) maxGate = Math.min(maxGate, vault.y / TILE - 2);
    const gate =
      (parent.roadStyle === 2 ? 5 + Math.floor(random() * Math.max(1, maxGate - 5)) : 2) * TILE;
    if (vertical) {
      const border = Math.max(parent.y, block.y);
      return {
        parent,
        local: { x: block.x + gate, y: border + (block.y > parent.y ? TILE : -TILE) },
        remote: { x: block.x + gate, y: border + (block.y > parent.y ? -TILE : TILE) },
        bridge: {
          x: block.x + gate - TILE,
          y: border - 2 * TILE,
          width: 2 * TILE,
          height: 4 * TILE,
        },
      };
    }
    const border = Math.max(parent.x, block.x);
    return {
      parent,
      local: { x: border + (block.x > parent.x ? TILE : -TILE), y: block.y + gate },
      remote: { x: border + (block.x > parent.x ? -TILE : TILE), y: block.y + gate },
      bridge: { x: border - 2 * TILE, y: block.y + gate - TILE, width: 4 * TILE, height: 2 * TILE },
    };
  });
}

/** A block-sized local search joins new destinations onto the already saved road tree. */
export class LaneBuilder {
  private readonly window: number;
  private readonly blocked: Uint8Array;
  private readonly network: Uint8Array;
  private readonly directions: Array<readonly [number, number]>;

  public constructor(
    private readonly block: ContinuousTownBlock,
    seed: string,
    size: number = CONTINUOUS_TOWN_BLOCK_SIZE,
    vault?: Point,
  ) {
    this.window = Math.floor(size / TILE) - 1;
    this.blocked = new Uint8Array(this.window * this.window);
    this.network = new Uint8Array(this.window * this.window);
    const roofs = roofAreas(block, vault);
    this.directions = shuffled(
      [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ] as const,
      seededRandom(`${seed}:lanes-v2:route:${block.id}`),
    );
    for (let index = 0; index < this.blocked.length; index++) {
      const point = this.point(index);
      const box = { x: point.x - TILE, y: point.y - TILE, width: 2 * TILE, height: 2 * TILE };
      if (roofs.some((roof) => overlaps(roof, box))) this.blocked[index] = 1;
      if (block.roads!.some((road) => containsRect(road, box))) this.network[index] = 1;
    }
  }

  public connect(target: Point): void {
    const start =
      ((target.y - this.block.y) / TILE - 1) * this.window + (target.x - this.block.x) / TILE - 1;
    if (
      !Number.isInteger(start) ||
      start < 0 ||
      start >= this.blocked.length ||
      this.blocked[start]
    )
      throw new Error('Town lane destination overlaps a reserved roof');
    if (this.network[start]) return;
    const previous = new Int32Array(this.blocked.length).fill(-1);
    const queue = new Int32Array(this.blocked.length);
    queue[0] = start;
    previous[start] = start;
    let tail = 1;
    let end = -1;
    for (let head = 0; head < tail && end < 0; head++) {
      const current = queue[head]!;
      const x = current % this.window,
        y = Math.floor(current / this.window);
      for (const [dx, dy] of this.directions) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || nx >= this.window || ny < 0 || ny >= this.window) continue;
        const next = ny * this.window + nx;
        if (this.blocked[next] || previous[next] !== -1) continue;
        previous[next] = current;
        if (this.network[next]) {
          end = next;
          break;
        }
        queue[tail++] = next;
      }
    }
    if (end < 0) throw new Error('Unable to connect a town lane');
    const points: Point[] = [];
    for (let index = end; ; index = previous[index]!) {
      this.network[index] = 1;
      points.push(this.point(index));
      if (index === start) break;
    }
    let from = points[0]!;
    for (let index = 1; index < points.length; index++) {
      const point = points[index]!;
      const next = points[index + 1];
      if (
        next &&
        ((from.x === point.x && point.x === next.x) || (from.y === point.y && point.y === next.y))
      )
        continue;
      this.block.roads!.push({
        x: Math.min(from.x, point.x) - TILE,
        y: Math.min(from.y, point.y) - TILE,
        width: Math.abs(from.x - point.x) + 2 * TILE,
        height: Math.abs(from.y - point.y) + 2 * TILE,
      });
      from = point;
    }
  }

  private point(index: number): Point {
    return {
      x: this.block.x + ((index % this.window) + 1) * TILE,
      y: this.block.y + (Math.floor(index / this.window) + 1) * TILE,
    };
  }
}
