import type { RpgCharacterId } from './characters';
import type { WorldHousePrefabId, WorldPrefabId } from './prefabs';

interface WorldThemePack {
  kind: 'world';
  name: string;
  label: string;
  setting: string;
  guide: string;
  map: { ground: string; obstacle: string };
  appearances: readonly RpgCharacterId[];
  defaultAppearance: RpgCharacterId;
  dungeonHint: string;
  interior: {
    floorTint: number;
    wallTint: number;
    furnitureTint: number;
    rugTints: readonly number[];
    background: string;
  };
  generation: {
    style: 'lpc-village' | 'norse-timber';
    prefabs: readonly WorldPrefabId[];
    housePrefabs: readonly [WorldHousePrefabId, WorldHousePrefabId, WorldHousePrefabId];
    subtitle: string;
    townSubtitle: string;
    streetName: string;
    streetSubtitle: string;
    background: string;
    terrain: {
      style: 'lpc-edge' | 'cardinal-mask';
      texture: string;
      groundFrame: number;
      roadFrame: number;
    };
    keeper: {
      id: string;
      name: string;
      role: string;
      appearance: RpgCharacterId;
      lines: readonly string[];
    };
    square: {
      id: string;
      name: string;
      kind: 'view' | 'sign';
      description: string;
    };
  };
}

/** Add a pack here; geometry adapters interpret its style without knowing the theme ID. */
export const WORLD_THEMES = {
  village: {
    kind: 'world',
    name: 'Willowmere',
    label: 'Warm village',
    setting: 'Sunlit paths, gardens & familiar faces',
    guide: 'Mira by the crossroads',
    map: { ground: '#7c995a', obstacle: '#405736' },
    appearances: ['rowan', 'ash'],
    defaultAppearance: 'rowan',
    dungeonHint: 'Look for the vault steps to enter the Lantern Vault beneath the village.',
    interior: {
      floorTint: 0xffffff,
      wallTint: 0xffffff,
      furnitureTint: 0xffffff,
      rugTints: [0xffffff, 0xaed9c3, 0xcebbe2],
      background: '#211c19',
    },
    generation: {
      style: 'lpc-village',
      prefabs: ['hall', 'brick', 'paneled', 'grove', 'garden', 'vault'],
      housePrefabs: ['hall', 'brick', 'paneled'],
      subtitle: 'A quiet village at the forest edge',
      townSubtitle: 'Homes and gardens along the village lanes',
      streetName: 'Willow Lane',
      streetSubtitle: 'Homes and gardens along a quiet lane',
      background: '#4b8035',
      terrain: { style: 'lpc-edge', texture: 'lpc-terrain', groundFrame: 17, roadFrame: 68 },
      keeper: {
        id: 'mira',
        name: 'Mira',
        role: 'Village keeper',
        appearance: 'ash',
        lines: [
          'Welcome to Willowmere. The kettle is warm, and there is always room for one more traveler.',
          'Our lanes wind past the gathering hall, the cottages and the listening grove. The bridge in the water garden is the best place to watch the afternoon drift by.',
          'The old stone stairs lead to the Lantern Vault. Oren keeps the lamps lit down there. Tell him I have not forgotten his tea.',
        ],
      },
      square: {
        id: 'willowmere-sign',
        name: 'Willowmere crossroads',
        kind: 'sign',
        description:
          'Willowmere welcomes travelers. Follow the lanes to the hall, listening grove, water garden, and the Lantern Vault. Please leave the gate as you found it.',
      },
    },
  },
  norse: {
    kind: 'world',
    name: 'Frosthavn',
    label: 'Norse village',
    setting: 'Pine woods, timber halls & a glowing hearth',
    guide: 'Sigrid near Hearth square',
    map: { ground: '#8d9c99', obstacle: '#3b4b48' },
    appearances: ['ivar', 'sigrid'],
    defaultAppearance: 'ivar',
    dungeonHint: 'Find the vault entrance to explore the Lantern Vault beneath Frosthavn.',
    interior: {
      floorTint: 0x9faeb6,
      wallTint: 0xb2bfc1,
      furnitureTint: 0xd8c5b5,
      rugTints: [0xa4c6d2, 0xb8c9ba, 0xcfaaa2],
      background: '#171e22',
    },
    generation: {
      style: 'norse-timber',
      prefabs: ['longhouse', 'cottage', 'smithy', 'runes', 'landing', 'vault'],
      housePrefabs: ['longhouse', 'cottage', 'smithy'],
      subtitle: 'Timber halls beside a northern lake',
      townSubtitle: 'Timber homes and gardens along the northern lanes',
      streetName: 'Pine Street',
      streetSubtitle: 'Timber homes along the stone lanes',
      background: '#304f59',
      terrain: { style: 'cardinal-mask', texture: 'norse-terrain', groundFrame: 17, roadFrame: 15 },
      keeper: {
        id: 'sigrid',
        name: 'Sigrid',
        role: 'Keeper of the hearth',
        appearance: 'sigrid',
        lines: [
          'Welcome to Frosthavn. Come closer to the hearth; the wind off the lake can find every gap in a good coat.',
          'The stone lanes connect our longhouse, homes and smithy. Follow the loop to find the landing and the carved stones beneath the pines.',
          'A sheltered stair leads down into the Lantern Vault. The lamps are still burning.',
        ],
      },
      square: {
        id: 'frosthavn-hearth',
        name: 'Hearth square',
        kind: 'view',
        description:
          'A ring of worn stones holds the village fire, banked every night and coaxed back to life before dawn.',
      },
    },
  },
} as const satisfies Record<string, WorldThemePack>;

export type WorldThemeId = keyof typeof WORLD_THEMES;
export const WORLD_THEME_IDS = Object.keys(WORLD_THEMES) as WorldThemeId[];
export const DEFAULT_WORLD_THEME_ID: WorldThemeId = 'village';
export type WorldGenerationStyle = WorldThemePack['generation']['style'];
export type { WorldPrefabId } from './prefabs';

export function isWorldThemeId(value: string | null): value is WorldThemeId {
  return value !== null && Object.hasOwn(WORLD_THEMES, value);
}

export function getWorldTheme(id: string): (typeof WORLD_THEMES)[WorldThemeId] {
  if (!isWorldThemeId(id)) throw new Error('Unsupported world theme');
  return WORLD_THEMES[id];
}

export function appearanceFitsTheme(appearance: string, theme: WorldThemeId): boolean {
  const allowed: readonly string[] = WORLD_THEMES[theme].appearances;
  return allowed.includes(appearance);
}
