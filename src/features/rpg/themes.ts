import type { RpgDestination, RpgThemeId } from './types';
import {
  DUNGEON_PRESENTATION,
  isHouseSceneId,
  type HouseSceneId,
} from '../../domain/world/catalog/scenes';
import {
  DEFAULT_WORLD_THEME_ID,
  isWorldThemeId,
  WORLD_THEME_IDS,
  WORLD_THEMES,
  type WorldThemeId,
} from '../../domain/world/catalog/themes';

export type RpgWorldId = WorldThemeId;

/** Browser travel composes the shared world and location catalogs. */
export const RPG_THEMES = {
  ...WORLD_THEMES,
  dungeon: DUNGEON_PRESENTATION,
} as const;

export const RPG_WORLD_IDS: readonly RpgWorldId[] = WORLD_THEME_IDS;

export interface RpgRoute {
  theme: RpgThemeId;
  world: RpgWorldId;
  street?: string;
  house?: HouseSceneId;
}

export function readRpgRoute(search: string): RpgRoute {
  const params = new URLSearchParams(search);
  const requested = params.get('theme');
  const theme: RpgThemeId =
    isWorldThemeId(requested) || requested === 'dungeon' ? requested : DEFAULT_WORLD_THEME_ID;
  const from = params.get('from');
  const world =
    theme === 'dungeon' ? (isWorldThemeId(from) ? from : DEFAULT_WORLD_THEME_ID) : theme;
  const street = params.get('street');
  const house = params.get('house');
  return {
    theme,
    world,
    ...(street !== null ? { street } : {}),
    ...(theme !== 'dungeon' && house !== null && isHouseSceneId(house) ? { house } : {}),
  };
}

export function resolveRpgTravel(route: RpgRoute, destination: RpgDestination): RpgRoute {
  const outdoors = {
    theme: route.theme,
    world: route.world,
    ...(route.street !== undefined ? { street: route.street } : {}),
  };
  if (destination === 'return') return { ...outdoors, theme: route.world };
  if (destination === 'dungeon') return { ...outdoors, theme: destination };
  return {
    theme: destination,
    world: destination,
    ...(destination === route.world && route.street !== undefined ? { street: route.street } : {}),
  };
}

export function writeRpgRoute(url: URL, route: RpgRoute): URL {
  if (route.theme === DEFAULT_WORLD_THEME_ID) url.searchParams.delete('theme');
  else url.searchParams.set('theme', route.theme);
  if (route.theme === 'dungeon' && route.world !== DEFAULT_WORLD_THEME_ID)
    url.searchParams.set('from', route.world);
  else url.searchParams.delete('from');
  if (route.street === undefined) url.searchParams.delete('street');
  else url.searchParams.set('street', route.street);
  if (route.house === undefined || route.theme === 'dungeon') url.searchParams.delete('house');
  else url.searchParams.set('house', route.house);
  return url;
}
