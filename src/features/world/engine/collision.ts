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
  const maxX = world.x + world.width - playerBox.width;
  const maxY = world.y + world.height - playerBox.height;
  let x = Math.max(world.x, Math.min(maxX, playerBox.x + deltaX));
  let y = playerBox.y;

  if (colliders.some((collider) => overlaps({ ...playerBox, x, y }, collider))) {
    x = playerBox.x;
  }

  y = Math.max(world.y, Math.min(maxY, playerBox.y + deltaY));
  if (colliders.some((collider) => overlaps({ ...playerBox, x, y }, collider))) {
    y = playerBox.y;
  }

  return { x, y };
}

export function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
