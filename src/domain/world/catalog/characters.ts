/** Asset sources are shared across outfits; tinting never duplicates a spritesheet. */
export const RPG_CHARACTER_LAYERS = ['body', 'head', 'pants', 'shirt', 'boots', 'hair'] as const;
export type RpgCharacterLayer = (typeof RPG_CHARACTER_LAYERS)[number];
export interface RpgCharacterLayerSource {
  source: string;
  tint?: number;
}
export interface RpgCharacterDefinition {
  id: string;
  name: string;
  portraitUrl: string;
  layers: Readonly<Record<RpgCharacterLayer, RpgCharacterLayerSource>>;
}

export const RPG_CHARACTER_ASSET_ROOT = '/game-assets/lpc-characters';
const outfit = (base: string, clothing = base): RpgCharacterDefinition['layers'] => ({
  body: { source: base },
  head: { source: base },
  pants: { source: base },
  shirt: { source: clothing },
  boots: { source: base },
  hair: { source: clothing },
});

/** Shared by browser rendering, pickers, NPC content and live presence validation. */
export const RPG_CHARACTER_DEFINITIONS = [
  {
    id: 'rowan',
    name: 'Rowan',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/rowan/portrait.png`,
    layers: outfit('rowan'),
  },
  {
    id: 'ash',
    name: 'Ash',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: outfit('ash'),
  },
  {
    id: 'ivar',
    name: 'Ivar',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ivar/portrait.png`,
    layers: outfit('rowan', 'ivar'),
  },
  {
    id: 'sigrid',
    name: 'Sigrid',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/sigrid/portrait.png`,
    layers: outfit('ash', 'sigrid'),
  },
] as const satisfies readonly RpgCharacterDefinition[];

export type RpgCharacterId = (typeof RPG_CHARACTER_DEFINITIONS)[number]['id'];
export const RPG_CHARACTER_IDS = RPG_CHARACTER_DEFINITIONS.map(({ id }) => id);
export const DEFAULT_RPG_CHARACTER_ID: RpgCharacterId = RPG_CHARACTER_DEFINITIONS[0].id;

export function getRpgCharacter(id: string): RpgCharacterDefinition & { id: RpgCharacterId } {
  return (
    RPG_CHARACTER_DEFINITIONS.find((character) => character.id === id) ??
    RPG_CHARACTER_DEFINITIONS[0]
  );
}
