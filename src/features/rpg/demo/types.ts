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
export type DemoArea = 'village' | 'jungle' | 'fern-hollow' | 'temple' | 'temple-interior';

export const DEMO_AREA_NAMES: Record<DemoArea, string> = {
  village: 'Willowmere',
  jungle: 'Mosswild Jungle',
  'fern-hollow': 'Fern Hollow',
  temple: 'Rootbound Temple',
  'temple-interior': 'The Hollow Choir',
};

export function readDemoArea(value: string | null): DemoArea {
  return value === 'jungle' ||
    value === 'fern-hollow' ||
    value === 'temple' ||
    value === 'temple-interior'
    ? value
    : 'village';
}
/** Local scene routing only. Combat rules are shared by all adventure worlds. */
export interface DemoSceneContent {
  area: DemoArea;
  /** Where a fresh demo link starts when the requested area's shared admission rule is unmet. */
  entryFallback?: DemoArea;
  portals: Array<{ id: string; target: DemoArea }>;
  jungle?: AdventureDefinition;
}
