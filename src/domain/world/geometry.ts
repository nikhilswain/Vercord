import type { Point, Rect, RpgSample } from './content/v1/types';

/** Pinned to the LPC rig's feet; excludes its non-solid head and clothing. */
export const WORLD_PLAYER_FEET = { width: 18, height: 12, offsetX: -9, offsetY: -12 };

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function footprint(point: Point): Rect {
  return {
    x: point.x + WORLD_PLAYER_FEET.offsetX,
    y: point.y + WORLD_PLAYER_FEET.offsetY,
    width: WORLD_PLAYER_FEET.width,
    height: WORLD_PLAYER_FEET.height,
  };
}

export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** One bounded flood fill, including swept feet between cells, validates all destinations. */
export function sceneIsReachable(scene: RpgSample): boolean {
  const step = 16;
  const columns = Math.ceil(scene.bounds.width / step);
  const rows = Math.ceil(scene.bounds.height / step);
  if (columns * rows > 24_000) return false;
  const obstacles = [...scene.colliders, ...scene.npcs.map(footprint)];
  const safe = (point: Point, boxes = obstacles) =>
    containsRect(scene.bounds, footprint(point)) &&
    !boxes.some((box) => overlaps(footprint(point), box));
  if (!safe(scene.spawn)) return false;
  if (scene.npcs.some((npc) => !safe(npc, scene.colliders))) return false;
  if (scene.landmarks.some((landmark) => !safe(landmark))) return false;
  const pointAt = (index: number): Point => ({
    x: scene.bounds.x + (index % columns) * step + 8,
    y: scene.bounds.y + Math.floor(index / columns) * step + 8,
  });
  const blocked = new Uint8Array(columns * rows);
  for (let index = 0; index < blocked.length; index++)
    if (!containsRect(scene.bounds, footprint(pointAt(index)))) blocked[index] = 1;
  // Rasterize each inflated obstacle once instead of scanning every collider at every cell.
  for (const box of obstacles) {
    const minCol = Math.max(0, Math.floor((box.x - 11 - scene.bounds.x) / step));
    const maxCol = Math.min(
      columns - 1,
      Math.ceil((box.x + box.width + 11 - scene.bounds.x) / step),
    );
    const minRow = Math.max(0, Math.floor((box.y - 2 - scene.bounds.y) / step));
    const maxRow = Math.min(rows - 1, Math.ceil((box.y + box.height + 14 - scene.bounds.y) / step));
    const clearance = { x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 };
    for (let row = minRow; row <= maxRow; row++)
      for (let col = minCol; col <= maxCol; col++) {
        if (overlaps(footprint(pointAt(row * columns + col)), clearance))
          blocked[row * columns + col] = 1;
      }
  }
  const sweptClear = (from: Point, to: Point) => {
    const swept = {
      x: Math.min(from.x, to.x) - 9,
      y: Math.min(from.y, to.y) - 12,
      width: Math.abs(to.x - from.x) + 18,
      height: Math.abs(to.y - from.y) + 12,
    };
    return containsRect(scene.bounds, swept) && !obstacles.some((box) => overlaps(swept, box));
  };
  const start =
    Math.floor((scene.spawn.y - scene.bounds.y) / step) * columns +
    Math.floor((scene.spawn.x - scene.bounds.x) / step);
  if (blocked[start] || !sweptClear(scene.spawn, pointAt(start))) return false;
  const seen = new Uint8Array(blocked.length);
  const queue = new Int32Array(blocked.length);
  let head = 0;
  let tail = 1;
  seen[start] = 1;
  queue[0] = start;
  while (head < tail) {
    const index = queue[head++]!;
    const col = index % columns;
    const row = Math.floor(index / columns);
    for (const next of [
      col > 0 ? index - 1 : -1,
      col + 1 < columns ? index + 1 : -1,
      row > 0 ? index - columns : -1,
      row + 1 < rows ? index + columns : -1,
    ]) {
      // 12px feet + 2px clearance on both sides cover the complete 16px edge.
      // Adjacent free cells therefore also prove the swept feet are collision-free.
      if (next < 0 || blocked[next] || seen[next]) continue;
      seen[next] = 1;
      queue[tail++] = next;
    }
  }
  return [...scene.landmarks, ...scene.npcs].every((target) => {
    const radius = 'lines' in target ? 48 : Math.min(48, target.radius);
    const centerCol = Math.floor((target.x - scene.bounds.x) / step);
    const centerRow = Math.floor((target.y - scene.bounds.y) / step);
    for (let row = centerRow - 3; row <= centerRow + 3; row++)
      for (let col = centerCol - 3; col <= centerCol + 3; col++) {
        if (row < 0 || col < 0 || row >= rows || col >= columns || !seen[row * columns + col])
          continue;
        const point = pointAt(row * columns + col);
        if (Math.hypot(point.x - target.x, point.y - target.y) > radius) continue;
        const samples = Math.ceil(Math.hypot(point.x - target.x, point.y - target.y) / 4);
        let clear = true;
        for (let part = 1; part < samples; part++) {
          const x = point.x + ((target.x - point.x) * part) / samples;
          const y = point.y - 4 + ((target.y - point.y) * part) / samples;
          if (
            scene.colliders.some(
              (box) =>
                x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height,
            )
          ) {
            clear = false;
            break;
          }
        }
        if (clear) return true;
      }
    return false;
  });
}
