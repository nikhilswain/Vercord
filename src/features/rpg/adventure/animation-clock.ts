/** Map native contact frames onto the shared gameplay clock, including differently paced skins. */
export function attackAnimationTime(
  elapsedMs: number,
  gameplay: { durationMs: number; impactMs: number },
  source: { durationMs: number; impactAtMs?: number; windupEndAtMs?: number },
): number {
  const impact = source.impactAtMs ?? (source.durationMs * gameplay.impactMs) / gameplay.durationMs;
  const prepared = source.windupEndAtMs ?? 0;
  if (elapsedMs <= gameplay.impactMs)
    return prepared + (Math.max(0, elapsedMs) / gameplay.impactMs) * (impact - prepared);
  return (
    impact +
    Math.min(1, (elapsedMs - gameplay.impactMs) / (gameplay.durationMs - gameplay.impactMs)) *
      (source.durationMs - impact)
  );
}
