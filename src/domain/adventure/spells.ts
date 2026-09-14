/** World-space projectile tuning, shared by every adventure and its demo. */
export const SPELL_DEFINITIONS = {
  fire: { speed: 290, range: 320 },
  water: { speed: 340, range: 360 },
} as const;

/** Direction comes only from the player's input; no creature lookup belongs here. */
export function attackAim(
  origin: { x: number; y: number },
  fallback: { x: number; y: number },
  target?: { x: number; y: number },
): { x: number; y: number } {
  if (!target) return { ...fallback };
  const x = target.x - origin.x,
    y = target.y - origin.y;
  const length = Math.hypot(x, y);
  return Number.isFinite(length) && length > 0.001
    ? { x: x / length, y: y / length }
    : { ...fallback };
}
