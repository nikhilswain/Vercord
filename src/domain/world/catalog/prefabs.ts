/** Supported geometry modules; theme packs may select these but cannot invent an adapter. */
export const SETTLEMENT_PREFAB_IDS = [
  'hall',
  'brick',
  'paneled',
  'grove',
  'garden',
  'vault',
  'longhouse',
  'cottage',
  'smithy',
  'runes',
  'landing',
] as const;
export type WorldPrefabId = (typeof SETTLEMENT_PREFAB_IDS)[number];
export type WorldHousePrefabId = Extract<
  WorldPrefabId,
  'hall' | 'brick' | 'paneled' | 'longhouse' | 'cottage' | 'smithy'
>;
