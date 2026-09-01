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

export interface WorldPath {
  id: string;
  bounds: Rect;
}

export interface WorldTileLayer {
  id: string;
  bounds: Rect;
  tileIndex: number;
  radius?: number;
}

export interface WorldTileStamp extends Point {
  id: string;
  tiles: Array<Array<number | null>>;
  tileSize: number;
  layer?: 'floor' | 'object';
  solid?: boolean;
  hitbox?: Rect;
  sortY?: number;
}

export interface WorldBuildingStyle {
  id: string;
  doorColumn: number;
  tiles: Array<Array<number | null>>;
}

export type WorldPropKind =
  | 'armchair'
  | 'art'
  | 'bench'
  | 'blueRug'
  | 'bookshelf'
  | 'building'
  | 'chair'
  | 'curtain'
  | 'desk'
  | 'fountain'
  | 'planter'
  | 'rug'
  | 'screen'
  | 'sofa'
  | 'table'
  | 'tree'
  | 'window';

export interface WorldInteriorStyle {
  wallPanel: Rect;
  floorTile: Rect;
}

export interface WorldTheme {
  id: string;
  name: string;
  atlasUrl: string;
  sourceTileSize: number;
  sheetColumns: number;
  worldTileSize: number;
  avatar?: {
    layerUrls: string[];
    frameSize: number;
    walkFrames: number;
    walkRows: Record<Direction, number>;
    idleRows: Record<Direction, number>;
    renderSize: number;
    animationMs: number;
    collider: {
      width: number;
      height: number;
      offsetX: number;
      offsetY: number;
    };
  };
  interiorAtlas?: {
    url: string;
    sprites: Partial<Record<WorldPropKind, Rect>>;
  };
  exterior?: {
    buildings: WorldBuildingStyle[];
  };
  tiles: {
    ground: number;
    path: number;
    plaza: number;
    player: Record<Direction, number>;
  };
}

export interface WorldPortal extends Point {
  key: string;
  areaKey: string;
  areaLabel: string;
  room: MapRoom;
  accent: string;
  destination: 'room' | 'world';
  buildingStyle?: number;
}

export interface WorldProp extends Rect {
  id: string;
  kind: WorldPropKind;
  solid: boolean;
  layer?: 'floor' | 'object';
  hitbox?: Rect;
  tint?: string;
}

export interface WorldDefinition {
  name: string;
  environment: 'exterior' | 'interior';
  theme: WorldTheme;
  interiorStyle?: WorldInteriorStyle;
  bounds: Rect;
  spawn: Point;
  areas: WorldArea[];
  paths: WorldPath[];
  tileLayers: WorldTileLayer[];
  tileStamps: WorldTileStamp[];
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
  room: WorldPortal | null;
  environment: WorldDefinition['environment'];
  zoom: number;
}
