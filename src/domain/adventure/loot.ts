import type { CreatureKind } from './enemies';
import type { ItemId, ItemStack } from './inventory';
import { wildlifeDefinition } from './wildlife';

export interface GroundLoot {
  id: string;
  sourceId: string;
  itemId: ItemId;
  quantity: number;
  x: number;
  y: number;
}

/** Small guaranteed rewards for the first supply loop. Rare story rewards stay authored. */
const HOSTILE_LOOT = {
  slime: [{ id: 'slime-resin', quantity: 1 }],
  'forest-skirmisher': [{ id: 'emberleaf', quantity: 1 }],
  'forest-brute': [{ id: 'emberleaf', quantity: 2 }],
  'venus-trap': [{ id: 'thornseed', quantity: 1 }],
  'blue-death': [{ id: 'spark-pollen', quantity: 1 }],
  guardian: [{ id: 'thornseed', quantity: 3 }],
  'root-beast': [{ id: 'thornseed', quantity: 3 }],
  bear: [
    { id: 'raw-meat', quantity: 4 },
    { id: 'wild-hide', quantity: 2 },
  ],
  snake: [{ id: 'raw-meat', quantity: 1 }],
} as const satisfies Partial<Record<CreatureKind, readonly ItemStack[]>>;

export function creatureLoot(kind: CreatureKind): readonly ItemStack[] {
  return (
    wildlifeDefinition(kind)?.loot ??
    HOSTILE_LOOT[kind as keyof typeof HOSTILE_LOOT] ??
    []
  ).filter((item) => item.id !== 'wild-hide' && item.id !== 'feather');
}

export const LOOT_PICKUP_RADIUS = 64;
export const groundLootId = (sourceId: string, index: number) => `${sourceId}:loot:${index}`;

/** v1 pending pickups keep the old source policy and claim index during migration. */
export function legacyCreatureLoot(kind: CreatureKind): readonly ItemStack[] {
  const wildlife = wildlifeDefinition(kind);
  if (wildlife) return wildlife.loot;
  if (kind === 'forest-skirmisher') return [{ id: 'trailcloth', quantity: 1 }];
  if (kind === 'forest-brute') return [{ id: 'trailcloth', quantity: 2 }];
  if (kind === 'venus-trap' || kind === 'blue-death') return [{ id: 'healing-herb', quantity: 1 }];
  if (kind === 'guardian') return [{ id: 'healing-herb', quantity: 2 }];
  if (kind === 'root-beast') return [{ id: 'healing-herb', quantity: 3 }];
  return HOSTILE_LOOT[kind as keyof typeof HOSTILE_LOOT] ?? [];
}
