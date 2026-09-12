/** Shared rules only. Real-world experience must eventually be owned by the server. */
export const MAX_CHARACTER_LEVEL = 20;
export function experienceForLevel(level: number): number {
  level = normalizeEncounterLevel(level);
  if (level === 1) return 0;
  if (level === 2) return 30;
  return 100 + (level - 3) * 70 + (level - 3) ** 2 * 15;
}
export function levelForExperience(experience: number): number {
  if (!Number.isFinite(experience)) return 1;
  let level = 1;
  while (level < MAX_CHARACTER_LEVEL && experience >= experienceForLevel(level + 1)) level++;
  return level;
}
export function normalizeEncounterLevel(level: number): number {
  return Number.isFinite(level) ? Math.min(MAX_CHARACTER_LEVEL, Math.max(1, Math.round(level))) : 1;
}
export function encounterPower(base: { health: number; damage: number }, level: number) {
  const step = normalizeEncounterLevel(level) - 1;
  return {
    health: Math.round(base.health * (1 + step * 0.18)),
    damage: Math.round(base.damage * (1 + step * 0.1)),
  };
}

/** Pure spawn policy usable by a future authoritative world service. */
export function encounterLevelForPlayer(playerLevel: number, elite = false): number {
  return normalizeEncounterLevel(playerLevel + (elite ? 1 : 0));
}
