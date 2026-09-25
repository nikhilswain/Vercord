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

function dimensions(block: ContinuousTownBlock) {
  return {
    w: block.width ?? CONTINUOUS_TOWN_BLOCK_SIZE,
    h: block.height ?? CONTINUOUS_TOWN_BLOCK_SIZE,
  };
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

interface Adjacency {
  horizontal: boolean;
  border: number;
  start: number;
  end: number;
}

/** Two districts touch when their rectangles share an edge and overlap on the other axis. */
function adjacency(parent: ContinuousTownBlock, block: ContinuousTownBlock): Adjacency | null {
  const p = dimensions(parent);
  const b = dimensions(block);
  const overlapY = Math.min(parent.y + p.h, block.y + b.h) - Math.max(parent.y, block.y);
  if (parent.x + p.w === block.x && overlapY > 0)
    return {
      horizontal: true,
      border: block.x,
      start: Math.max(parent.y, block.y),
      end: Math.min(parent.y + p.h, block.y + b.h),
    };
  if (block.x + b.w === parent.x && overlapY > 0)
    return {
      horizontal: true,
      border: parent.x,
      start: Math.max(parent.y, block.y),
      end: Math.min(parent.y + p.h, block.y + b.h),
    };
  const overlapX = Math.min(parent.x + p.w, block.x + b.w) - Math.max(parent.x, block.x);
  if (parent.y + p.h === block.y && overlapX > 0)
    return {
      horizontal: false,
      border: block.y,
      start: Math.max(parent.x, block.x),
      end: Math.min(parent.x + p.w, block.x + b.w),
    };
  if (block.y + b.h === parent.y && overlapX > 0)
    return {
      horizontal: false,
      border: parent.y,
      start: Math.max(parent.x, block.x),
      end: Math.min(parent.x + p.w, block.x + b.w),
    };
  return null;
}

/** Every new district links to an earlier neighbour; optional second links make small loops. */
export function blockLinks(
  block: ContinuousTownBlock,
  layout: ContinuousTownLayout,
  vault?: Point,
): BlockLink[] {
  if (block.id === 0 || block.roadStyle !== 2) return [];
  const random = seededRandom(`${layout.seed}:lanes-v2:links:${block.id}`);
  const neighbors = shuffled(
    layout.blocks.filter(
      (candidate) => candidate.id < block.id && adjacency(candidate, block) !== null,
    ),
    random,
  );
  if (!neighbors.length) {
    // A new shelf row starts back at x = 0 but its first block may sit below a shorter block,
    // leaving a vertical gap. Bridge that gap through the clear left margin of both districts.
    const above = layout.blocks
      .filter(
        (candidate) =>
          candidate.id < block.id &&
          candidate.x === block.x &&
          candidate.y + (candidate.height ?? CONTINUOUS_TOWN_BLOCK_SIZE) <= block.y,
      )
      .sort((a, b) => b.y - a.y)[0];
    if (!above) return [];
    const local = { x: block.x + 2 * TILE, y: block.y + TILE };
    const remote = {
      x: above.x + 2 * TILE,
      y: above.y + (above.height ?? CONTINUOUS_TOWN_BLOCK_SIZE) - TILE,
    };
    return [
      {
        parent: above,
        local,
        remote,
        bridge: {
          x: block.x + TILE,
          y: remote.y,
          width: 3 * TILE,
          height: local.y - remote.y + TILE,
        },
      },
    ];
  }
  return neighbors.slice(0, random() < 0.3 ? 2 : 1).map((parent) => {
    const a = adjacency(parent, block)!;
    const room = Math.max(1, Math.floor((a.end - a.start) / TILE));
    let gate = a.start + (1 + Math.floor(random() * Math.max(1, room - 2))) * TILE;
    // A horizontal link meets the civic block 0's side, where the vault stands; keep the gate above it.
    if (a.horizontal && parent.id === 0 && vault && gate + TILE > vault.y)
      gate = Math.max(a.start + TILE, vault.y - 2 * TILE);
    if (a.horizontal) {
      const blockRight = block.x > parent.x;
      return {
        parent,
        local: {
          x: blockRight ? block.x + TILE : block.x + dimensions(block).w - TILE,
          y: gate,
        },
        remote: { x: blockRight ? block.x - TILE : parent.x + TILE, y: gate },
        bridge: { x: a.border - TILE, y: gate - TILE, width: 2 * TILE, height: 2 * TILE },
      };
    }
    const blockBelow = block.y > parent.y;
    return {
      parent,
      local: {
        x: gate,
        y: blockBelow ? block.y + TILE : block.y + dimensions(block).h - TILE,
      },
      remote: { x: gate, y: blockBelow ? block.y - TILE : parent.y + TILE },
      bridge: { x: gate - TILE, y: a.border - TILE, width: 2 * TILE, height: 2 * TILE },
    };
  });
}

/** A block-sized local search joins new destinations onto the already saved road tree. */
export class LaneBuilder {
  private readonly columns: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;
  private readonly network: Uint8Array;
  private readonly directions: Array<readonly [number, number]>;

  public constructor(
    private readonly block: ContinuousTownBlock,
    seed: string,
    size: number = CONTINUOUS_TOWN_BLOCK_SIZE,
    vault?: Point,
  ) {
    const width = block.width ?? size;
    const height = block.height ?? size;
    this.columns = Math.max(2, Math.floor(width / TILE) - 1);
    this.rows = Math.max(2, Math.floor(height / TILE) - 1);
    this.blocked = new Uint8Array(this.columns * this.rows);
    this.network = new Uint8Array(this.columns * this.rows);
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
      ((target.y - this.block.y) / TILE - 1) * this.columns + (target.x - this.block.x) / TILE - 1;
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
      const x = current % this.columns,
        y = Math.floor(current / this.columns);
      for (const [dx, dy] of this.directions) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || nx >= this.columns || ny < 0 || ny >= this.rows) continue;
        const next = ny * this.columns + nx;
        if (this.blocked[next] || previous[next] !== -1) continue;
        previous[next] = current;
        if (this.network[next]) {
          end = next;
          break;
        }
        queue[tail++] = next;
      }
    }
    if (end < 0)
      throw new Error(
        `Unable to connect a town lane block=${this.block.id} target=${JSON.stringify(target)} grid=${this.columns}x${this.rows}`,
      );
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
      x: this.block.x + ((index % this.columns) + 1) * TILE,
      y: this.block.y + (Math.floor(index / this.columns) + 1) * TILE,
    };
  }
}
