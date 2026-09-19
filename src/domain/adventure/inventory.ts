/** Shared, serializable backpack rules. Worlds own persistence and authority. */
export type ItemCategory = 'food' | 'materials' | 'quest' | 'tools';
export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  source: string;
  maxStack: number;
  heal?: number;
  healFraction?: number;
  benefit?: 'battle' | 'swiftstep' | 'meal';
  vitality?: number;
  duration?: number;
  /** Plain food heals after eating, with no buff or recovery cooldown. */
  plainFood?: boolean;
  requiresCooking?: boolean;
  permanent?: boolean;
  activation?: 'return-town';
}

export const ITEMS = {
  'hearth-stone': {
    id: 'hearth-stone',
    name: 'Hearthstone',
    category: 'tools',
    description:
      'A waystone bound to your town. Press G to return from anywhere, even during a fight. Reusable; always equipped.',
    source: 'Carried by every traveler. Cannot be consumed or unequipped.',
    maxStack: 1,
    permanent: true,
    activation: 'return-town',
  },
  'healing-herb': {
    id: 'healing-herb',
    name: 'Healing herb',
    category: 'food',
    description:
      'Restores 40 HP. Brew with Slime Resin for a stronger Healing Bottle. Shares a 20-second recovery cooldown with bottles.',
    source: 'Gather the broad-leaved medicinal plants along woodland trails and at camp.',
    maxStack: 9999,
    heal: 40,
  },
  'raw-meat': {
    id: 'raw-meat',
    name: 'Raw meat',
    category: 'food',
    description:
      'Cook at a hearth for Roasted Meat or Trail Stew. Meals restore health and temporarily increase maximum HP.',
    source: 'Hunt rabbits, deer, foxes, boars, wolves or bears.',
    maxStack: 9999,
    requiresCooking: true,
  },
  'slime-resin': {
    id: 'slime-resin',
    name: 'Slime Resin',
    category: 'materials',
    description:
      'Used for: Healing Bottle. Brew one resin with one Healing Herb to restore 70% of maximum HP.',
    source: 'Defeat any slime, then collect its drop with F.',
    maxStack: 9999,
  },
  trailcloth: {
    id: 'trailcloth',
    name: 'Trailcloth',
    category: 'materials',
    description: 'Legacy supply. Converted to Emberleaf when your inventory is loaded.',
    source: 'Retired supply; no longer dropped.',
    maxStack: 9999,
  },
  'resin-wrap': {
    id: 'resin-wrap',
    name: 'Resin Wrap',
    category: 'food',
    description: 'A cloth dressing sealed with forest resin. Restores 40 health.',
    source: 'Legacy supply, converted to a Healing Bottle when your inventory is loaded.',
    maxStack: 9999,
    heal: 40,
  },
  'raw-fowl': {
    id: 'raw-fowl',
    name: 'Raw fowl',
    category: 'food',
    description: 'A small cut of bird meat. Needs cooking before it can restore health.',
    source: 'Hunt forest birds.',
    maxStack: 9999,
    requiresCooking: true,
  },
  moonblossom: {
    id: 'moonblossom',
    name: 'Moonblossom',
    category: 'materials',
    description:
      'Used for: Swiftstep Bottle. Combine with Spark Pollen for 25% faster movement for 3 minutes.',
    source: 'Gather pale flowers near forest pools and clearings.',
    maxStack: 9999,
  },
  'wild-hide': {
    id: 'wild-hide',
    name: 'Wild hide',
    category: 'materials',
    description: 'A sturdy hide kept from an earlier expedition. Save it for future camp projects.',
    source: 'Preserved supplies; no longer a routine hunting drop.',
    maxStack: 9999,
  },
  feather: {
    id: 'feather',
    name: 'Forest feather',
    category: 'materials',
    description: 'A small woodland feather. A keepsake for your collection.',
    source: 'Preserved supplies; no longer a routine hunting drop.',
    maxStack: 9999,
  },
  'mira-notes': {
    id: 'mira-notes',
    name: 'Mira’s field notes',
    category: 'quest',
    description:
      'The recovered account of the Hollow Choir. Return these pages to Mira at the southern temple camp.',
    source: 'The west reliquary in the sanctuary.',
    maxStack: 1,
  },
  'healing-bottle': {
    id: 'healing-bottle',
    name: 'Healing Bottle',
    category: 'tools',
    maxStack: 9999,
    healFraction: 0.7,
    description: 'Restores 70% of maximum HP. Shares a 20-second recovery cooldown with herbs.',
    source: 'Brew 1 Slime Resin + 1 Healing Herb at a brewing bench.',
  },
  'battle-bottle': {
    id: 'battle-bottle',
    name: 'Battle Bottle',
    category: 'tools',
    maxStack: 9999,
    benefit: 'battle',
    duration: 180,
    description: '+20% weapon and spell damage for 3 minutes. Replaces Swiftstep.',
    source: 'Brew 1 Thornseed + 1 Emberleaf. Learn the recipe at the Verge camp.',
  },
  'swiftstep-bottle': {
    id: 'swiftstep-bottle',
    name: 'Swiftstep Bottle',
    category: 'tools',
    maxStack: 9999,
    benefit: 'swiftstep',
    duration: 180,
    description: '+25% walking and running speed for 3 minutes. Replaces Battle.',
    source: 'Brew 1 Spark Pollen + 1 Moonblossom. Learn the recipe at Lantern Wood camp.',
  },
  thornseed: {
    id: 'thornseed',
    name: 'Thornseed',
    category: 'materials',
    maxStack: 9999,
    description: 'Used for: Battle Bottle → +20% damage for 3 minutes.',
    source: 'Venus traps drop 1; forest guardians and Root Beasts drop 3. Collect with F.',
  },
  emberleaf: {
    id: 'emberleaf',
    name: 'Emberleaf',
    category: 'materials',
    maxStack: 9999,
    description: 'Used for: Battle Bottle. A warm, aromatic leaf from sunny clearings.',
    source: 'Skirmishers carry 1 stolen sprig; brutes carry 2. Also gather in clearings.',
  },
  'spark-pollen': {
    id: 'spark-pollen',
    name: 'Spark Pollen',
    category: 'materials',
    maxStack: 9999,
    description: 'Used for: Swiftstep Bottle → +25% movement speed for 3 minutes.',
    source: 'Blue Death flowers drop 1. Collect with F.',
  },
  'forest-mushroom': {
    id: 'forest-mushroom',
    name: 'Forest Mushroom',
    category: 'food',
    maxStack: 9999,
    requiresCooking: true,
    description:
      'Cook Pan Mushrooms for vitality, Mushroom Broth for plain healing, or use 2 in a vegetarian Trail Stew.',
    source: 'Gather under trees and around fallen wood; also grows at forest camps.',
  },
  rivercress: {
    id: 'rivercress',
    name: 'Rivercress',
    category: 'materials',
    maxStack: 9999,
    description: 'Used for: Trail Stew → 40 HP and +20% maximum HP for 5 minutes.',
    source: 'Gather beside forest water and in the Alder Run camp garden.',
  },
  'roasted-meat': {
    id: 'roasted-meat',
    name: 'Roasted Meat',
    category: 'food',
    maxStack: 9999,
    heal: 25,
    benefit: 'meal',
    vitality: 0.1,
    duration: 300,
    description:
      'Restores 25 HP and adds 10% maximum HP for 5 minutes. Eat for 4 seconds outside combat. Wait until your current meal ends before eating another buff meal.',
    source: 'Cook 1 Raw Meat or 1 Raw Fowl at a hearth.',
  },
  'pan-mushrooms': {
    id: 'pan-mushrooms',
    name: 'Pan Mushrooms',
    category: 'food',
    maxStack: 9999,
    heal: 25,
    benefit: 'meal',
    vitality: 0.1,
    duration: 180,
    description:
      'Restores 25 HP and adds 10% maximum HP for 3 minutes. A lighter meal without hunting. Eat outside combat, when no other meal is active.',
    source: 'Cook 1 Forest Mushroom at a hearth.',
  },
  'trail-stew': {
    id: 'trail-stew',
    name: 'Trail Stew',
    category: 'food',
    maxStack: 9999,
    heal: 40,
    benefit: 'meal',
    vitality: 0.2,
    duration: 300,
    description:
      'Restores 40 HP and adds 20% maximum HP for 5 minutes. Eat outside combat, when no other meal is active.',
    source: 'Cook 2 meat/fowl or 2 Forest Mushrooms + 1 Rivercress. Learn at Alder Run camp.',
  },
  'mushroom-broth': {
    id: 'mushroom-broth',
    name: 'Mushroom Broth',
    category: 'food',
    maxStack: 9999,
    heal: 25,
    plainFood: true,
    description:
      'Restores 25 HP. No buff, no cooldown. Eat outside combat; moving or taking a hit interrupts eating without spending the food.',
    source: 'Cook 1 Forest Mushroom at any hearth. No recipe discovery needed.',
  },
} as const satisfies Record<string, ItemDefinition>;

