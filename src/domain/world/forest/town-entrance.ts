import type { Point, Rect, RpgSample, RpgStamp } from '../content/v1/types';
import { containsRect, footprint, overlaps } from '../geometry';

interface TownForestTrail {
  entrance: Point;
  clearing: Rect;
  roads: Rect[];
  gateScale?: number;
}

/** Includes the gate, its overhead label and the space in front of it. */
export function forestGateClearance(point: Point, scale = 1): Rect {
  return {
    x: point.x - 120 * scale,
    y: point.y - 184 * scale,
    width: 240 * scale,
    height: 248 * scale,
  };
}

function sceneryBounds(sample: RpgSample, stamp: RpgStamp): Rect {
  const texture = sample.textures.find((asset) => asset.key === stamp.texture);
  const frame = typeof stamp.frame === 'string' ? texture?.frames?.[stamp.frame] : undefined;
  // These v1 textures are whole images rather than atlas frames in saved documents.
  const native = {
    'lpc-house-brick': [192, 192],
    'lpc-house-paneled': [160, 160],
    'rpg-signpost': [32, 40],
    'norse-longboat': [160, 80],
  }[stamp.texture];
  const width = stamp.width ?? frame?.width ?? texture?.frameWidth ?? native?.[0] ?? 256;
  const height = stamp.height ?? frame?.height ?? texture?.frameHeight ?? native?.[1] ?? 256;
  const house = /house|norse-cottage|norse-smithy/.test(stamp.texture);
  return {
    x: stamp.x - width * (stamp.originX ?? 0) - (house ? 24 : 0),
    y: stamp.y - height * (stamp.originY ?? 0) - (house ? 48 : 0),
    width: width + (house ? 48 : 0),
    height: height + (house ? 48 : 0),
  };
}

const cache = new WeakMap<RpgSample, TownForestTrail>();

/** Find an empty peripheral clearing with a wide approach to the existing town lanes.
 * The bounded search uses saved art and collision geometry, never private channel labels.
 * Nothing is moved or removed from the saved town. New blocks cannot enlarge the search.
 */
