import type {
  Point,
  RpgDestination,
  RpgSample,
  RpgThemeId,
} from '../../domain/world/content/v1/types';

// Renderer and generator share one scene contract; UI/runtime messages stay local to this feature.
export type {
  RpgAction,
  RpgDestination,
  RpgDirection,
  RpgLandmark,
  RpgNpc,
  RpgSample,
  RpgStamp,
  RpgTexture,
  RpgThemeId,
} from '../../domain/world/content/v1/types';

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
}
