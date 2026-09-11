import type { Point, Rect } from '../../world/engine/types';

export type DemoArea = 'village' | 'jungle';
export type CreatureKind = 'slime' | 'snake' | 'bear';
export type FlowerKind = 'healing' | 'collection';
export interface EncounterSpawn extends Point {
  id: string;
  kind: CreatureKind;
}
export interface FlowerSpawn extends Point {
  id: string;
  kind: FlowerKind;
}
export interface JungleDefinition {
  enemies: EncounterSpawn[];
  flowers: FlowerSpawn[];
  water: Rect[];
}
/** Local demo content; never part of saved worlds or the presence protocol. */
export interface DemoSceneContent {
  area: DemoArea;
  portal: { id: string; target: DemoArea };
  jungle?: JungleDefinition;
}
export interface AdventureStatus {
  health: number;
  maxHealth: number;
  herbs: number;
  blossoms: number;
  blossomGoal: number;
  defeated: number;
  enemyGoal: number;
  message: string;
}