export type ItemId = keyof typeof ITEMS;
export interface ItemStack {
  id: ItemId;
  quantity: number;
}
export interface InventorySnapshot {
  version: 1;
  stacks: readonly ItemStack[];
  /** Catalog upgrade, independent of the backpack wire format. */
  catalogVersion?: 2;
  overflow?: readonly ItemStack[];
}
export const ITEM_CATALOG: readonly ItemDefinition[] = Object.values(ITEMS);

export function getItem(id: string): ItemDefinition | undefined {
  return Object.hasOwn(ITEMS, id) ? ITEMS[id as ItemId] : undefined;
}
export function itemCount(inventory: InventorySnapshot, id: string): number {
  return inventory.stacks.find((stack) => stack.id === id)?.quantity ?? 0;
}
export function createInventory(): InventorySnapshot {
  return {
    version: 1,
    catalogVersion: 2,
    stacks: [
      { id: 'hearth-stone', quantity: 1 },
      { id: 'healing-herb', quantity: 1 },
    ],
  };
}
export function grantItem(
  inventory: InventorySnapshot,
  id: string,
  quantity: number,
): InventorySnapshot {
  const item = getItem(id);
  if (!item || !Number.isSafeInteger(quantity) || quantity <= 0) return inventory;
  const count = Math.min(item.maxStack, itemCount(inventory, id) + quantity);
  return {
    ...inventory,
    version: 1,
    stacks: [
      ...inventory.stacks.filter((stack) => stack.id !== id),
      { id: id as ItemId, quantity: count },
    ],
  };
}
/** Insufficient quantities never partially consume a recipe or quest hand-in. */
export function takeItem(
  inventory: InventorySnapshot,
  id: string,
  quantity: number,
): InventorySnapshot | null {
  const count = itemCount(inventory, id);
  if (
    !getItem(id) ||
    getItem(id)?.permanent ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    count < quantity
  )
    return null;
  return {
    ...inventory,
    version: 1,
    stacks: inventory.stacks.flatMap((stack) =>
      stack.id !== id
        ? [{ ...stack }]
        : count > quantity
          ? [{ ...stack, quantity: count - quantity }]
          : [],
    ),
  };
}
export function sanitizeInventory(value: unknown): InventorySnapshot {
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('stacks' in value) ||
    !Array.isArray(value.stacks)
  )
    return createInventory();
  // Upgrade valid older saves too, without replacing supplies or restoring spent herbs.
  let inventory: InventorySnapshot = {
    version: 1,
    catalogVersion: 2,
    stacks: [{ id: 'hearth-stone', quantity: 1 }],
  };
  const overflow: ItemStack[] = [];
  const pending = 'overflow' in value && Array.isArray(value.overflow) ? value.overflow : [];
  for (const stack of [...value.stacks, ...pending]) {
    if (
      !stack ||
      typeof stack !== 'object' ||
      typeof stack.id !== 'string' ||
      !Number.isSafeInteger(stack.quantity) ||
      stack.quantity <= 0
    )
      continue;
    const id = migrateItemId(stack.id);
    const item = getItem(id);
    if (!item || item.permanent) continue;
    const room = item.maxStack - itemCount(inventory, id);
    inventory = grantItem(inventory, id, Math.min(room, stack.quantity));
    if (stack.quantity > room) overflow.push({ id: id as ItemId, quantity: stack.quantity - room });
  }
  if (overflow.length) inventory = { ...inventory, overflow };
  return inventory;
}
export function migrateItemId(id: string): string {
  return id === 'trailcloth' ? 'emberleaf' : id === 'resin-wrap' ? 'healing-bottle' : id;
}
export type UseItemResult =
  | {
      success: true;
      inventory: InventorySnapshot;
      health: number;
      restored: number;
      pending?: boolean;
    }
  | {
      success: false;
      reason:
        | 'missing'
        | 'cooking'
        | 'not-consumable'
        | 'full-health'
        | 'cooldown'
        | 'busy'
        | 'combat'
        | 'already-active'
        | 'meal-active'
        | 'adventure-only';
    };
export function consumeItem(
  inventory: InventorySnapshot,
  id: string,
  health: number,
  maxHealth: number,
): UseItemResult {
  const item = getItem(id);
  if (!item || itemCount(inventory, id) === 0) return { success: false, reason: 'missing' };
  if (item.requiresCooking) return { success: false, reason: 'cooking' };
  if (!item.heal) return { success: false, reason: 'not-consumable' };
  if (!Number.isFinite(health) || !Number.isFinite(maxHealth) || health >= maxHealth || health < 0)
    return { success: false, reason: 'full-health' };
  const restored = Math.min(item.heal, maxHealth - health);
  return {
    success: true,
    inventory: takeItem(inventory, id, 1)!,
    health: health + restored,
    restored,
  };
}
