import type { WorldThemeId } from '../../catalog/themes';

export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}

export type RpgThemeId = WorldThemeId | 'dungeon';
export type RpgDestination = RpgThemeId | 'return' | 'town-hall';
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
  destination?: RpgDestination;
  /** Optional roof position for a house label, separate from its walkable entrance. */
  labelAnchor?: Point;
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
  /** Version-pinned, compact grass/road geometry rendered only near the viewport. */
  terrain?: { version: 1; roads: Rect[] };
}
