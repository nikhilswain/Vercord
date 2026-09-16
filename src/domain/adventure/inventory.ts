/** Shared, serializable backpack rules. Worlds own persistence and authority. */
export type ItemCategory = 'food' | 'materials' | 'quest';
export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  source: string;
  maxStack: number;
  heal?: number;
  requiresCooking?: boolean;
}

export const ITEMS = {
  'healing-herb': {
    id: 'healing-herb',
    name: 'Healing herb',
    category: 'food',
    description: 'A fragrant bundle of forest herbs. Restores 40 health.',
    source: 'Gather golden flowers or open supply chests.',
    maxStack: 9999,
    heal: 40,
  },
  'raw-meat': {
    id: 'raw-meat',
    name: 'Raw meat',
    category: 'food',
    description:
      'Fresh meat from forest wildlife. Keep it for a meal at camp once cooking is available.',
    source: 'Hunt rabbits, deer, foxes, boars, wolves or bears.',
    maxStack: 9999,
    requiresCooking: true,
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
      'A pale woodland flower collected along the trail. Save it for future recipes and collections.',
    source: 'Gather pale flowers in the forest.',
    maxStack: 9999,
  },
  'wild-hide': {
    id: 'wild-hide',
    name: 'Wild hide',
    category: 'materials',
    description: 'A sturdy hide. A crafting material to save for later.',
    source: 'Hunt boars, wolves or bears.',
    maxStack: 9999,
  },
  feather: {
    id: 'feather',
    name: 'Forest feather',
    category: 'materials',
    description: 'A small woodland feather. A keepsake for your collection.',
    source: 'Hunt forest birds.',
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
} as const satisfies Record<string, ItemDefinition>;

export type ItemId = keyof typeof ITEMS;
export interface ItemStack {
  id: ItemId;
  quantity: number;
}
export interface InventorySnapshot {
  version: 1;
  stacks: readonly ItemStack[];
}
export const ITEM_CATALOG: readonly ItemDefinition[] = Object.values(ITEMS);

export function getItem(id: string): ItemDefinition | undefined {
  return Object.hasOwn(ITEMS, id) ? ITEMS[id as ItemId] : undefined;
}
export function itemCount(inventory: InventorySnapshot, id: string): number {
  return inventory.stacks.find((stack) => stack.id === id)?.quantity ?? 0;
}
export function createInventory(): InventorySnapshot {
  return { version: 1, stacks: [{ id: 'healing-herb', quantity: 1 }] };
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
  if (!getItem(id) || !Number.isSafeInteger(quantity) || quantity <= 0 || count < quantity)
    return null;
  return {
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
  let inventory: InventorySnapshot = { version: 1, stacks: [] };
  for (const stack of value.stacks) {
    if (stack && typeof stack === 'object' && typeof stack.id === 'string')
      inventory = grantItem(inventory, stack.id, stack.quantity);
  }
  return inventory;
}
export type UseItemResult =
  | { success: true; inventory: InventorySnapshot; health: number; restored: number }
  | { success: false; reason: 'missing' | 'cooking' | 'not-consumable' | 'full-health' };
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
