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
export type DemoArea = 'village' | 'jungle' | 'fern-hollow' | 'temple';

export const DEMO_AREA_NAMES: Record<DemoArea, string> = {
  village: 'Willowmere',
  jungle: 'Mosswild Jungle',
  'fern-hollow': 'Fern Hollow',
  temple: 'Rootbound Temple',
};

export function readDemoArea(value: string | null): DemoArea {
  return value === 'jungle' || value === 'fern-hollow' || value === 'temple' ? value : 'village';
}
/** Local scene routing only. Combat rules are shared by all adventure worlds. */
export interface DemoSceneContent {
  area: DemoArea;
  portals: Array<{ id: string; target: DemoArea }>;
  jungle?: AdventureDefinition;
}
