import type { Point, Rect } from '../world/engine/types';

export type RpgThemeId = 'village' | 'dungeon';
export type RpgDirection = 'down' | 'left' | 'right' | 'up';
export type RpgAction = 'idle' | 'walk' | 'run';

export interface RpgTexture {
  key: string;
  url: string;
  frameWidth?: number;
  frameHeight?: number;
  frames?: Record<string, { x: number; y: number; width: number; height: number }>;
}

export interface RpgStamp extends Point {
  texture: string;
  frame?: number | string;
  width?: number;
  height?: number;
  originX?: number;
  originY?: number;
  depth?: number;
  alpha?: number;
  tint?: number;
}

export interface RpgNpc extends Point {
  id: string;
  name: string;
  role: string;
  appearance: string;
  direction: RpgDirection;
  lines: string[];
}

export interface RpgLandmark extends Point {
  id: string;
  name: string;
  description: string;
  radius: number;
  kind: 'sign' | 'portal' | 'view';
  destination?: RpgThemeId;
}

export interface RpgSample {
  id: RpgThemeId;
  name: string;
  subtitle: string;
  bounds: Rect;
  spawn: Point;
  textures: RpgTexture[];
  stamps: RpgStamp[];
  colliders: Rect[];
  npcs: RpgNpc[];
  landmarks: RpgLandmark[];
  lights: Array<Point & { radius: number; color: number }>;
  background: string;
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
  onTravel(theme: RpgThemeId): void;
}

export interface RpgRuntime {
  start(): void;
  destroy(): void;
  resize(width: number, height: number): void;
  setTheme(theme: RpgThemeId): void;
  setAppearance(id: string): void;
  setInputBlocked(blocked: boolean): void;
  setVirtualAxis(x: number, y: number, sprinting?: boolean): void;
  interact(): void;
  zoomBy(factor: number): void;
  center(): void;
}
