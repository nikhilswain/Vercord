import type { AdventureDefinition } from '../adventure/types';
export type {
  SpellId,
  CombatMode,
  CreatureKind,
  FlowerKind,
  EncounterSpawn,
  FlowerSpawn,
  AdventureStatus,
  AdventureDefinition as JungleDefinition,
} from '../adventure/types';
export type DemoArea = 'village' | 'jungle';
/** Local scene routing only. Combat rules are shared by all adventure worlds. */
export interface DemoSceneContent {
  area: DemoArea;
  portal: { id: string; target: DemoArea };
  jungle?: AdventureDefinition;
}
