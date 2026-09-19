import type { Point } from '../../../domain/world/content/v1/types';
import {
  NAVIGATION_UNREACHABLE,
  type NavigationContext,
  type NavigationLeg,
  type NavigationResult,
  type NavigationState,
  type NavigationTarget,
} from './types';

const CHECK_INTERVAL = 200;
const OFF_ROUTE_DISTANCE = 48;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const pathLength = (points: readonly Point[]) =>
  points.reduce((sum, point, i) => sum + (i ? distance(points[i - 1]!, point) : 0), 0);

function closestOnPath(position: Point, path: readonly Point[]) {
  let best: { point: Point; index: number; distance: number } | null = null;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!,
      b = path[i + 1]!;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((position.x - a.x) * dx + (position.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    const point = { x: a.x + dx * t, y: a.y + dy * t };
    const length = distance(point, position);
    if (!best || length < best.distance) best = { point, index: i, distance: length };
  }
  return best;
}

/** Pure guidance state, independent of Phaser, React, click-to-walk and persistence. */
export class NavigationSession {
  public state: NavigationState | null = null;
  private route: Point[] = [];
  private leg: NavigationLeg | null = null;
  private paths: NavigationContext['paths'] | null = null;
  private lastCheck = -Infinity;
  private plannedAt: Point | null = null;

  public stop(): void {
    this.state = null;
    this.route = [];
    this.leg = null;
    this.paths = null;
    this.plannedAt = null;
  }

  public start(
    target: NavigationTarget,
    context: NavigationContext,
    position: Point,
    now: number,
  ): NavigationResult {
    const leg = context.resolve(target);
    if (!leg) return { ok: false, message: 'That destination is no longer available on this map.' };
    if (leg === 'arrived') {
      this.stop();
      return { ok: true, arrived: true };
    }
    const route = this.plan(context, position, leg);
    if (!route) return { ok: false, message: NAVIGATION_UNREACHABLE };
    this.leg = leg;
    this.paths = context.paths;
    this.route = route;
    this.plannedAt = { ...position };
    this.lastCheck = now;
    this.state = { target, scene: context.scene, status: 'guiding', distance: 0, path: [] };
    return { ok: true, arrived: this.advance(position) };
  }

  /** Returns an arrival name once. Stationary/unreachable targets never cause an A* loop. */
  public update(context: NavigationContext, position: Point, now: number): string | null {
    if (!this.state) return null;
    const changed = context.paths !== this.paths || context.scene !== this.state.scene;
    if (!changed && now - this.lastCheck < CHECK_INTERVAL) return null;
    this.lastCheck = now;
    const target = this.state.target;
    const leg = context.resolve(target);
    if (leg === 'arrived') {
      this.stop();
      return target.name;
    }
    if (!leg) {
      this.stop();
      return null;
    }
    const closest = closestOnPath(position, this.route);
    const needPlan =
      changed ||
      this.leg?.id !== leg.id ||
      (this.state.status === 'blocked'
        ? !this.plannedAt || distance(position, this.plannedAt) >= 32
        : !closest ||
          closest.distance > OFF_ROUTE_DISTANCE ||
          !context.paths.canTravel(position, closest.point));
    this.leg = leg;
    this.paths = context.paths;
    if (needPlan) {
      this.plannedAt = { ...position };
      const route = this.plan(context, position, leg);
      if (!route) {
        this.route = [];
        this.state = {
          target,
          scene: context.scene,
          status: 'blocked',
          path: [],
          distance: 0,
          portal: leg.portal,
        };
        return null;
      }
      this.route = route;
    } else if (this.state.status === 'blocked') return null;
    else if (closest) this.route = [closest.point, ...this.route.slice(closest.index + 1)];
    this.state = { ...this.state, scene: context.scene };
    return this.advance(position) ? target.name : null;
  }

  private plan(context: NavigationContext, position: Point, leg: NavigationLeg): Point[] | null {
    if (![position.x, position.y, leg.point.x, leg.point.y, leg.radius].every(Number.isFinite))
      return null;
    const route = context.paths.findPath(position, leg.point);
    const end = route.at(-1);
    // The movement planner may snap an invalid click; never guide to a distant, unrelated bank.
    if (!end || distance(end, leg.point) > leg.radius) return null;
    return [position, ...route];
  }

  private advance(position: Point): boolean {
    if (!this.state || !this.leg) return false;
    const path = [position, ...this.route.slice(1)];
    // Keep a short connector to the projected path when walking alongside it.
    if (this.route[0] && distance(position, this.route[0]) > 1) path.splice(1, 0, this.route[0]);
    const remaining = pathLength(path);
    const reached =
      remaining <= this.leg.radius && distance(position, this.leg.point) <= this.leg.radius;
    if (reached && !this.leg.portal) {
      this.stop();
      return true;
    }
    this.state = {
      ...this.state,
      status: reached ? 'portal' : 'guiding',
      portal: this.leg.portal,
      distance: Math.round(remaining),
      path: reached ? [] : path,
    };
    return false;
  }
}