export function townForestTrail(
  sample: RpgSample,
  purpose: 'gate' | 'provisions' = 'gate',
): TownForestTrail {
  const cached = purpose === 'gate' ? cache.get(sample) : undefined;
  if (cached) return cached;
  const bounds = {
    ...sample.bounds,
    width: Math.min(purpose === 'gate' ? 2048 : 4096, sample.bounds.width),
    height: Math.min(purpose === 'gate' ? 2048 : 4096, sample.bounds.height),
  };
  const obstacles = [
    ...sample.colliders,
    ...sample.npcs.map(footprint),
    ...sample.stamps
      .filter((stamp) => (stamp.depth ?? stamp.y) >= 0)
      .map((stamp) => sceneryBounds(sample, stamp)),
  ].filter((box) => overlaps(bounds, box));
  const clear = (box: Rect) =>
    containsRect(bounds, box) && !obstacles.some((other) => overlaps(box, other));
  const columns = Math.floor(bounds.width / 32),
    rows = Math.floor(bounds.height / 32);
  const point = (index: number): Point => ({
    x: bounds.x + (index % columns) * 32,
    y: bounds.y + Math.floor(index / columns) * 32,
  });
  const approach = (p: Point): Rect => ({ x: p.x - 32, y: p.y - 32, width: 64, height: 64 });
  const open = new Uint8Array(columns * rows);
  const previous = new Int32Array(open.length).fill(-1);
  const queue: number[] = [];
  for (let index = 0; index < open.length; index++) {
    const p = point(index),
      box = approach(p);
    if (!clear(box)) continue;
    open[index] = 1;
    const onLane = sample.terrain
      ? sample.terrain.roads.some((road) => containsRect(road, box))
      : Math.hypot(p.x - sample.spawn.x, p.y - sample.spawn.y) <= 64;
    if (onLane) {
      previous[index] = index;
      queue.push(index);
    }
  }
  // Multi-source flood fill: each reachable clearing has a short, continuous 64px approach.
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!,
      col = current % columns,
      row = Math.floor(current / columns);
    for (const next of [
      col > 0 ? current - 1 : -1,
      col + 1 < columns ? current + 1 : -1,
      row > 0 ? current - columns : -1,
      row + 1 < rows ? current + columns : -1,
    ]) {
      if (next < 0 || !open[next] || previous[next] !== -1) continue;
      previous[next] = current;
      queue.push(next);
    }
  }
  const cornerDistance = (p: Point) =>
    Math.min(p.x - bounds.x, bounds.x + bounds.width - p.x) +
    Math.min(p.y - bounds.y, bounds.y + bounds.height - p.y);
  let gateScale = 1;
  const footprintFor = (p: Point) =>
    purpose === 'gate'
      ? forestGateClearance(p, gateScale)
      : { x: p.x - 80, y: p.y - 100, width: 160, height: 164 };
  if (purpose === 'gate' && !queue.some((index) => clear(footprintFor(point(index)))))
    gateScale = 2 / 3;
  const candidates = queue
    .filter((index) => clear(footprintFor(point(index))))
    .sort((a, b) => cornerDistance(point(a)) - cornerDistance(point(b)) || a - b);
  const preferred = candidates.filter((index) => {
    const p = point(index);
    // Camera bounds keep edge scenery near the HUD. Leave room for both the label
    // and a traveler in front of the gate, especially above the bottom-left chat.
    return (
      p.x >= bounds.x + (purpose === 'gate' ? 224 : 128) &&
      p.x <= bounds.x + bounds.width - (purpose === 'gate' ? 224 : 128) &&
      p.y >= bounds.y + (purpose === 'gate' ? 448 : 192) &&
      p.y <= bounds.y + bounds.height - (purpose === 'gate' ? 224 : 112) &&
      clear(footprintFor(p))
    );
  })[0];
  // Compact art previews can have a harbor along the entire southern edge.
  // Keep published choices stable; only fall back to an equally empty, reachable
  // northern clearing when the preferred HUD margins have no valid candidate.
  const candidate =
    preferred ??
    candidates.find((index) => {
      const p = point(index);
      return (
        p.x >= bounds.x + 128 &&
        p.x <= bounds.x + bounds.width - 128 &&
        p.y >= bounds.y + 224 &&
        p.y <= bounds.y + bounds.height - 112
      );
    });
  if (candidate === undefined) throw new Error('No accessible clearing for the ' + purpose);
  const entrance = point(candidate);
  const clearing =
    purpose === 'gate'
      ? {
          x: entrance.x - 64 * gateScale,
          y: entrance.y - 144 * gateScale,
          width: 128 * gateScale,
          height: 192 * gateScale,
        }
      : { x: entrance.x - 80, y: entrance.y - 96, width: 160, height: 160 };
  const roads: Rect[] = [clearing];
  // Merge straight runs so the terrain cache receives a handful of rectangles, not path cells.
  let start = point(candidate),
    last = start,
    direction = '';
  const segment = () =>
    roads.push({
      x: Math.min(start.x, last.x) - 32,
      y: Math.min(start.y, last.y) - 32,
      width: Math.abs(start.x - last.x) + 64,
      height: Math.abs(start.y - last.y) + 64,
    });
  for (let index = candidate; previous[index] !== index;) {
    const next = previous[index]!;
    const p = point(next),
      nextDirection = p.x === last.x ? 'vertical' : 'horizontal';
    if (direction && nextDirection !== direction) {
      segment();
      start = last;
    }
    last = p;
    direction = nextDirection;
    index = next;
  }
  segment();
  const trail = { entrance, clearing, roads, ...(gateScale !== 1 ? { gateScale } : {}) };
  if (purpose === 'gate') cache.set(sample, trail);
  return trail;
}

export function townForestEntrance(sample: RpgSample): Point {
  return townForestTrail(sample).entrance;
}
