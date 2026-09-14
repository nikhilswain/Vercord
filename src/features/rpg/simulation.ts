import { containsPoint, overlaps, resolveMovement } from '../world/engine/collision';
import { footprint, WORLD_PLAYER_FEET } from '../../domain/world/geometry';
import { RPG_MAX_MOVEMENT_POINTS, type RpgMovement } from '../../domain/presence/rpg-protocol';
import { sampleSceneId } from '../../domain/world/catalog/scenes';
import { RpgPathfinder } from './pathfinding';
import type { Point, Rect } from '../world/engine/types';
import type { RpgAction, RpgDirection, RpgLandmark, RpgNearby, RpgNpc, RpgSample } from './types';

export const RPG_FEET = WORLD_PLAYER_FEET;
const WALK_SPEED = 108;
const RUN_SPEED = 174;
const AUTO_RUN_SPEED = 240;
type MovementVector = Point & { moving: boolean; sprinting: boolean };

export function directionToward(from: Point, to: Point): RpgDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}

/** Pure local sample simulation. It owns no renderer, UI, storage, or Discord state. */
export class RpgSimulation {
  public player: Point;
  public direction: RpgDirection = 'down';
  public action: RpgAction = 'idle';
  public blocked = false;
  public movementRevision = 0;
  private movementPath: Point[] = [];
  private route: Point[] = [];
  private destination: Point | null = null;
  private pathfinder!: RpgPathfinder;
  private dynamicColliders: readonly Rect[] = [];

  public constructor(
    public sample: RpgSample,
    private sceneKey: string = sample.id,
    private readonly positions = new Map<string, Point>(),
  ) {
    this.player = this.restoredPosition();
    this.indexColliders();
  }

  public rememberPosition(): void {
    this.positions.set(this.sceneKey, { ...this.player });
  }

  public changeSample(sample: RpgSample, sceneKey: string = sample.id): void {
    this.rememberPosition();
    if (sceneKey !== this.sceneKey) {
      this.movementPath = [];
      this.movementRevision = 0;
    }
    this.sample = sample;
    this.dynamicColliders = [];
    this.sceneKey = sceneKey;
    this.player = this.restoredPosition();
    this.direction = 'down';
    this.stop();
    this.indexColliders();
  }

  private restoredPosition(): Point {
    const point = this.positions.get(this.sceneKey);
    if (point && this.isSafePosition(point)) return { ...point };
    return { ...this.sample.spawn };
  }

  /** Corrections replan the remaining intent; fresh admissions and explicit stops clear it. */
  public setPlayerPosition(location: RpgMovement, resumeDestination = false): boolean {
    const scene = sampleSceneId(this.sample);
    if (location.scene !== scene || !this.isSafePosition(location)) return false;
    const destination = resumeDestination && !this.blocked ? this.destination : null;
    this.stop();
    this.player = { x: location.x, y: location.y };
    this.movementRevision = location.revision ?? 0;
    this.movementPath = [{ ...this.player }];
    this.direction = location.direction;
    this.rememberPosition();
    if (destination) this.navigate(destination);
    return true;
  }

  /** Drain only after publishing: intermediate corners must survive both network throttles. */
  public takeMovementPath(): Point[] {
    const via = this.movementPath.slice(1, -1);
    this.movementPath = [{ ...this.player }];
    return via;
  }

  private recordMovement(point: Point): void {
    if (this.movementPath.length === 0) return;
    const last = this.movementPath.at(-1)!;
    if (Math.hypot(point.x - last.x, point.y - last.y) < 0.000001) return;
    const before = this.movementPath.at(-2);
    if (before) {
      const dx = last.x - before.x;
      const dy = last.y - before.y;
      const nx = point.x - last.x;
      const ny = point.y - last.y;
      if (Math.abs(dx * ny - dy * nx) < 0.000001 && dx * nx + dy * ny >= 0) this.movementPath.pop();
    }
    this.movementPath.push({ ...point });
  }

  private isSafePosition(point: Point): boolean {
    const feet = {
      x: point.x + RPG_FEET.offsetX,
      y: point.y + RPG_FEET.offsetY,
      width: RPG_FEET.width,
      height: RPG_FEET.height,
    };
    const bounds = this.sample.bounds;
    return (
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      feet.x >= bounds.x &&
      feet.y >= bounds.y &&
      feet.x + feet.width <= bounds.x + bounds.width &&
      feet.y + feet.height <= bounds.y + bounds.height &&
      ![
        ...this.sample.colliders,
        ...this.dynamicColliders,
        ...this.sample.npcs.map(footprint),
      ].some((box) => overlaps(feet, box))
    );
  }

  public stop(): void {
    this.route = [];
    this.destination = null;
    this.action = 'idle';
  }

  public setDynamicColliders(colliders: readonly Rect[]): void {
    if (this.dynamicColliders === colliders) return;
    const destination = this.destination;
    this.dynamicColliders = colliders;
    this.stop();
    this.indexColliders();
    if (destination && !this.blocked) this.navigate(destination);
  }

  public navigate(point: Point): void {
    if (this.blocked) return;
    this.route = this.pathfinder.findPath(this.player, point);
    this.destination = this.route.at(-1) ?? null;
  }

