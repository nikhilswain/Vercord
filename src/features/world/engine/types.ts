import type { MapRoom } from '../../../domain/map/snapshot';

export type Direction = 'down' | 'left' | 'right' | 'up';

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface WorldArea {
  key: string;
  label: string;
  accent: string;
  bounds: Rect;
  roomCount: number;
}

export interface WorldPortal extends Point {
  key: string;
  areaKey: string;
  areaLabel: string;
  room: MapRoom;
  accent: string;
}

export interface WorldProp extends Rect {
  id: string;
  kind: 'bench' | 'building' | 'fountain' | 'planter' | 'tree';
  solid: boolean;
  tint?: string;
}

export interface WorldDefinition {
  name: string;
  bounds: Rect;
  spawn: Point;
  areas: WorldArea[];
  portals: WorldPortal[];
  props: WorldProp[];
  colliders: Rect[];
}

export interface PlayerState extends Point {
  direction: Direction;
  moving: boolean;
}

export interface WorldUiState {
  area: WorldArea | null;
  nearbyPortal: WorldPortal | null;
  zoom: number;
}
