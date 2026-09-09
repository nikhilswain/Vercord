import { WORLD_PLAYER_FEET } from '../geometry';

/** Runtime entity defaults are independent of saved rpg-v1 NPC content and renderers. */
export const ENTITY_CATALOG_VERSION = 1;
export const ENTITY_BEHAVIOR_IDS = ['idle', 'wander', 'patrol'] as const;
export type EntityBehaviorId = (typeof ENTITY_BEHAVIOR_IDS)[number];

export interface EntityFootprint {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}
export interface EntityNavigationDefaults {
  gridSize: number;
  speed: number;
  maxPathNodes: number;
  wanderRadius: number;
  pauseMs: readonly [number, number];
}
export interface EntityDefinition {
  footprint: EntityFootprint;
  navigation: EntityNavigationDefaults;
  defaultBehavior: EntityBehaviorId;
}

export const ENTITY_DEFINITIONS = {
  humanoid: {
    footprint: WORLD_PLAYER_FEET,
    navigation: {
      gridSize: 16,
      speed: 48,
      maxPathNodes: 512,
      wanderRadius: 160,
      pauseMs: [1800, 4800],
    },
    defaultBehavior: 'idle',
  },
  dog: {
    footprint: { width: 18, height: 10, offsetX: -9, offsetY: -10 },
    navigation: {
      gridSize: 16,
      speed: 58,
      maxPathNodes: 512,
      wanderRadius: 128,
      pauseMs: [1500, 3600],
    },
    defaultBehavior: 'wander',
  },
  cat: {
    footprint: { width: 14, height: 8, offsetX: -7, offsetY: -8 },
    navigation: {
      gridSize: 16,
      speed: 44,
      maxPathNodes: 512,
      wanderRadius: 96,
      pauseMs: [2400, 6000],
    },
    defaultBehavior: 'wander',
  },
} as const satisfies Record<string, EntityDefinition>;

export type EntityKind = keyof typeof ENTITY_DEFINITIONS;
export const ENTITY_KINDS = Object.keys(ENTITY_DEFINITIONS) as EntityKind[];
