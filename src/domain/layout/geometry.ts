export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface RoomGeometry extends Rect {
  key: string;
  areaKey: string;
}

export type AtlasVariant = 'violet' | 'cyan' | 'amber';

export interface AreaGeometry extends Rect {
  key: string;
  variant: AtlasVariant;
  rooms: RoomGeometry[];
}

export interface RouteGeometry {
  key: string;
  variant: AtlasVariant;
  start: Point;
  controlA: Point;
  controlB: Point;
  end: Point;
}

export interface AtlasGeometry {
  layoutVersion: 1;
  width: number;
  height: number;
  areas: AreaGeometry[];
  routes: RouteGeometry[];
}

export const ATLAS_LAYOUT_CONSTANTS = {
  outerInset: 48,
  shelfContentWidth: 1536,
  districtGap: 32,
  districtPadding: 24,
  districtHeaderHeight: 48,
  roomWidth: 156,
  roomHeight: 52,
  roomGap: 12,
  maxRoomColumns: 4,
  minimumDistrictWidth: 272,
  minimumWidth: 720,
  minimumHeight: 480,
} as const;
