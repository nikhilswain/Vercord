import type { Point, Rect } from '../../../domain/world/content/v1/types';

export type { Point, Rect };
export type AtlasPlaceKind =
  | 'text'
  | 'voice'
  | 'forum'
  | 'announcement'
  | 'stage'
  | 'media'
  | 'unsupported'
  | 'landmark'
  | 'npc';
export interface AtlasPlace extends Point {
  id: string;
  landmarkId?: string;
  name: string;
  kind: AtlasPlaceKind;
}
export interface AtlasRegion {
  id: string;
  name: string;
  color: string;
  places: AtlasPlace[];
  seeds: Point[];
  path: string;
  bounds: Rect;
  center: Point;
}
export interface AtlasModel {
  revision: number;
  bounds: Rect;
  regions: AtlasRegion[];
  roads: string;
  water?: readonly Rect[];
  local?: boolean;
  regionAt(point: Point): AtlasRegion | undefined;
}
export interface AtlasView extends Point {
  width: number;
}
export interface AtlasSelection {
  detailed: boolean;
  selected: string | null;
  focused: string | null;
}
export type PinKind = 'location' | 'flower';
export interface AtlasPin extends Point {
  id: string;
  kind: PinKind;
  name: string;
}
export interface PinDraft extends Point {
  existing?: AtlasPin;
  name?: string;
}
