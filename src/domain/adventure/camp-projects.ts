import {
  grantItem,
  itemCount,
  takeItem,
  type InventorySnapshot,
  type ItemStack,
} from './inventory';
import type { ProvisionsSnapshot } from './provisions';

export const CAMP_PROJECTS = {
  verge: {
    id: 'verge-bench',
    name: 'Restore Juniper’s brewing bench',
    description:
      'Juniper needs resin to seal the pot and Emberleaf from the raiders’ stolen supplies. Restore the bench to learn Battle Bottle and plant a small herb patch.',
    cost: [
      { id: 'slime-resin', quantity: 2 },
      { id: 'emberleaf', quantity: 1 },
    ],
    recipe: 'battle-bottle',
    gift: 'battle-bottle',
  },
  'alder-run': {
    id: 'alder-garden',
    name: 'Replant the riverside garden',
    description:
      'Set Rivercress beside the camp water barrel and seed a mushroom bed. The camp cook will teach you Trail Stew.',
    cost: [
      { id: 'rivercress', quantity: 1 },
      { id: 'forest-mushroom', quantity: 1 },
    ],
    recipe: 'trail-stew',
    gift: 'trail-stew',
  },
  'lantern-wood': {
    id: 'oren-supplies',
    name: 'Help Oren prepare for the trail',
    description:
      'Bring Spark Pollen and a Moonblossom. Oren teaches the Swiftstep formula and prepares your first bottle.',
    cost: [
      { id: 'spark-pollen', quantity: 1 },
      { id: 'moonblossom', quantity: 1 },
    ],
    recipe: 'swiftstep-bottle',
    gift: 'swiftstep-bottle',
  },
} as const;
export type CampProject = (typeof CAMP_PROJECTS)[keyof typeof CAMP_PROJECTS];
export function campProject(region: string): CampProject | undefined {
  return CAMP_PROJECTS[region as keyof typeof CAMP_PROJECTS];
}
export function completeCampProject(
  inventory: InventorySnapshot,
  state: ProvisionsSnapshot,
  region: string,
): { inventory: InventorySnapshot; state: ProvisionsSnapshot; message: string } | null {
  const project = campProject(region);
  if (
    !project ||
    state.projects.includes(project.id) ||
    project.cost.some((c: ItemStack) => itemCount(inventory, c.id) < c.quantity) ||
    itemCount(inventory, project.gift) >= 9999
  )
    return null;
  for (const cost of project.cost) inventory = takeItem(inventory, cost.id, cost.quantity)!;
  inventory = grantItem(inventory, project.gift, 1);
  return {
    inventory,
    state: {
      ...state,
      projects: [...state.projects, project.id],
      learned: [...new Set([...state.learned, project.recipe])],
    },
    message: `${project.name}: complete. Recipe learned; your first preparation is in your bag.`,
  };
}
