/** Shared gameplay balance. Presentation assets and animation playback belong to consumers. */
export const WEAPON_FAMILIES = ['sword', 'axe', 'spear', 'staff'] as const;
export type WeaponFamily = (typeof WEAPON_FAMILIES)[number];
export type WeaponTier = 0 | 1 | 2 | 3 | 4 | 5;
export type WeaponId = `${WeaponFamily}-${WeaponTier}`;

export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly family: WeaponFamily;
  readonly tier: WeaponTier;
  /** Base damage includes the weapon tier; character level does not add hidden damage. */
  readonly damage: number;
  readonly reach: number;
  readonly cooldownMs: number;
  readonly animationMs: number;
  readonly impactMs: number;
  readonly unlockLevel: number;
  readonly spellBonus: number;
}

const FAMILY_STATS = {
  sword: { damage: 17, reach: 68, cooldownMs: 680, animationMs: 540, impactMs: 270 },
  axe: { damage: 25, reach: 60, cooldownMs: 940, animationMs: 720, impactMs: 360 },
  spear: { damage: 15, reach: 94, cooldownMs: 800, animationMs: 640, impactMs: 320 },
  staff: { damage: 11, reach: 82, cooldownMs: 760, animationMs: 600, impactMs: 300 },
} as const;
const UNLOCK_LEVELS = [1, 2, 4, 7, 10, 15] as const;
const TIERS: readonly WeaponTier[] = [0, 1, 2, 3, 4, 5];

export const WEAPONS: readonly WeaponDefinition[] = WEAPON_FAMILIES.flatMap((family) =>
  TIERS.map((tier): WeaponDefinition => ({
    id: `${family}-${tier}`,
    family,
    tier,
    ...FAMILY_STATS[family],
    damage: FAMILY_STATS[family].damage + tier * 8,
    unlockLevel: UNLOCK_LEVELS[tier],
    spellBonus: family === 'staff' ? 3 + tier * 3 : 0,
  })),
);

export const DEFAULT_WEAPON_ID: WeaponId = 'sword-0';
/** Every fighting style is available from the beginning; later tiers must be earned. */
export const STARTER_WEAPON_IDS: readonly WeaponId[] = WEAPONS.filter(
  (weapon) => weapon.tier === 0,
).map((weapon) => weapon.id);

/** Unknown IDs stay unknown at the gameplay boundary; adapters may provide visual fallbacks. */
export function getWeaponDefinition(id: string): WeaponDefinition | undefined {
  return WEAPONS.find((weapon) => weapon.id === id);
}

export function weaponDamage(weapon: WeaponDefinition): number {
  return weapon.damage;
}

export function weaponSpellBonus(weapon: WeaponDefinition): number {
  return weapon.spellBonus;
}
