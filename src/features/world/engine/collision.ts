import type { Rect } from './types';

export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function resolveMovement(
  playerBox: Rect,
  deltaX: number,
  deltaY: number,
  colliders: Rect[],
  world: Rect,
): Pick<Rect, 'x' | 'y'> {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(deltaX), Math.abs(deltaY)) / 5));
  const stepX = deltaX / steps;
  const stepY = deltaY / steps;
  let current = { ...playerBox };

  for (let step = 0; step < steps; step += 1) {
    current = resolveStep(current, stepX, stepY, colliders, world);
  }
  return { x: current.x, y: current.y };
}

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function totalOverlap(box: Rect, colliders: Rect[]): number {
  return colliders.reduce((total, collider) => total + overlapArea(box, collider), 0);
}

function resolveStep(
  current: Rect,
  deltaX: number,
  deltaY: number,
  colliders: Rect[],
  world: Rect,
): Rect {
  const maxX = world.x + world.width - current.width;
  const maxY = world.y + world.height - current.height;
  const initialOverlap = totalOverlap(current, colliders);
  let x = current.x;
  let y = current.y;

  const horizontal = { ...current, x: Math.max(world.x, Math.min(maxX, current.x + deltaX)) };
  const horizontalOverlap = totalOverlap(horizontal, colliders);
  if (horizontalOverlap === 0 || horizontalOverlap < initialOverlap) x = horizontal.x;

  const vertical = { ...current, x, y: Math.max(world.y, Math.min(maxY, current.y + deltaY)) };
  const verticalOverlap = totalOverlap(vertical, colliders);
  if (verticalOverlap === 0 || verticalOverlap < initialOverlap) y = vertical.y;

  return { ...current, x, y };
}

export function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
