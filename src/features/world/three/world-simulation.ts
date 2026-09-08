import type { ClientPresenceLocation } from '../../../domain/presence/protocol';
import { containsPoint, overlaps, resolveMovement } from '../engine/collision';
import type { MovementVector } from '../engine/input';
import { findPath } from '../engine/pathfinding';
import { createRoomWorld } from '../engine/room-world';
import type {
  PlayerState,
  Point,
  WorldDefinition,
  WorldPortal,
  WorldUiState,
} from '../engine/types';
import type { WorldCallbacks } from '../engine/world-runtime';

/** The experiment keeps feet and network positions in the existing 2D world coordinate system. */
export class WorldSimulation {
  public readonly player: PlayerState;
  public world: WorldDefinition;
  public campusWorld: WorldDefinition;
  public currentRoom: WorldPortal | null = null;
  public revision = 0;
  private campusPlayer: PlayerState | null = null;
  private route: Point[] = [];

  public constructor(
    world: WorldDefinition,
    private readonly callbacks: Pick<WorldCallbacks, 'onSceneChange'>,
  ) {
    this.world = world;
    this.campusWorld = world;
    this.player = { ...world.spawn, moving: false, direction: 'down' };
  }

  public get scene(): ClientPresenceLocation['scene'] {
    return this.currentRoom ? `room:${this.currentRoom.room.key}` : 'exterior';
  }

  public get nearbyPortal(): WorldPortal | null {
    const radius = this.world.environment === 'interior' ? 42 : 82;
    let nearest: WorldPortal | null = null;
    let distance = radius;
    for (const portal of this.world.portals) {
      const candidate = Math.hypot(portal.x - this.player.x, portal.y - this.player.y);
      if (candidate <= distance) {
        nearest = portal;
        distance = candidate;
      }
    }
    return nearest;
  }

  public ui(zoom: number): WorldUiState {
    return {
      area:
        this.world.areas.find((area) => containsPoint(area.bounds, this.player.x, this.player.y)) ??
        null,
      nearbyPortal: this.nearbyPortal,
      room: this.currentRoom,
      environment: this.world.environment,
      zoom,
    };
  }

  public tick(deltaSeconds: number, input: MovementVector, blocked = false): void {
    if (blocked) {
      this.stopNavigation();
      this.player.moving = false;
      return;
    }
    const delta = Number.isFinite(deltaSeconds) ? Math.min(0.05, Math.max(0, deltaSeconds)) : 0;
    let x = input.x;
    let y = input.y;
    let remaining: number | null = null;
    if (input.moving) this.stopNavigation();
    else {
      x = 0;
      y = 0;
      let waypoint = this.route[0];
      while (waypoint && Math.hypot(waypoint.x - this.player.x, waypoint.y - this.player.y) < 4) {
        this.route.shift();
        waypoint = this.route[0];
      }
      if (waypoint) {
        remaining = Math.hypot(waypoint.x - this.player.x, waypoint.y - this.player.y);
        x = (waypoint.x - this.player.x) / remaining;
        y = (waypoint.y - this.player.y) / remaining;
      }
    }
    this.player.moving = false;
    if (x === 0 && y === 0) return;
    const speed =
      (this.world.environment === 'interior' ? 75 : 150) *
      (remaining !== null ? 4 : input.sprinting ? 1.65 : 1);
    const distance = Math.min(speed * delta, remaining ?? Infinity);
    const collider = this.collider(this.world);
    const next = resolveMovement(
      {
        x: this.player.x + collider.offsetX,
        y: this.player.y + collider.offsetY,
        width: collider.width,
        height: collider.height,
      },
      x * distance,
      y * distance,
      this.world.colliders,
      this.world.bounds,
    );
    const nextX = next.x - collider.offsetX;
    const nextY = next.y - collider.offsetY;
    this.player.moving = Math.hypot(nextX - this.player.x, nextY - this.player.y) > 0.01;
    this.player.direction =
      Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
    this.player.x = nextX;
    this.player.y = nextY;
    if (!this.player.moving) this.stopNavigation();
  }

  public navigate(point: Point): void {
    this.route = findPath(
      this.player,
      point,
      this.world.colliders,
      this.world.bounds,
      this.collider(this.world),
    );
  }

  public stopNavigation(): void {
    this.route = [];
  }

  public interact(): void {
    const portal = this.nearbyPortal;
    if (!portal) return;
    if (portal.destination === 'room') this.enterRoomByKey(portal.room.key);
    else this.leaveRoom();
  }

  public enterRoomByKey(roomKey: string): boolean {
    if (this.currentRoom?.room.key === roomKey) return true;
    const portal = this.campusWorld.portals.find(
      (item) => item.destination === 'room' && item.room.key === roomKey,
    );
    if (!portal) return false;
    if (!this.currentRoom) this.campusPlayer = { ...this.player };
    this.currentRoom = portal;
    this.world = createRoomWorld(portal, this.campusWorld.theme);
    Object.assign(this.player, this.world.spawn, { moving: false, direction: 'up' });
    this.changed();
    this.callbacks.onSceneChange(portal);
    return true;
  }

  public updateWorld(world: WorldDefinition): void {
    if (world === this.campusWorld) return;
    const previousRoom = this.currentRoom;
    this.campusWorld = world;
    this.currentRoom = previousRoom
      ? (world.portals.find((portal) => portal.room.key === previousRoom.room.key) ?? null)
      : null;
    this.world = this.currentRoom ? createRoomWorld(this.currentRoom, world.theme) : world;
    if (this.campusPlayer && !this.validPosition(this.campusPlayer, world))
      Object.assign(this.campusPlayer, world.spawn);
    if (previousRoom && !this.currentRoom)
      Object.assign(this.player, this.campusPlayer ?? world.spawn);
    if (!this.validPosition(this.player, this.world)) Object.assign(this.player, this.world.spawn);
    this.changed();
    this.callbacks.onSceneChange(this.currentRoom, 'refresh');
  }

  private leaveRoom(): void {
    this.world = this.campusWorld;
    this.currentRoom = null;
    Object.assign(this.player, this.campusPlayer ?? this.world.spawn, { direction: 'down' });
    this.changed();
    this.callbacks.onSceneChange(null);
  }

  private changed(): void {
    this.player.moving = false;
    this.stopNavigation();
    this.revision++;
  }

  private collider(world: WorldDefinition) {
    return world.theme.avatar?.collider ?? { width: 18, height: 12, offsetX: -9, offsetY: -5 };
  }

  private validPosition(point: Point, world: WorldDefinition): boolean {
    const collider = this.collider(world);
    const box = {
      x: point.x + collider.offsetX,
      y: point.y + collider.offsetY,
      width: collider.width,
      height: collider.height,
    };
    return (
      containsPoint(world.bounds, box.x, box.y) &&
      containsPoint(world.bounds, box.x + box.width, box.y + box.height) &&
      !world.colliders.some((obstacle) => overlaps(box, obstacle))
    );
  }
}
