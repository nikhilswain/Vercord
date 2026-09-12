import {
  DEFAULT_WEAPON_ID,
  getWeaponDefinition,
  type WeaponDefinition as GameplayWeaponDefinition,
} from '../../../domain/adventure/weapons';
import { WEAPON_ITEM_ASSETS } from './weapon-assets';

export { DEFAULT_WEAPON_ID } from '../../../domain/adventure/weapons';
export type { WeaponFamily } from '../../../domain/adventure/weapons';

/** Inventory presentation layered over shared world equipment balance. */
export interface WeaponDefinition extends GameplayWeaponDefinition {
  name: string;
  imageUrl: string;
}

export const DEMO_WEAPONS: readonly WeaponDefinition[] = WEAPON_ITEM_ASSETS.map((asset) => {
  const definition = getWeaponDefinition(asset.id);
  if (!definition) throw new Error(`Inventory artwork has no weapon definition: ${asset.id}`);
  return { ...definition, name: asset.name, imageUrl: asset.imageUrl };
});

export function getDemoWeapon(id: string): WeaponDefinition {
  return (
    DEMO_WEAPONS.find((item) => item.id === id) ??
    DEMO_WEAPONS.find((item) => item.id === DEFAULT_WEAPON_ID)!
  );
}
