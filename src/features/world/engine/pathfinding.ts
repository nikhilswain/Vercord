import { overlaps } from './collision';
import type { Point, Rect } from './types';

interface GridPoint {
  col: number;
  row: number;
}

const CELL_SIZE = 32;
const FOOTPRINT = { width: 18, height: 12 };

function gridKey(point: GridPoint): string {
  return `${point.col}:${point.row}`;
}

function toWorld(point: GridPoint): Point {
  return {
    x: point.col * CELL_SIZE + CELL_SIZE / 2,
    y: point.row * CELL_SIZE + CELL_SIZE / 2,
  };
}

function isWalkable(point: GridPoint, colliders: Rect[], bounds: Rect): boolean {
  const world = toWorld(point);
  const box: Rect = {
    x: world.x - FOOTPRINT.width / 2,
    y: world.y - FOOTPRINT.height / 2,
    width: FOOTPRINT.width,
    height: FOOTPRINT.height,
  };
  if (
    box.x < bounds.x ||
    box.y < bounds.y ||
    box.x + box.width > bounds.x + bounds.width ||
    box.y + box.height > bounds.y + bounds.height
  ) {
    return false;
  }
  return !colliders.some((collider) => overlaps(box, collider));
}

function nearestWalkable(point: Point, colliders: Rect[], bounds: Rect): GridPoint | null {
  const origin = {
    col: Math.floor(point.x / CELL_SIZE),
    row: Math.floor(point.y / CELL_SIZE),
  };
  for (let radius = 0; radius <= 5; radius += 1) {
    for (let row = origin.row - radius; row <= origin.row + radius; row += 1) {
      for (let col = origin.col - radius; col <= origin.col + radius; col += 1) {
        const candidate = { col, row };
        if (isWalkable(candidate, colliders, bounds)) return candidate;
      }
    }
  }
  return null;
}

export function findPath(
  from: Point,
  to: Point,
  colliders: Rect[],
  bounds: Rect,
): Point[] {
  const start = nearestWalkable(from, colliders, bounds);
  const target = nearestWalkable(to, colliders, bounds);
  if (!start || !target) return [];

  const frontier: GridPoint[] = [start];
  const cameFrom = new Map<string, GridPoint | null>([[gridKey(start), null]]);
  const targetKey = gridKey(target);
  const directions = [
    { col: 1, row: 0 },
    { col: -1, row: 0 },
    { col: 0, row: 1 },
    { col: 0, row: -1 },
  ];

  while (frontier.length > 0) {
    frontier.sort((a, b) => {
      const aDistance = Math.abs(a.col - target.col) + Math.abs(a.row - target.row);
      const bDistance = Math.abs(b.col - target.col) + Math.abs(b.row - target.row);
      return aDistance - bDistance;
    });
    const current = frontier.shift();
    if (!current) break;
    if (gridKey(current) === targetKey) break;

    for (const direction of directions) {
      const next = { col: current.col + direction.col, row: current.row + direction.row };
      const key = gridKey(next);
      if (cameFrom.has(key) || !isWalkable(next, colliders, bounds)) continue;
      cameFrom.set(key, current);
      frontier.push(next);
    }
  }

  if (!cameFrom.has(targetKey)) return [];
  const route: GridPoint[] = [];
  let cursor: GridPoint | null = target;
  while (cursor) {
    route.unshift(cursor);
    cursor = cameFrom.get(gridKey(cursor)) ?? null;
  }

  const waypoints = route.map(toWorld).filter((point, index, points) => {
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1];
    const next = points[index + 1];
    if (!previous || !next) return true;
    return previous.x !== next.x && previous.y !== next.y;
  });
  if (isWalkable({ col: Math.floor(to.x / CELL_SIZE), row: Math.floor(to.y / CELL_SIZE) }, colliders, bounds)) {
    waypoints.push(to);
  }
  return waypoints;
}
