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

function tintedOutfit(
  base: 'rowan' | 'ash',
  clothing: string,
  hair: string,
  tints: { skin: number; hair: number; shirt: number; pants: number; boots: number },
): RpgCharacterDefinition['layers'] {
  return {
    body: { source: base, tint: tints.skin },
    head: { source: base, tint: tints.skin },
    pants: { source: base, tint: tints.pants },
    shirt: { source: clothing, tint: tints.shirt },
    boots: { source: base, tint: tints.boots },
    hair: { source: hair, tint: tints.hair },
  };
}

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
  {
    id: 'tamsin',
    name: 'Tamsin',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: tintedOutfit('ash', 'ash', 'sigrid', {
      skin: 0xffd2bd,
      hair: 0x815e50,
      shirt: 0xe2c388,
      pants: 0xb0ad8c,
      boots: 0x9b8874,
    }),
  },
  {
    id: 'emery',
    name: 'Emery',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/rowan/portrait.png`,
    layers: tintedOutfit('rowan', 'rowan', 'ivar', {
      skin: 0xbc9385,
      hair: 0xa4b2c0,
      shirt: 0xb4b6ed,
      pants: 0xd2c8b5,
      boots: 0x777d83,
    }),
  },
  {
    id: 'linden',
    name: 'Linden',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: tintedOutfit('ash', 'sigrid', 'ash', {
      skin: 0xe8b891,
      hair: 0xc5a49c,
      shirt: 0xd1a3cc,
      pants: 0x8b8d97,
      boots: 0xafa8a0,
    }),
  },
  {
    id: 'leif',
    name: 'Leif',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ivar/portrait.png`,
    layers: tintedOutfit('rowan', 'ivar', 'rowan', {
      skin: 0xe5c3a4,
      hair: 0xdcaa86,
      shirt: 0xe39b63,
      pants: 0x8fabb9,
      boots: 0x968671,
    }),
  },
  {
    id: 'runa',
    name: 'Runa',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/sigrid/portrait.png`,
    layers: tintedOutfit('ash', 'sigrid', 'ash', {
      skin: 0xbc9583,
      hair: 0x6b667f,
      shirt: 0x69dcb7,
      pants: 0xb6b9b0,
      boots: 0x8a969a,
    }),
  },
  {
    id: 'eirik',
    name: 'Eirik',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ivar/portrait.png`,
    layers: tintedOutfit('rowan', 'ivar', 'ivar', {
      skin: 0xd4a68c,
      hair: 0x968879,
      shirt: 0x78bcca,
      pants: 0x8795a6,
      boots: 0xc2aa86,
    }),
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
