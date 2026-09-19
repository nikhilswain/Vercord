import type { ProvisionStation } from './provisions/stations';
import type { ProvisionsSnapshot } from '../../domain/adventure/provisions';
import type {
  Point,
  RpgDestination,
  RpgSample as SavedRpgSample,
  RpgStamp,
  RpgThemeId,
} from '../../domain/world/content/v1/types';
import type { MapRoomType } from '../../domain/map/snapshot';
import type {
  RpgLocation,
  RpgMovement,
  RpgPresencePlayer,
} from '../../domain/presence/rpg-protocol';
import type { RpgSceneId } from '../../domain/world/catalog/scenes';
import type { AdventureStatus, DemoArea, DemoSceneContent, SpellId } from './demo/types';
import type { UseItemResult } from '../../domain/adventure/inventory';
import type { CraftItemResult } from '../../domain/adventure/crafting';
import type { ScenarioSprite } from './adventure/scenario-renderer';
import type { RitualSeal } from './adventure/ritual-seal-assets';
import type { AdventureDefinition } from './adventure/types';
import type {
  ForestDestination,
  ForestRegionId,
  TempleAreaId,
} from '../../domain/world/forest/catalog';
import type { ForestPortal, ForestSite } from '../../domain/world/forest/layout';
import type { NavigationResult, NavigationState, NavigationTarget } from './navigation/types';
import type { HouseInteraction } from '../../domain/world/content/house-v2/schema';
import type { JourneyJournal, JournalPreferences } from './journal/model';
import type { HallBoardId } from '../../domain/world/content/town-hall-v1/scene';

/** Local reconciliation intent; never sent as a movement packet. */
export interface RpgPositionUpdate extends RpgLocation {
  resumeDestination?: boolean;
  revision?: number;
}

// Renderer and generator share one scene contract; UI/runtime messages stay local to this feature.
export type {
  RpgAction,
  RpgDestination,
  RpgDirection,
  RpgLandmark,
  RpgNpc,
  RpgStamp,
  RpgTexture,
  RpgThemeId,
} from '../../domain/world/content/v1/types';

/** Runtime-only annotations. Saved geometry is never generated or rewritten by the browser. */
export interface RpgSceneLabel extends Point {
  text: string;
  detail?: string;
  roomType?: MapRoomType;
  kind?: 'room' | 'district' | 'place';
  maxWidth: number;
}

export interface RpgSample extends SavedRpgSample {
  provisionStations?: ProvisionStation[];
  adventure?: { id: string; definition?: AdventureDefinition };
  forest?: { region: ForestRegionId; sites: ForestSite[]; camp: Point };
  temple?: TempleAreaId;
  forestPortals?: ForestPortal[];
  ritualSeals?: RitualSeal[];
  storySprites?: ScenarioSprite[];
  sceneId?: RpgSceneId;
  signage?: RpgSceneLabel[];
  townSquareNavigation?: boolean;
  demo?: DemoSceneContent;
  houseInteractions?: HouseInteraction[];
  /** Small animated scenery uses the shared scene clock; static ground stays cached. */
  animatedScenery?: Array<
    RpgStamp & {
      frames: readonly (string | number)[];
      durationMs: number;
      phaseMs?: number;
      /** Optional interaction starts a short animation, otherwise it rests on the first frame. */
      trigger?: string;
      requiresProject?: string;
      inactiveFrame?: string;
    }
  >;
}

export interface RpgNearby {
  id: string;
  label: string;
  action:
    | 'Brew'
    | 'Cook'
    | 'Talk'
    | 'Read'
    | 'Explore'
    | 'Open'
    | 'Pet'
    | 'Gather'
    | 'Enter'
    | 'Use'
    | 'Follow trail';
}

export interface RpgUiState {
  defeated?: boolean;
  theme: RpgThemeId;
  place: string;
  nearby: RpgNearby | null;
  pickup?: { id: string; label: string };
  station?: ProvisionStation | null;
  supplyCache?: string | null;
  position: Point;
  zoom: number;
  minZoom?: number;
  following?: boolean;
  feedback?: string;
  navigation?: NavigationState | null;
  journal?: JourneyJournal;
  adventure?: AdventureStatus;
  exploration?: { visited: ForestRegionId[]; discovered: string[]; saveAvailable: boolean };
}

export interface RpgDialogue {
  npcId?: string;
  closeLabel?: string;
  name: string;
  role: string;
  lines: string[];
  appearance?: string;
}

export interface RpgCallbacks {
  onReady(): void;
  onError(): void;
  onUi(state: RpgUiState): void;
  onDialogue(dialogue: RpgDialogue): void;
  onTravel(destination: RpgDestination): void;
  onStreet?(street: string): void;
  onMove?(location: RpgMovement): void;
  onHouse?(landmarkId: string): void;
  onHallBoard?(id: HallBoardId): void;
  onDemoTravel?(area: DemoArea): void;
  onForestTravel?(area: ForestDestination): void;
}

export interface RpgRuntime {
  start(): void;
  destroy(): void;
  resize(width: number, height: number): void;
  setScene(scene: RpgSample, sceneKey: string): void;
  setAppearance(id: string): void;
  setPlayers(players: readonly RpgPresencePlayer[]): void;
  setPlayerPosition(location: RpgPositionUpdate): void;
  setInputBlocked(blocked: boolean): void;
  setVirtualAxis(x: number, y: number, sprinting?: boolean): void;
  interact(): void;
  pickupLoot?(): void;
  attack?(): void;
  heal?(): void;
  selectSpell?(spell: SpellId): void;
  selectMelee?(): void;
  equipWeapon?(id: string): boolean;
  useInventoryItem?(id: string): UseItemResult | undefined;
  craftInventoryItem?(
    id: string,
    quantity?: number,
    requestId?: string,
  ): CraftItemResult | undefined;
  guideToSupply?(id: string): NavigationResult;
  closeStation?(): void;
  closeSupplyCache?(): void;
  takeSupplyCache?(id: string): string;
  stationAction?(action: string): string;
  configureProvisions?(
    settings: Partial<Pick<ProvisionsSnapshot, 'recovery' | 'quickBuff' | 'trackedRecipe'>>,
  ): void;
  returnToTown?(): void;
  setEnemyLevel?(level: number): void;
  zoomBy(factor: number): void;
  center(): void;
  focus?(point: Point): void;
  guideTo?(target: NavigationTarget): NavigationResult;
  stopNavigation?(): void;
  setJournal?(preferences: Partial<JournalPreferences>): void;
  overview?(): void;
}
