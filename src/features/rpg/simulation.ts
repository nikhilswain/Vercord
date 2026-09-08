import { containsPoint, overlaps, resolveMovement } from '../world/engine/collision';
import { footprint, WORLD_PLAYER_FEET } from '../../domain/world/geometry';
import { findPath } from '../world/engine/pathfinding';
import type { MovementVector } from '../world/engine/input';
import type { Point, Rect } from '../world/engine/types';
import type { RpgAction, RpgDirection, RpgLandmark, RpgNearby, RpgNpc, RpgSample } from './types';

export const RPG_FEET = WORLD_PLAYER_FEET;
const WALK_SPEED = 108;
const RUN_SPEED = 174;
const AUTO_RUN_SPEED = 240;

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
  private route: Point[] = [];
  private colliders: Rect[] = [];
  private readonly collisionCells = new Map<string, Rect[]>();

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
    this.sample = sample;
    this.sceneKey = sceneKey;
    this.player = this.restoredPosition();
    this.direction = 'down';
    this.stop();
    this.indexColliders();
  }

  private restoredPosition(): Point {
    const point = this.positions.get(this.sceneKey);
    if (point) {
      const feet = {
        x: point.x + RPG_FEET.offsetX,
        y: point.y + RPG_FEET.offsetY,
        width: RPG_FEET.width,
        height: RPG_FEET.height,
      };
      const bounds = this.sample.bounds;
      if (
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        feet.x >= bounds.x &&
        feet.y >= bounds.y &&
        feet.x + feet.width <= bounds.x + bounds.width &&
        feet.y + feet.height <= bounds.y + bounds.height &&
        ![...this.sample.colliders, ...this.sample.npcs.map(footprint)].some((box) =>
          overlaps(feet, box),
        )
      )
        return { ...point };
    }
    return { ...this.sample.spawn };
  }

  public stop(): void {
    this.route = [];
    this.action = 'idle';
  }

  public navigate(point: Point): void {
    if (this.blocked) return;
    this.route = findPath(this.player, point, this.colliders, this.sample.bounds, RPG_FEET);
  }

  public tick(delta: number, movement: MovementVector): void {
    if (this.blocked) {
      this.stop();
      return;
    }
    const dt = Math.min(0.05, Math.max(0, delta));
    let dx = movement.x;
    let dy = movement.y;
    let autoRunning = false;
    let travel = (movement.sprinting ? RUN_SPEED : WALK_SPEED) * dt;
    if (movement.moving) this.route = [];
    else {
      while (
        this.route[0] &&
        Math.hypot(this.route[0].x - this.player.x, this.route[0].y - this.player.y) < 2
      ) {
        this.route.shift();
      }
      const target = this.route[0];
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
    const result = resolveMovement(feet, dx, dy, obstacles, this.sample.bounds);
    const next = { x: result.x - RPG_FEET.offsetX, y: result.y - RPG_FEET.offsetY };
    const moved = Math.hypot(next.x - this.player.x, next.y - this.player.y) > 0.01;
    this.direction = directionToward({ x: 0, y: 0 }, { x: dx, y: dy });
    this.action = moved ? (autoRunning || movement.sprinting ? 'run' : 'walk') : 'idle';
    this.player = next;
    if (!moved && !movement.moving) this.stop();
  }

  public nearby(): { ui: RpgNearby; target: RpgNpc | RpgLandmark } | null {
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
    const steps = Math.ceil(Math.hypot(target.x - this.player.x, target.y - this.player.y) / 8);
    for (let step = 1; step < steps; step += 1) {
      const x = this.player.x + ((target.x - this.player.x) * step) / steps;
      const y = this.player.y - 4 + ((target.y - this.player.y) * step) / steps;
      if (this.sample.colliders.some((box) => containsPoint(box, x, y))) return false;
    }
    return true;
  }

  private indexColliders(): void {
    this.colliders = [...this.sample.colliders, ...this.sample.npcs.map(footprint)];
    this.collisionCells.clear();
    for (const box of this.colliders) {
      for (const cell of this.cellsFor(box)) {
        const entries = this.collisionCells.get(cell) ?? [];
        entries.push(box);
        this.collisionCells.set(cell, entries);
      }
    }
  }

  private queryColliders(box: Rect): Rect[] {
    const result = new Set<Rect>();
    for (const cell of this.cellsFor(box)) {
      for (const collider of this.collisionCells.get(cell) ?? []) result.add(collider);
    }
    return [...result];
  }

  private cellsFor(box: Rect): string[] {
    const keys: string[] = [];
    for (let x = Math.floor(box.x / 128); x <= Math.floor((box.x + box.width) / 128); x += 1) {
      for (let y = Math.floor(box.y / 128); y <= Math.floor((box.y + box.height) / 128); y += 1)
        keys.push(`${x}:${y}`);
    }
    return keys;
  }
}
