import type { RpgDirection } from './types';
import type { RpgMeleeStyle, RpgMeleeWeapon } from './melee-assets';

export interface RpgWeaponVisual {
  readonly id: string;
  readonly texture: string;
  readonly imageUrl: string;
  /** Handle contact and blade/head direction, measured in the original 128px inventory image. */
  readonly grip: readonly [number, number];
  readonly tip: readonly [number, number];
  readonly scale: number;
}

const visual = (
  family: RpgMeleeWeapon,
  tier: number,
  grip: readonly [number, number],
  tip: readonly [number, number],
  scale: number,
): RpgWeaponVisual => ({
  id: `${family}-${tier}`,
  texture: `rpg-equipped-${family}-${tier}`,
  imageUrl: `/game-assets/weapon-demo/${family}-${tier}.png`,
  grip,
  tip,
  scale,
});

/** Exact inventory artwork, including each item's own colors, ornaments and silhouette. */
export const RPG_WEAPON_VISUALS: readonly RpgWeaponVisual[] = [
  visual('sword', 0, [94, 29], [10, 118], 0.34),
  visual('sword', 1, [94, 28], [12, 118], 0.34),
  visual('sword', 2, [94, 29], [12, 118], 0.34),
  visual('sword', 3, [94, 29], [12, 118], 0.34),
  visual('sword', 4, [94, 28], [12, 118], 0.34),
  visual('sword', 5, [94, 28], [12, 118], 0.34),
  visual('axe', 0, [65, 89], [68, 26], 0.45),
  visual('axe', 1, [64, 90], [69, 27], 0.45),
  visual('axe', 2, [64, 90], [67, 28], 0.45),
  visual('axe', 3, [64, 91], [67, 26], 0.45),
  visual('axe', 4, [65, 91], [70, 27], 0.45),
  visual('axe', 5, [65, 91], [69, 27], 0.45),
  visual('spear', 0, [37, 88], [116, 12], 0.48),
  visual('spear', 1, [41, 86], [116, 12], 0.48),
  visual('spear', 2, [44, 86], [115, 12], 0.48),
  visual('spear', 3, [44, 86], [115, 12], 0.48),
  visual('spear', 4, [42, 86], [116, 12], 0.48),
  visual('spear', 5, [43, 86], [116, 12], 0.48),
  visual('staff', 0, [57, 87], [71, 15], 0.51),
  visual('staff', 1, [64, 86], [64, 17], 0.51),
  visual('staff', 2, [64, 86], [64, 17], 0.51),
  visual('staff', 3, [64, 87], [64, 18], 0.51),
  visual('staff', 4, [64, 87], [64, 17], 0.51),
  visual('staff', 5, [63, 87], [64, 18], 0.51),
];

const FAMILY_OFFSET: Readonly<Record<RpgMeleeWeapon, number>> = {
  sword: 0,
  axe: 6,
  spear: 12,
  staff: 18,
};

export function getRpgWeaponVisual(family: RpgMeleeWeapon, tier: number): RpgWeaponVisual {
  const level = Number.isFinite(tier) ? Math.max(0, Math.min(5, Math.floor(tier))) : 0;
  return RPG_WEAPON_VISUALS[FAMILY_OFFSET[family] + level]!;
}

export interface RpgWeaponHandPose {
  /** Coordinates in the same 64px authored body cell used by all traveler layers. */
  readonly x: number;
  readonly y: number;
  /** Blade/head direction in screen degrees: right=0, down=90. */
  readonly angle: number;
  readonly behind: boolean;
  readonly fingers: boolean;
  readonly secondHand?: readonly [number, number];
}

const hand = (
  x: number,
  y: number,
  angle: number,
  behind = false,
  fingers = true,
  secondHand?: readonly [number, number],
): RpgWeaponHandPose => ({ x, y, angle, behind, fingers, secondHand });

/**
 * Wrist positions calibrated against the native six-layer slash/thrust cells.
 * The up-facing windup hand is hidden by the torso/head; its weapon renders behind.
 * Positions advance only with the body frame, so a weapon cannot orbit an idle traveler.
 */
export const RPG_WEAPON_HAND_POSES: Readonly<
  Record<RpgMeleeStyle, Readonly<Record<RpgDirection, readonly RpgWeaponHandPose[]>>>
> = {
  slash: {
    up: [
      hand(42, 48, 220, true),
      hand(37, 41, 180, true, false),
      hand(33, 36, 135, true, false),
      hand(39, 34, 270, true, false),
      hand(50, 33, 315, true),
      hand(54, 36, 360, true),
    ],
    left: [
      hand(24, 48, 145, true),
      hand(21, 50, -35),
      hand(24, 49, -80),
      hand(15, 45, -180),
      hand(12, 33, -205),
      hand(15, 32, -235),
    ],
    down: [
      hand(42, 48, 150),
      hand(37, 47, 180),
      hand(29, 48, 225),
      hand(39, 48, 90),
      hand(51, 44, 45),
      hand(55, 40, 0),
    ],
    right: [
      hand(37, 47, 35, true, false),
      hand(43, 50, 215),
      hand(40, 49, 260),
      hand(49, 45, 360),
      hand(52, 33, 385),
      hand(49, 32, 415),
    ],
  },
  thrust: {
    up: [
      hand(42, 48, 180, true),
      hand(42, 50, 205, true),
      hand(42, 46, 225, true),
      hand(40, 36, -90, true, false),
      hand(42, 32, -90, true, false),
      hand(42, 30, -90, true, false),
      hand(42, 32, -90, true, false),
      hand(40, 36, -90, true, false),
    ],
    left: [
      hand(24, 48, 200),
      hand(21, 46, 180, false, true, [36, 47]),
      hand(20, 46, 180, false, true, [37, 46]),
      hand(23, 43, 180, false, true, [39, 43]),
      hand(17, 45, 180, false, true, [29, 46]),
      hand(17, 45, 180, false, true, [29, 46]),
      hand(17, 45, 180, false, true, [29, 46]),
      hand(23, 43, 180, false, true, [39, 43]),
    ],
    down: [
      hand(42, 48, 0, false, true, [21, 48]),
      hand(36, 46, 20, false, true, [24, 44]),
      hand(30, 46, 45, false, true, [25, 44]),
      hand(27, 45, 90, false, true, [24, 40]),
      hand(27, 47, 90, false, true, [23, 43]),
      hand(27, 47, 90, false, true, [23, 43]),
      hand(27, 47, 90, false, true, [23, 43]),
      hand(27, 45, 90, false, true, [24, 40]),
    ],
    right: [
      hand(39, 48, -20),
      hand(43, 46, 0, false, true, [28, 47]),
      hand(44, 46, 0, false, true, [27, 46]),
      hand(41, 43, 0, false, true, [25, 43]),
      hand(47, 44, 0, false, true, [35, 46]),
      hand(47, 45, 0, false, true, [35, 46]),
      hand(47, 44, 0, false, true, [35, 46]),
      hand(41, 43, 0, false, true, [25, 43]),
    ],
  },
};
