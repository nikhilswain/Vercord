import type { RpgDestination, RpgThemeId } from './types';

export type RpgWorldId = Exclude<RpgThemeId, 'dungeon'>;

interface RpgThemeDetails {
  name: string;
  setting: string;
  guide: string;
  map: { ground: string; obstacle: string };
}

interface RpgWorldTheme extends RpgThemeDetails {
  kind: 'world';
  label: string;
  appearances: readonly string[];
  defaultAppearance: string;
  dungeonHint: string;
}

interface RpgLocationTheme extends RpgThemeDetails {
  kind: 'location';
  label: string;
}

/** Presentation and travel context belong here; map geometry stays in sample-worlds. */
export const RPG_THEMES = {
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
  },
  dungeon: {
    kind: 'location',
    name: 'Lantern Vault',
    label: 'Dungeon',
    setting: 'Stone chambers & lantern-lit passages',
    guide: 'Oren in the arrival chamber',
    map: { ground: '#65717b', obstacle: '#222b36' },
  },
} as const satisfies Record<RpgThemeId, RpgWorldTheme | RpgLocationTheme>;

export const RPG_WORLD_IDS: readonly RpgWorldId[] = ['village', 'norse'];

export interface RpgRoute {
  theme: RpgThemeId;
  world: RpgWorldId;
  street?: string;
}

export function readRpgRoute(search: string): RpgRoute {
  const params = new URLSearchParams(search);
  const requested = params.get('theme');
  const theme: RpgThemeId =
    requested === 'norse' || requested === 'dungeon' ? requested : 'village';
  const world =
    theme === 'dungeon' ? (params.get('from') === 'norse' ? 'norse' : 'village') : theme;
  const street = params.get('street');
  return { theme, world, ...(street !== null ? { street } : {}) };
}

export function resolveRpgTravel(route: RpgRoute, destination: RpgDestination): RpgRoute {
  if (destination === 'return') return { ...route, theme: route.world };
  if (destination === 'dungeon') return { ...route, theme: destination };
  return {
    theme: destination,
    world: destination,
    ...(destination === route.world && route.street !== undefined ? { street: route.street } : {}),
  };
}

export function writeRpgRoute(url: URL, route: RpgRoute): URL {
  if (route.theme === 'village') url.searchParams.delete('theme');
  else url.searchParams.set('theme', route.theme);
  if (route.theme === 'dungeon' && route.world === 'norse')
    url.searchParams.set('from', route.world);
  else url.searchParams.delete('from');
  if (route.street === undefined) url.searchParams.delete('street');
  else url.searchParams.set('street', route.street);
  return url;
}
