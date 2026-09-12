import type Phaser from 'phaser';

export type RpgMeleeStyle = 'slash' | 'thrust';
export type RpgMeleeWeapon = 'sword' | 'axe' | 'spear' | 'staff';
export interface RpgMeleePose {
  elapsedMs: number;
  style: RpgMeleeStyle;
  weapon: RpgMeleeWeapon;
  tier: number;
}

/** Native LPC body and held-weapon frames share this clock. */
export const RPG_MELEE_ANIMATION = {
  slash: { frames: 6, frameMs: 90, durationMs: 540, releaseMs: 270 },
  thrust: { frames: 8, frameMs: 80, durationMs: 640, releaseMs: 320 },
} as const;
export const RPG_MELEE_WEAPONS: readonly RpgMeleeWeapon[] = ['sword', 'axe', 'spear', 'staff'];
export const RPG_MELEE_WEAPON_FRAME_SIZE = 192;
export const RPG_MELEE_WEAPON_ORIGIN_Y = (64 + 62) / RPG_MELEE_WEAPON_FRAME_SIZE;
export const RPG_MELEE_WEAPON_STYLE: Record<RpgMeleeWeapon, RpgMeleeStyle> = {
  sword: 'slash',
  axe: 'slash',
  spear: 'thrust',
  staff: 'thrust',
};

export function rpgMeleeWeaponTexture(weapon: RpgMeleeWeapon, layer: 'front' | 'behind'): string {
  return `rpg-melee-${weapon}-${layer}`;
}

/** Zero-based equipment tiers: practice, wood, iron, bronze, silver, gold. */
export function rpgMeleeWeaponTint(tier: number): number {
  return (
    [0xbab2a1, 0xc3986e, 0xcbd2d7, 0xdca56e, 0xe3f0ff, 0xffda81][
      Math.max(0, Math.min(5, Math.floor(tier)))
    ] ?? 0xffffff
  );
}

export function preloadRpgMeleeWeapons(scene: Phaser.Scene): void {
  for (const weapon of RPG_MELEE_WEAPONS)
    for (const layer of ['front', 'behind'] as const) {
      const key = rpgMeleeWeaponTexture(weapon, layer);
      if (scene.textures.exists(key)) continue;
      scene.load.spritesheet(key, `/game-assets/lpc-weapons/${weapon}-${layer}.png`, {
        frameWidth: RPG_MELEE_WEAPON_FRAME_SIZE,
        frameHeight: RPG_MELEE_WEAPON_FRAME_SIZE,
      });
    }
}
