import type { Point } from '../../../domain/world/content/v1/types';
import type { ForestDestination } from '../../../domain/world/forest/catalog';

export type NavigationTarget = { id: string; name: string } & (
  | { kind: 'pin' | 'place'; scene: string; point: Point; radius: number; area?: ForestDestination }
  | { kind: 'region'; area: ForestDestination }
  | {
      kind: 'story';
      scene: string;
      point: Point;
      radius: number;
      area?: ForestDestination;
      siteId?: string;
    }
);

export interface NavigationLeg {
  id: string;
  point: Point;
  radius: number;
  portal?: string;
}

/** A scene supplies geometry; navigation never moves the player or opens a door. */
export interface NavigationContext {
  scene: string;
  paths: {
    findPath(from: Point, to: Point): Point[];
    canTravel(from: Point, to: Point): boolean;
  };
  resolve(target: NavigationTarget): NavigationLeg | 'arrived' | null;
}

export interface NavigationState {
  target: NavigationTarget;
  scene: string;
  status: 'guiding' | 'portal' | 'blocked';
  portal?: string;
  distance: number;
  path: readonly Point[];
}

export type NavigationResult = { ok: true; arrived?: boolean } | { ok: false; message: string };

export interface NavigationActions {
  onNavigate?(target: NavigationTarget): NavigationResult;
  onStopNavigation?(): void;
  navigation?: NavigationState | null;
}

export const NAVIGATION_UNREACHABLE =
  'No walkable trail was found. Try a nearby path or open the way first.';
