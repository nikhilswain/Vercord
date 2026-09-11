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

function wardrobeOutfit(
  base: 'rowan' | 'ash',
  shirt: string,
  hair: string,
  skin: string = base,
): RpgCharacterDefinition['layers'] {
  return {
    ...outfit(base),
    body: { source: skin },
    head: { source: skin },
    shirt: { source: shirt },
    hair: { source: hair },
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
    layers: wardrobeOutfit('ash', 'shirt-f-forest', 'ash'),
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
    layers: wardrobeOutfit('ash', 'shirt-f-wine', 'hair-bun-platinum'),
  },
  {
    id: 'tamsin',
    name: 'Tamsin',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: tintedOutfit('ash', 'shirt-f-forest', 'hair-bob-blonde', {
      skin: 0xffd2bd,
      hair: 0xffffff,
      shirt: 0xffffff,
      pants: 0xb0ad8c,
      boots: 0x9b8874,
    }),
  },
  {
    id: 'emery',
    name: 'Emery',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/rowan/portrait.png`,
    layers: tintedOutfit('rowan', 'shirt-m-blue', 'hair-parted-blonde', {
      skin: 0xbc9385,
      hair: 0xffffff,
      shirt: 0xffffff,
      pants: 0xd2c8b5,
      boots: 0x777d83,
    }),
  },
  {
    id: 'linden',
    name: 'Linden',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: tintedOutfit('ash', 'shirt-f-indigo', 'hair-twists-black', {
      skin: 0xe8b891,
      hair: 0xffffff,
      shirt: 0xffffff,
      pants: 0x8b8d97,
      boots: 0xafa8a0,
    }),
  },
  {
    id: 'leif',
    name: 'Leif',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ivar/portrait.png`,
    layers: tintedOutfit('rowan', 'shirt-m-linen', 'hair-cowlick-orange', {
      skin: 0xe5c3a4,
      hair: 0xffffff,
      shirt: 0xffffff,
      pants: 0x8fabb9,
      boots: 0x968671,
    }),
  },
  {
    id: 'runa',
    name: 'Runa',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/sigrid/portrait.png`,
    layers: tintedOutfit('ash', 'shirt-f-charcoal', 'hair-curly-silver', {
      skin: 0xbc9583,
      hair: 0xffffff,
      shirt: 0xffffff,
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
  {
    id: 'hazel',
    name: 'Hazel',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: wardrobeOutfit('ash', 'shirt-f-forest', 'hair-bob-violet', 'skin-f-ivory'),
  },
  {
    id: 'nico',
    name: 'Nico',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/rowan/portrait.png`,
    layers: wardrobeOutfit('rowan', 'shirt-m-forest', 'hair-natural-black', 'skin-m-ivory'),
  },
  {
    id: 'juniper',
    name: 'Juniper',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: wardrobeOutfit('ash', 'shirt-f-indigo', 'hair-bun-platinum'),
  },
  {
    id: 'marlowe',
    name: 'Marlowe',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/rowan/portrait.png`,
    layers: wardrobeOutfit('rowan', 'shirt-m-wine', 'hair-twists-black'),
  },
  {
    id: 'sage',
    name: 'Sage',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: wardrobeOutfit('ash', 'shirt-f-wine', 'hair-cornrows-brown'),
  },
  {
    id: 'freya',
    name: 'Freya',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: wardrobeOutfit('ash', 'shirt-f-wine', 'hair-bob-blonde', 'skin-f-ivory'),
  },
  {
    id: 'torsten',
    name: 'Torsten',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/rowan/portrait.png`,
    layers: wardrobeOutfit('rowan', 'shirt-m-linen', 'hair-page-white'),
  },
  {
    id: 'alva',
    name: 'Alva',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: wardrobeOutfit('ash', 'shirt-f-forest', 'hair-parted-blonde', 'skin-f-ivory'),
  },
  {
    id: 'oskar',
    name: 'Oskar',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/rowan/portrait.png`,
    layers: wardrobeOutfit('rowan', 'shirt-m-blue', 'hair-cowlick-orange', 'skin-m-ivory'),
  },
  {
    id: 'solveig',
    name: 'Solveig',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: wardrobeOutfit('ash', 'shirt-f-indigo', 'hair-curly-silver', 'skin-f-ivory'),
  },
  {
    id: 'elin',
    name: 'Elin',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: wardrobeOutfit('ash', 'shirt-f-sky', 'hair-bob-blonde', 'skin-f-ivory'),
  },
  {
    id: 'astrid',
    name: 'Astrid',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: wardrobeOutfit('ash', 'shirt-f-red', 'hair-page-white', 'skin-f-ivory'),
  },
  {
    id: 'kaia',
    name: 'Kaia',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: wardrobeOutfit('ash', 'shirt-f-linen', 'hair-bob-red', 'skin-f-ivory'),
  },
  {
    id: 'mira',
    name: 'Mira',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: wardrobeOutfit('ash', 'shirt-f-indigo', 'hair-bob-pink', 'skin-f-ivory'),
  },
  {
    id: 'finn',
    name: 'Finn',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/rowan/portrait.png`,
    layers: wardrobeOutfit('rowan', 'shirt-m-blue', 'hair-cowlick-blue', 'skin-m-ivory'),
  },
  {
    id: 'lumi',
    name: 'Lumi',
    portraitUrl: `${RPG_CHARACTER_ASSET_ROOT}/ash/portrait.png`,
    layers: wardrobeOutfit('ash', 'shirt-f-pink', 'hair-page-white', 'skin-f-ivory'),
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
