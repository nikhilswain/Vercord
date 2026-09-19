import type { RpgDestination, RpgThemeId } from './types';
import { isForestAreaId, type ForestAreaId } from '../../domain/world/forest/catalog';
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
  forest?: ForestAreaId;
  /** The cellar retains this flag so Return leads back into the hall. */
  hall?: true;
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
  const forest = params.get('forest');
  const hall = params.get('place') === 'town-hall';
  return {
    theme,
    world,
    ...(street !== null ? { street } : {}),
    ...(hall
      ? { hall: true as const }
      : theme !== 'dungeon' && isForestAreaId(forest)
        ? { forest }
        : theme !== 'dungeon' && house !== null && isHouseSceneId(house)
          ? { house }
          : {}),
  };
}

export function resolveRpgTravel(route: RpgRoute, destination: RpgDestination): RpgRoute {
  const outdoors = {
    theme: route.theme,
    world: route.world,
    ...(route.street !== undefined ? { street: route.street } : {}),
  };
  if (destination === 'return')
    return {
      ...outdoors,
      theme: route.world,
      ...(route.theme === 'dungeon' && route.hall ? { hall: true as const } : {}),
    };
  if (destination === 'town-hall') return { ...outdoors, theme: route.world, hall: true };
  if (destination === 'dungeon')
    return { ...outdoors, theme: destination, ...(route.hall ? { hall: true as const } : {}) };
  return {
    theme: destination,
    world: destination,
    ...(destination === route.world && route.street !== undefined ? { street: route.street } : {}),
  };
}

export function writeRpgRoute(url: URL, route: RpgRoute): URL {
  if (route.hall) url.searchParams.set('place', 'town-hall');
  else url.searchParams.delete('place');
  if (route.theme === DEFAULT_WORLD_THEME_ID) url.searchParams.delete('theme');
  else url.searchParams.set('theme', route.theme);
  if (route.theme === 'dungeon' && route.world !== DEFAULT_WORLD_THEME_ID)
    url.searchParams.set('from', route.world);
  else url.searchParams.delete('from');
  if (route.street === undefined) url.searchParams.delete('street');
  else url.searchParams.set('street', route.street);
  if (route.house === undefined || route.theme === 'dungeon' || route.hall)
    url.searchParams.delete('house');
  else url.searchParams.set('house', route.house);
  if (!route.forest || route.theme === 'dungeon' || route.hall) url.searchParams.delete('forest');
  else {
    url.searchParams.set('forest', route.forest);
    url.searchParams.delete('house');
  }
  return url;
}
