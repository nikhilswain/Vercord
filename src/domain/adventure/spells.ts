/** One set of progression, combat and HUD rules for every adventure. Distances are world pixels. */
export const SPELL_DEFINITIONS = {
  fire: {
    name: 'Ember',
    key: '1',
    unlockLevel: 15,
    cooldown: 120,
    speed: 330,
    range: 192,
    freeze: 0,
  },
  water: {
    name: 'Tide',
    key: '2',
    unlockLevel: 25,
    cooldown: 120,
    speed: 360,
    range: 256,
    freeze: 2,
  },
} as const;
export type SpellId = keyof typeof SPELL_DEFINITIONS;
export type SpellCooldowns = Record<SpellId, number>;
export function sanitizeSpellCooldowns(value: unknown): SpellCooldowns {
  const saved = value && typeof value === 'object' ? (value as Partial<SpellCooldowns>) : {};
  const remaining = (id: SpellId) =>
    typeof saved[id] === 'number' && Number.isFinite(saved[id])
      ? Math.max(0, Math.min(SPELL_DEFINITIONS[id].cooldown, saved[id]!))
      : 0;
  return { fire: remaining('fire'), water: remaining('water') };
}
/** Both spells have equal impact power. Neither adds hidden damage over time. */
export function spellDamage(level: number, weaponBonus: number): number {
  return 100 + Math.max(0, level - 15) * 4 + weaponBonus;
}
export function spellTimeLabel(seconds: number): string {
  const rounded = Math.ceil(Math.max(0, seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

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
