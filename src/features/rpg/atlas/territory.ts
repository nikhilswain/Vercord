import type { AtlasRegion, Point, Rect } from './types';

/** Shared-cell ownership gives adjacent regions identical edges. Multi-source BFS
 * visits each cell once; its cost does not grow with houses × cells. */
export function buildTerritories(bounds: Rect, regions: AtlasRegion[]) {
  // A fixed coarse lattice produces readable chart edges at every town size.
  // Eight-neighbor growth gives rectangular frontages instead of diamond spikes.
  const cell = 128;
  const cols = Math.ceil(bounds.width / cell),
    rows = Math.ceil(bounds.height / cell);
  const owners = new Int16Array(cols * rows).fill(-1);
  const distance = new Int16Array(owners.length).fill(-1);
  const queue = new Int32Array(owners.length);
  let head = 0,
    tail = 0;
  const indexAt = (p: Point) => {
    const x = Math.floor((p.x - bounds.x) / cell),
      y = Math.floor((p.y - bounds.y) / cell);
    return x >= 0 &&
      y >= 0 &&
      x < cols &&
      y < rows &&
      p.x < bounds.x + bounds.width &&
      p.y < bounds.y + bounds.height
      ? y * cols + x
      : -1;
  };
  regions.forEach((region, owner) => {
    for (const seed of region.seeds) {
      const index = indexAt(seed);
      if (index < 0 || owners[index] !== -1) continue;
      owners[index] = owner;
      distance[index] = 0;
      queue[tail++] = index;
    }
  });
  const reach = Math.max(6, Math.ceil(1024 / cell));
  while (head < tail) {
    const index = queue[head++]!,
      x = index % cols,
      y = Math.floor(index / cols);
    if (distance[index]! >= reach) continue;
    for (const next of [
      x > 0 ? index - 1 : -1,
      x + 1 < cols ? index + 1 : -1,
      y > 0 ? index - cols : -1,
      y + 1 < rows ? index + cols : -1,
      x > 0 && y > 0 ? index - cols - 1 : -1,
      x + 1 < cols && y > 0 ? index - cols + 1 : -1,
      x > 0 && y + 1 < rows ? index + cols - 1 : -1,
      x + 1 < cols && y + 1 < rows ? index + cols + 1 : -1,
    ]) {
      if (next < 0 || owners[next] !== -1) continue;
      owners[next] = owners[index]!;
      distance[next] = distance[index]! + 1;
      queue[tail++] = next;
    }
  }
  const edges = regions.map(() => new Map<number, number[]>());
  const extents = regions.map(() => [Infinity, Infinity, -Infinity, -Infinity]);
  const vertex = (x: number, y: number) => y * (cols + 1) + x;
  const add = (owner: number, from: number, to: number) => {
    const out = edges[owner]!;
    const list = out.get(from) ?? [];
    list.push(to);
    out.set(from, list);
  };
  // Reuse the buffers to measure distance from a region edge for label placement.
  distance.fill(-1);
  head = 0;
  tail = 0;
  for (let index = 0; index < owners.length; index++) {
    const owner = owners[index]!;
    if (owner < 0) continue;
    const x = index % cols,
      y = Math.floor(index / cols),
      e = extents[owner]!;
    e[0] = Math.min(e[0]!, x);
    e[1] = Math.min(e[1]!, y);
    e[2] = Math.max(e[2]!, x + 1);
    e[3] = Math.max(e[3]!, y + 1);
    if (y === 0 || owners[index - cols] !== owner) add(owner, vertex(x, y), vertex(x + 1, y));
    if (x === cols - 1 || owners[index + 1] !== owner)
      add(owner, vertex(x + 1, y), vertex(x + 1, y + 1));
    if (y === rows - 1 || owners[index + cols] !== owner)
      add(owner, vertex(x + 1, y + 1), vertex(x, y + 1));
    if (x === 0 || owners[index - 1] !== owner) add(owner, vertex(x, y + 1), vertex(x, y));
    if (
      x === 0 ||
      y === 0 ||
      x === cols - 1 ||
      y === rows - 1 ||
      owners[index - 1] !== owner ||
      owners[index + 1] !== owner ||
      owners[index - cols] !== owner ||
      owners[index + cols] !== owner
    ) {
      distance[index] = 0;
      queue[tail++] = index;
    }
  }
  const point = (v: number) => ({
    x: bounds.x + Math.min(bounds.width, (v % (cols + 1)) * cell),
    y: bounds.y + Math.min(bounds.height, Math.floor(v / (cols + 1)) * cell),
  });
  regions.forEach((region, owner) => {
    const out = edges[owner]!,
      paths: string[] = [];
    while (out.size) {
      const first = out.keys().next().value as number;
      const loop: Point[] = [];
      let cursor = first;
      do {
        loop.push(point(cursor));
        const targets = out.get(cursor);
        if (!targets?.length) break;
        const next = targets.pop()!;
        if (!targets.length) out.delete(cursor);
        cursor = next;
      } while (cursor !== first);
      const corners = loop.filter((p, i) => {
        const before = loop[(i + loop.length - 1) % loop.length]!,
          after = loop[(i + 1) % loop.length]!;
        return (p.x - before.x) * (after.y - p.y) !== (p.y - before.y) * (after.x - p.x);
      });
      if (corners.length >= 3)
        paths.push(corners.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('') + 'Z');
    }
    region.path = paths.join('');
    const [x, y, right, bottom] = extents[owner]!;
    if (!Number.isFinite(x)) return;
    region.bounds = {
      x: bounds.x + x! * cell,
      y: bounds.y + y! * cell,
      width: (right! - x!) * cell,
      height: (bottom! - y!) * cell,
    };
  });
  const clearance = new Int16Array(regions.length).fill(-1),
    centerDistance = new Float64Array(regions.length).fill(Infinity);
  while (head < tail) {
    const index = queue[head++]!,
      owner = owners[index]!,
      region = regions[owner]!,
      x = index % cols,
      y = Math.floor(index / cols);
    const point = { x: bounds.x + (x + 0.5) * cell, y: bounds.y + (y + 0.5) * cell };
    const d = Math.hypot(
      point.x - region.bounds.x - region.bounds.width / 2,
      point.y - region.bounds.y - region.bounds.height / 2,
    );
    if (
      distance[index]! > clearance[owner]! ||
      (distance[index] === clearance[owner] && d < centerDistance[owner]!)
    ) {
      clearance[owner] = distance[index]!;
      centerDistance[owner] = d;
      region.center = point;
    }
    for (const next of [
      x > 0 ? index - 1 : -1,
      x + 1 < cols ? index + 1 : -1,
      y > 0 ? index - cols : -1,
      y + 1 < rows ? index + cols : -1,
    ]) {
      if (next < 0 || distance[next] !== -1 || owners[next] !== owner) continue;
      distance[next] = distance[index]! + 1;
      queue[tail++] = next;
    }
  }
  return (p: Point) => {
    const index = indexAt(p);
    return index < 0 ? undefined : regions[owners[index]!];
  };
}
