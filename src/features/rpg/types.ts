import type {
  Point,
  RpgDestination,
  RpgSample as SavedRpgSample,
  RpgThemeId,
} from '../../domain/world/content/v1/types';
import type { MapRoomType } from '../../domain/map/snapshot';

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
  signage?: RpgSceneLabel[];
  townSquareNavigation?: boolean;
}

export interface RpgNearby {
  id: string;
  label: string;
  action: 'Talk' | 'Read' | 'Explore';
}

export interface RpgUiState {
  theme: RpgThemeId;
  place: string;
  nearby: RpgNearby | null;
  position: Point;
  zoom: number;
  minZoom?: number;
  following?: boolean;
}

export interface RpgDialogue {
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
}

export interface RpgRuntime {
  start(): void;
  destroy(): void;
  resize(width: number, height: number): void;
  setScene(scene: RpgSample, sceneKey: string): void;
  setAppearance(id: string): void;
  setInputBlocked(blocked: boolean): void;
  setVirtualAxis(x: number, y: number, sprinting?: boolean): void;
  interact(): void;
  zoomBy(factor: number): void;
  center(): void;
  focus?(point: Point): void;
  overview?(): void;
}
