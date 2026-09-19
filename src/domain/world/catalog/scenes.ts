import { isForestSceneId, type ForestSceneId } from '../forest/catalog';

/** Spatial identity is separate from a world's visual theme. */
export const RPG_SCENE_IDS = ['overworld', 'dungeon', 'town-hall'] as const;
export type HouseSceneId = `house:${number}`;
export type RpgSceneId = (typeof RPG_SCENE_IDS)[number] | HouseSceneId | ForestSceneId;

export function isHouseSceneId(value: string): value is HouseSceneId {
  return /^house:(?:0|[1-9][0-9]{0,4})$/u.test(value);
}
export const SCENE_DEFINITIONS = {
  overworld: { kind: 'overworld', visiblePlayerLimit: 64 },
  dungeon: { kind: 'dungeon', visiblePlayerLimit: 32 },
  'town-hall': { kind: 'town-hall', visiblePlayerLimit: 48 },
  house: { kind: 'house', visiblePlayerLimit: 16 },
  forest: { kind: 'forest', visiblePlayerLimit: 32 },
} as const;
export type RpgSceneKind = keyof typeof SCENE_DEFINITIONS;

export const DUNGEON_PRESENTATION = {
  kind: 'location',
  name: 'Lantern Vault',
  label: 'Dungeon',
  setting: 'Stone chambers & lantern-lit passages',
  guide: 'Oren in the arrival chamber',
  map: { ground: '#65717b', obstacle: '#222b36' },
} as const;

/** Legacy saved v1 scenes lack an explicit scene ID; their interpretation stays pinned here. */
export function sampleSceneId(sample: { id: string; sceneId?: RpgSceneId }): RpgSceneId {
  return sample.sceneId ?? (sample.id === 'dungeon' ? 'dungeon' : 'overworld');
}

export function sceneDefinition(id: RpgSceneId) {
  return SCENE_DEFINITIONS[isHouseSceneId(id) ? 'house' : isForestSceneId(id) ? 'forest' : id];
}
