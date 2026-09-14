import type { Point, Rect } from '../../world/engine/types';

export type SpellId = 'fire' | 'water';
export type CombatMode = SpellId | 'melee';
import type { CreatureKind } from '../../../domain/adventure/enemies';
export type { CreatureKind } from '../../../domain/adventure/enemies';
export type FlowerKind = 'healing' | 'collection';
export interface EncounterSpawn extends Point {
  id: string;
  kind: CreatureKind;
  variant?: 'green' | 'blue';
  elite?: boolean;
}
export interface FlowerSpawn extends Point {
  id: string;
  kind: FlowerKind;
}
export interface AdventureDefinition {
  /** Authored safe arrival clearings; never inferred from the map dimensions. */
  safeAreas?: readonly Rect[];
  enemies: EncounterSpawn[];
  flowers: FlowerSpawn[];
  water: Rect[];
  traps?: Array<Point & { id: string; offset: number; activation?: 'pressure' | 'timed' }>;
}
export interface AdventureStatus {
  boss?: { name: string; health: number; maxHealth: number; level: number; enraged: boolean };
  health: number;
  maxHealth: number;
  herbs: number;
  blossoms: number;
  blossomGoal: number;
  defeated: number;
  enemyGoal: number;
  message: string;
  level: number;
  experience: number;
  nextLevel: number | null;
  spell: SpellId;
  waterUnlocked: boolean;
  castReady: boolean;
  combatMode: CombatMode;
  weaponId: string;
  enemyLevel: number;
  encounterHealth: number;
  encounterDamage: number;
}
