import { overlaps } from './collision';
import type { Point, Rect } from './types';

interface SearchNode {
  col: number;
  row: number;
  g: number;
  h: number;
  parent: SearchNode | null;
  direction: Point;
}

const CELL_SIZE = 16;
const PLAYER_FOOTPRINT = { width: 18, height: 12 };
const DIRECTIONS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function key(col: number, row: number): string {
  return `${col}:${row}`;
}

function gridToWorld(col: number, row: number): Point {
  return {
    x: col * CELL_SIZE + CELL_SIZE / 2,
    y: row * CELL_SIZE + CELL_SIZE / 2,
  };
}

function pointIsWalkable(point: Point, colliders: Rect[], bounds: Rect): boolean {
  const box: Rect = {
    x: point.x - PLAYER_FOOTPRINT.width / 2,
    y: point.y - PLAYER_FOOTPRINT.height / 2,
    width: PLAYER_FOOTPRINT.width,
    height: PLAYER_FOOTPRINT.height,
  };
  if (
    box.x < bounds.x ||
    box.y < bounds.y ||
    box.x + box.width > bounds.x + bounds.width ||
    box.y + box.height > bounds.y + bounds.height
  ) {
    return false;
  }
  const clearance = 2;
  return !colliders.some((collider) =>
    overlaps(box, {
      x: collider.x - clearance,
      y: collider.y - clearance,
      width: collider.width + clearance * 2,
      height: collider.height + clearance * 2,
    }),
  );
}

function gridIsWalkable(col: number, row: number, colliders: Rect[], bounds: Rect): boolean {
  return pointIsWalkable(gridToWorld(col, row), colliders, bounds);
}

function nearestWalkable(point: Point, colliders: Rect[], bounds: Rect): Point | null {
  const origin = {
    x: Math.floor(point.x / CELL_SIZE),
    y: Math.floor(point.y / CELL_SIZE),
  };
  for (let radius = 0; radius <= 10; radius += 1) {
    let closest: Point | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (let row = origin.y - radius; row <= origin.y + radius; row += 1) {
      for (let col = origin.x - radius; col <= origin.x + radius; col += 1) {
        if (radius > 0 && Math.abs(col - origin.x) !== radius && Math.abs(row - origin.y) !== radius) {
          continue;
        }
        if (!gridIsWalkable(col, row, colliders, bounds)) continue;
        const world = gridToWorld(col, row);
        const distance = Math.hypot(world.x - point.x, world.y - point.y);
        if (distance < closestDistance) {
          closest = { x: col, y: row };
          closestDistance = distance;
        }
      }
    }
    if (closest) return closest;
  }
  return null;
}

function reconstruct(end: SearchNode, exactTarget: Point | null): Point[] {
  const nodes: SearchNode[] = [];
  let cursor: SearchNode | null = end;
  while (cursor) {
    nodes.unshift(cursor);
    cursor = cursor.parent;
  }

  const corners = nodes
    .filter((_node, index) => {
      if (index === 0 || index === nodes.length - 1) return true;
      const previous = nodes[index - 1];
      const next = nodes[index + 1];
      if (!previous || !next) return true;
      return previous.col !== next.col && previous.row !== next.row;
    })
    .map((node) => gridToWorld(node.col, node.row));

  if (exactTarget) {
    const last = corners[corners.length - 1];
    if (!last || Math.hypot(last.x - exactTarget.x, last.y - exactTarget.y) > 4) corners.push(exactTarget);
  }
  return corners;
}

export function findPath(from: Point, to: Point, colliders: Rect[], bounds: Rect): Point[] {
  const startGrid = nearestWalkable(from, colliders, bounds);
  const targetGrid = nearestWalkable(to, colliders, bounds);
  if (!startGrid || !targetGrid) return [];

  const start: SearchNode = {
    col: startGrid.x,
    row: startGrid.y,
    g: 0,
    h: Math.abs(targetGrid.x - startGrid.x) + Math.abs(targetGrid.y - startGrid.y),
    parent: null,
    direction: { x: 0, y: 0 },
  };
  const open: SearchNode[] = [start];
  const bestScore = new Map<string, number>([[key(start.col, start.row), 0]]);
  const closed = new Set<string>();
  let closest = start;
  let closestDistance = start.h;

  while (open.length > 0) {
    open.sort((a, b) => a.g + a.h - (b.g + b.h));
    const current = open.shift();
    if (!current) break;
    const currentKey = key(current.col, current.row);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (current.h < closestDistance) {
      closest = current;
      closestDistance = current.h;
    }
    if (current.col === targetGrid.x && current.row === targetGrid.y) {
      return reconstruct(current, pointIsWalkable(to, colliders, bounds) ? to : null);
    }

    for (const direction of DIRECTIONS) {
      const col = current.col + direction.x;
      const row = current.row + direction.y;
      const nodeKey = key(col, row);
      if (closed.has(nodeKey) || !gridIsWalkable(col, row, colliders, bounds)) continue;
      const turning =
        current.parent !== null &&
        (current.direction.x !== direction.x || current.direction.y !== direction.y);
      const g = current.g + 1 + (turning ? 0.35 : 0);
      if (g >= (bestScore.get(nodeKey) ?? Number.POSITIVE_INFINITY)) continue;
      bestScore.set(nodeKey, g);
      open.push({
        col,
        row,
        g,
        h: Math.abs(targetGrid.x - col) + Math.abs(targetGrid.y - row),
        parent: current,
        direction,
      });
    }
  }

  return closest === start ? [] : reconstruct(closest, null);
}
