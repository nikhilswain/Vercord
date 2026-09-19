import type { ProvisionsSnapshot, PendingUse } from '../../../domain/adventure/provisions';
import type { Point, Rect } from '../../world/engine/types';
import type { ScenarioDefinition, StoryCondition } from '../../../domain/adventure/scenario';
import type { InventorySnapshot } from '../../../domain/adventure/inventory';
import type { PlayerProgression, EquipmentPolicy } from '../../../domain/adventure/equipment';
import type { ForageKind } from '../../../domain/adventure/forage';

import type { SpellId, SpellCooldowns } from '../../../domain/adventure/spells';
export type { SpellId } from '../../../domain/adventure/spells';
export type CombatMode = SpellId | 'melee';
import type { CreatureKind } from '../../../domain/adventure/enemies';
export type { CreatureKind } from '../../../domain/adventure/enemies';
export type FlowerKind = ForageKind;
export type SlimeVariant = 'pink' | 'green' | 'blue';
export interface EncounterSpawn extends Point, StoryCondition {
  id: string;
  kind: CreatureKind;
  variant?: SlimeVariant;
  elite?: boolean;
  name?: string;
  /** Forest encounters adapt to the traveler; story encounters keep their authored policy. */
  levelOffset?: number;
  encounter?: 'road' | 'woodland';
  /** Stable procedural encounter membership, distinct from the creature's save ID. */
  encounterId?: string;
  patrolRadius?: number;
}
export interface FlowerSpawn extends Point {
  id: string;
  kind: FlowerKind;
  project?: string;
}
export interface AdventureDefinition {
  /** Distant wildlife sleeps in large regions; nearby combat keeps the existing simulation. */
  simulationRadius?: number;
  scenario?: ScenarioDefinition;
  trapVisual?: { texture: string; frames: readonly number[]; originY: number; scale: number };
  /** Authored safe arrival clearings; never inferred from the map dimensions. */
  safeAreas?: readonly Rect[];
  enemies: EncounterSpawn[];
  flowers: FlowerSpawn[];
  water: Rect[];
  traps?: Array<Point & { id: string; offset: number; activation?: 'pressure' | 'timed' }>;
}
export interface AdventureStatus {
  inventory: InventorySnapshot;
  provisions?: ProvisionsSnapshot;
  pendingUse?: PendingUse | null;
  canUseSupplies?: boolean;
  equipment: PlayerProgression;
  equipmentPolicy: EquipmentPolicy;
  canAdjustEncounters: boolean;
  story?: { title: string; text: string; complete: boolean };
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
  spellCooldowns?: SpellCooldowns;
  castReady: boolean;
  combatMode: CombatMode;
  weaponId: string;
  enemyLevel: number;
  encounterHealth: number;
  encounterDamage: number;
}