  public tick(delta: number, movement: MovementVector): void {
    if (this.blocked) {
      this.stop();
      return;
    }
    const dt = Math.min(0.05, Math.max(0, delta));
    if (dt === 0) return;
    let dx = movement.x;
    let dy = movement.y;
    let autoRunning = false;
    let travel = (movement.sprinting ? RUN_SPEED : WALK_SPEED) * dt;
    if (movement.moving) {
      this.route = [];
      this.destination = null;
    } else {
      while (
        this.route[0] &&
        Math.hypot(this.route[0].x - this.player.x, this.route[0].y - this.player.y) < 0.000001
      ) {
        this.route.shift();
      }
      const target = this.route[0];
      if (!target) this.destination = null;
      if (target) {
        autoRunning = true;
        dx = target.x - this.player.x;
        dy = target.y - this.player.y;
        travel = Math.min(AUTO_RUN_SPEED * dt, Math.hypot(dx, dy));
      }
    }
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      this.action = 'idle';
      return;
    }
    dx = (dx / length) * travel;
    dy = (dy / length) * travel;
    const feet = {
      x: this.player.x + RPG_FEET.offsetX,
      y: this.player.y + RPG_FEET.offsetY,
      width: RPG_FEET.width,
      height: RPG_FEET.height,
    };
    const obstacles = this.queryColliders({
      x: feet.x - Math.abs(dx),
      y: feet.y - Math.abs(dy),
      width: feet.width + Math.abs(dx) * 2,
      height: feet.height + Math.abs(dy) * 2,
    });
    let next = { ...this.player };
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 5));
    for (let step = 0; step < steps; step++) {
      // At most 32 turns can wait for a publication; a stalled consumer cannot grow a history.
      if (this.movementPath.length > RPG_MAX_MOVEMENT_POINTS - 1) break;
      const result = resolveMovement(
        { ...feet, x: next.x + RPG_FEET.offsetX, y: next.y + RPG_FEET.offsetY },
        dx / steps,
        dy / steps,
        obstacles,
        this.sample.bounds,
      );
      const point = { x: result.x - RPG_FEET.offsetX, y: result.y - RPG_FEET.offsetY };
      // Collision resolution moves x then y. Preserve that elbow only when its diagonal is unsafe.
      if (
        this.movementPath.length > 0 &&
        point.x !== next.x &&
        point.y !== next.y &&
        !this.pathfinder.canTravel(next, point)
      )
        this.recordMovement({ x: point.x, y: next.y });
      this.recordMovement(point);
      next = point;
    }
    // A fractional final step still reaches a waypoint; only no progress means a collision.
    const moved = next.x !== this.player.x || next.y !== this.player.y;
    this.direction = directionToward({ x: 0, y: 0 }, { x: dx, y: dy });
    this.action = moved ? (autoRunning || movement.sprinting ? 'run' : 'walk') : 'idle';
    this.player = next;
    if (!moved && !movement.moving) this.stop();
  }

  public nearby(openHouses = false): { ui: RpgNearby; target: RpgNpc | RpgLandmark } | null {
    let nearest: { ui: RpgNearby; target: RpgNpc | RpgLandmark; distance: number } | null = null;
    for (const target of [...this.sample.npcs, ...this.sample.landmarks]) {
      const distance = Math.hypot(target.x - this.player.x, target.y - this.player.y);
      const radius = 'lines' in target ? 64 : target.radius;
      if (distance > radius || (nearest && distance >= nearest.distance)) continue;
      if (!this.lineIsClear(target)) continue;
      nearest = {
        target,
        distance,
        ui: {
          id: target.id,
          label: target.name,
          action:
            'lines' in target
              ? 'Talk'
              : openHouses && target.id.startsWith('house:')
                ? 'Open'
                : target.kind === 'portal' ||
                    (target.id === 'town-square' && this.sample.townSquareNavigation)
                  ? 'Explore'
                  : 'Read',
        },
      };
    }
    return nearest;
  }

  public place(): string {
    let closest: RpgLandmark | null = null;
    let distance = 180;
    for (const landmark of this.sample.landmarks) {
      const next = Math.hypot(landmark.x - this.player.x, landmark.y - this.player.y);
      if (next < distance) {
        closest = landmark;
        distance = next;
      }
    }
    return closest?.name ?? this.sample.name;
  }

  private lineIsClear(target: Point): boolean {
    const obstacles = [...this.sample.colliders, ...this.dynamicColliders];
    const steps = Math.ceil(Math.hypot(target.x - this.player.x, target.y - this.player.y) / 8);
    for (let step = 1; step < steps; step += 1) {
      const x = this.player.x + ((target.x - this.player.x) * step) / steps;
      const y = this.player.y - 4 + ((target.y - this.player.y) * step) / steps;
      if (obstacles.some((box) => containsPoint(box, x, y))) return false;
    }
    return true;
  }

  private indexColliders(): void {
    this.pathfinder = new RpgPathfinder(
      this.sample.bounds,
      [...this.sample.colliders, ...this.dynamicColliders, ...this.sample.npcs.map(footprint)],
      RPG_FEET,
      this.sample.terrain?.roads,
    );
  }

  private queryColliders(box: Rect): Rect[] {
    return this.pathfinder.queryColliders(box);
  }
}
