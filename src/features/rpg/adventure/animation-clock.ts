/** Map native contact frames onto the shared gameplay clock, including differently paced skins. */
export function attackAnimationTime(
  elapsedMs: number,
  gameplay: { durationMs: number; impactMs: number },
  source: { durationMs: number; impactAtMs?: number },
): number {
  const impact = source.impactAtMs ?? (source.durationMs * gameplay.impactMs) / gameplay.durationMs;
  if (elapsedMs <= gameplay.impactMs) return (Math.max(0, elapsedMs) / gameplay.impactMs) * impact;
  return (
    impact +
    Math.min(1, (elapsedMs - gameplay.impactMs) / (gameplay.durationMs - gameplay.impactMs)) *
      (source.durationMs - impact)
  );
}
