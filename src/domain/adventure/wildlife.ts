import type { ItemStack } from './inventory';
import type { EnemyDefinition } from './enemies';

export type WildlifeKind =
  | 'wild-bird'
  | 'wild-rabbit'
  | 'wild-fox'
  | 'wild-wolf'
  | 'wild-boar'
  | 'wild-deer'
  | 'wild-stag'
  | 'wild-bear';
export interface WildlifeDefinition {
  temperament: 'timid' | 'defensive';
  fleeRadius: number;
  roamRadius: number;
  loot: readonly ItemStack[];
  combat: Readonly<EnemyDefinition>;
}
function animal(
  name: string,
  health: number,
  speed: number,
  damage: number,
  temperament: WildlifeDefinition['temperament'],
  meat: number,
  hide = 0,
  durationMs = 600,
  impactMs = 300,
): WildlifeDefinition {
  return {
    temperament,
    fleeRadius: temperament === 'timid' ? 115 : 0,
    roamRadius: 80,
    loot: [
      { id: 'raw-meat', quantity: meat },
      ...(hide ? [{ id: 'wild-hide' as const, quantity: hide }] : []),
    ],
    combat: {
      name,
      health,
      speed,
      damage,
      reach: 60,
      aggro: 180,
      windupMs: 400,
      impactMs,
      durationMs,
      recoveryMs: 1050,
      lungeSpeed: 110,
      lungeMs: 180,
      hitRadius: 36,
      xp: 0,
    },
  };
}
export const WILDLIFE: Readonly<Record<WildlifeKind, WildlifeDefinition>> = {
  'wild-bird': {
    ...animal('Woodland bird', 12, 100, 0, 'timid', 1),
    loot: [
      { id: 'raw-fowl', quantity: 1 },
      { id: 'feather', quantity: 1 },
    ],
  },
  'wild-rabbit': animal('Rabbit', 22, 92, 0, 'timid', 1),
  'wild-deer': animal('Doe', 50, 100, 0, 'timid', 2),
  'wild-stag': animal('Stag', 65, 95, 0, 'timid', 3),
  'wild-fox': animal('Fox', 35, 90, 0, 'timid', 1),
  'wild-boar': animal('Wild boar', 80, 76, 14, 'defensive', 2, 1, 600, 360),
  'wild-wolf': animal('Wolf', 75, 88, 16, 'defensive', 2, 1, 600, 360),
  'wild-bear': animal('Brown bear', 140, 60, 23, 'defensive', 4, 2, 720, 360),
};
export function wildlifeDefinition(kind: string): WildlifeDefinition | undefined {
  return Object.hasOwn(WILDLIFE, kind) ? WILDLIFE[kind as WildlifeKind] : undefined;
}
