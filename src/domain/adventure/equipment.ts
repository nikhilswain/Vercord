import { levelForExperience } from './progression';
import {
  DEFAULT_WEAPON_ID,
  STARTER_WEAPON_IDS,
  getWeaponDefinition,
  type WeaponId,
} from './weapons';

/** Serializable shared state. Storage and authority are supplied by the consuming world. */
export interface PlayerProgression {
  readonly version: 1;
  readonly experience: number;
  readonly ownedWeaponIds: readonly WeaponId[];
  readonly equippedWeaponId: WeaponId;
}

export interface EquipmentPolicy {
  readonly requireOwnership: boolean;
  readonly requireLevel: boolean;
}

export const NORMAL_EQUIPMENT_POLICY: Readonly<EquipmentPolicy> = Object.freeze({
  requireOwnership: true,
  requireLevel: true,
});

/** Explicit sandbox override: known IDs still apply, and neither ownership nor XP is granted. */
export const DEMO_EQUIPMENT_POLICY: Readonly<EquipmentPolicy> = Object.freeze({
  requireOwnership: false,
  requireLevel: false,
});

export type EquipWeaponResult =
  | { success: true; profile: PlayerProgression }
  | { success: false; reason: 'unknown' | 'unowned' | 'level' };

export function createPlayerProgression(): PlayerProgression {
  return {
    version: 1,
    experience: 0,
    ownedWeaponIds: [...STARTER_WEAPON_IDS],
    equippedWeaponId: DEFAULT_WEAPON_ID,
  };
}

export function equipWeapon(
  profile: PlayerProgression,
  id: string,
  policy: EquipmentPolicy = NORMAL_EQUIPMENT_POLICY,
): EquipWeaponResult {
  const weapon = getWeaponDefinition(id);
  if (!weapon) return { success: false, reason: 'unknown' };
  if (policy.requireOwnership && !profile.ownedWeaponIds.includes(weapon.id)) {
    return { success: false, reason: 'unowned' };
  }
  if (policy.requireLevel && levelForExperience(profile.experience) < weapon.unlockLevel) {
    return { success: false, reason: 'level' };
  }
  return { success: true, profile: { ...profile, equippedWeaponId: weapon.id } };
}

function normalizeExperience(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value)))
    : 0;
}

/** Rewards never reduce XP or allow non-finite/unsafe stored numbers. */
export function grantExperience(profile: PlayerProgression, amount: number): PlayerProgression {
  if (!Number.isFinite(amount) || amount <= 0) return profile;
  const experience = Math.min(
    Number.MAX_SAFE_INTEGER,
    normalizeExperience(profile.experience) + Math.floor(amount),
  );
  return { ...profile, experience };
}

/** Owning a reward does not equip it or bypass its level requirement. */
export function grantWeapon(profile: PlayerProgression, id: string): PlayerProgression {
  const weapon = getWeaponDefinition(id);
  if (!weapon || profile.ownedWeaponIds.includes(weapon.id)) return profile;
  return { ...profile, ownedWeaponIds: [...profile.ownedWeaponIds, weapon.id] };
}

/**
 * Validate parsed storage data before use. Unsupported versions start fresh.
 * Only known weapons survive; every starter remains owned, and equipped items
 * must satisfy the explicitly selected policy. This does not establish server authority.
 */
export function sanitizePlayerProgression(
  value: unknown,
  policy: EquipmentPolicy = NORMAL_EQUIPMENT_POLICY,
): PlayerProgression {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createPlayerProgression();
  }
  const saved = value as Record<string, unknown>;
  if (saved.version !== 1) return createPlayerProgression();
  // Also upgrades sword-only saves without changing earned weapons, XP or equipment.
  const owned = new Set<WeaponId>(STARTER_WEAPON_IDS);
  if (Array.isArray(saved.ownedWeaponIds)) {
    for (const candidate of saved.ownedWeaponIds) {
      const weapon = typeof candidate === 'string' ? getWeaponDefinition(candidate) : undefined;
      if (weapon) owned.add(weapon.id);
    }
  }
  const profile: PlayerProgression = {
    version: 1,
    experience: normalizeExperience(saved.experience),
    ownedWeaponIds: [...owned],
    equippedWeaponId: DEFAULT_WEAPON_ID,
  };
  if (typeof saved.equippedWeaponId !== 'string') return profile;
  const equipped = equipWeapon(profile, saved.equippedWeaponId, policy);
  return equipped.success ? equipped.profile : profile;
}
