import type Phaser from 'phaser';
import { RPG_WEAPON_VISUALS } from './weapon-visuals';

export type RpgMeleeStyle = 'slash' | 'thrust';
export type RpgMeleeWeapon = 'sword' | 'axe' | 'spear' | 'staff';
export interface RpgMeleePose {
  elapsedMs: number;
  style: RpgMeleeStyle;
  weapon: RpgMeleeWeapon;
  tier: number;
}

/** Native LPC body frames and the equipped item's hand transforms share this clock. */
export const RPG_MELEE_ANIMATION = {
  slash: { frames: 6, frameMs: 90, durationMs: 540, releaseMs: 270 },
  thrust: { frames: 8, frameMs: 80, durationMs: 640, releaseMs: 320 },
} as const;
export const RPG_MELEE_WEAPONS: readonly RpgMeleeWeapon[] = ['sword', 'axe', 'spear', 'staff'];
export const RPG_MELEE_WEAPON_STYLE: Record<RpgMeleeWeapon, RpgMeleeStyle> = {
  sword: 'slash',
  axe: 'slash',
  spear: 'thrust',
  staff: 'thrust',
};

export function preloadRpgMeleeWeapons(scene: Phaser.Scene): void {
  for (const visual of RPG_WEAPON_VISUALS)
    if (!scene.textures.exists(visual.texture)) scene.load.image(visual.texture, visual.imageUrl);
}
