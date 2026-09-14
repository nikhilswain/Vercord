import type { Point } from '../../world/engine/types';
import type { CombatMode } from './types';

/** Projectile artwork is elevated above the ground-space collision simulation. */
export const SPELL_VISUAL_HEIGHT = 22;

export function combatTargetAtPointer(point: Point, mode: CombatMode): Point {
  // Convert the visible cursor back to the projectile's ground plane so the
  // rendered shot passes through the cursor, rather than a line above it.
  return { x: point.x, y: point.y + (mode === 'melee' ? 0 : SPELL_VISUAL_HEIGHT) };
}
