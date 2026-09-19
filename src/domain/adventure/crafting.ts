import {
  getItem,
  grantItem,
  itemCount,
  takeItem,
  type InventorySnapshot,
  type ItemId,
} from './inventory';

export type StationKind = 'brew' | 'cook';
export interface Recipe {
  id: string;
  output: ItemId;
  station: StationKind;
  ingredients: readonly { alternatives: readonly ItemId[]; quantity: number }[];
  lesson?: 'verge' | 'alder-run' | 'lantern-wood';
}
export const RECIPES: readonly Recipe[] = [
  {
    id: 'healing-bottle',
    output: 'healing-bottle',
    station: 'brew',
    ingredients: [
      { alternatives: ['slime-resin'], quantity: 1 },
      { alternatives: ['healing-herb'], quantity: 1 },
    ],
  },
  {
    id: 'battle-bottle',
    output: 'battle-bottle',
    station: 'brew',
    lesson: 'verge',
    ingredients: [
      { alternatives: ['thornseed'], quantity: 1 },
      { alternatives: ['emberleaf'], quantity: 1 },
    ],
  },
  {
    id: 'swiftstep-bottle',
    output: 'swiftstep-bottle',
    station: 'brew',
    lesson: 'lantern-wood',
    ingredients: [
      { alternatives: ['spark-pollen'], quantity: 1 },
      { alternatives: ['moonblossom'], quantity: 1 },
    ],
  },
  {
    id: 'roasted-meat',
    output: 'roasted-meat',
    station: 'cook',
    ingredients: [{ alternatives: ['raw-meat', 'raw-fowl'], quantity: 1 }],
  },
  {
    id: 'pan-mushrooms',
    output: 'pan-mushrooms',
    station: 'cook',
    ingredients: [{ alternatives: ['forest-mushroom'], quantity: 1 }],
  },
  {
    id: 'mushroom-broth',
    output: 'mushroom-broth',
    station: 'cook',
    ingredients: [{ alternatives: ['forest-mushroom'], quantity: 1 }],
  },
  {
    id: 'trail-stew',
    output: 'trail-stew',
    station: 'cook',
    lesson: 'alder-run',
    ingredients: [
      { alternatives: ['raw-meat', 'raw-fowl', 'forest-mushroom'], quantity: 2 },
      { alternatives: ['rivercress'], quantity: 1 },
    ],
  },
];
export type CraftItemResult =
  | { success: true; inventory: InventorySnapshot }
  | {
      success: false;
      reason:
        'unknown-recipe' | 'ingredients' | 'full' | 'station' | 'locked' | 'quantity' | 'duplicate';
    };
export interface CraftAccess {
  station: StationKind;
  learned: readonly string[];
  quantity?: number;
}

/** The runtime supplies validated station access. Every ingredient/capacity check
 * precedes the commit, including mixed-meat batches and overflowing output. */
export function craftItem(
  inventory: InventorySnapshot,
  recipeId: string,
  access?: CraftAccess,
): CraftItemResult {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return { success: false, reason: 'unknown-recipe' };
  if (!access || access.station !== recipe.station) return { success: false, reason: 'station' };
  if (recipe.lesson && !access.learned.includes(recipe.id))
    return { success: false, reason: 'locked' };
  const quantity = access.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20)
    return { success: false, reason: 'quantity' };
  if (itemCount(inventory, recipe.output) + quantity > getItem(recipe.output)!.maxStack)
    return { success: false, reason: 'full' };
  let next = inventory;
  for (const ingredient of recipe.ingredients) {
    let needed = ingredient.quantity * quantity;
    for (const id of ingredient.alternatives) {
      const count = Math.min(needed, itemCount(next, id));
      if (count) next = takeItem(next, id, count)!;
      needed -= count;
    }
    if (needed) return { success: false, reason: 'ingredients' };
  }
  return { success: true, inventory: grantItem(next, recipe.output, quantity) };
}
