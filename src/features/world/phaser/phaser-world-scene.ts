import * as Phaser from 'phaser';

import type { AvatarId } from '../../../domain/avatar/identity';
import type { ClientPresenceLocation, PresencePlayer } from '../../../domain/presence/protocol';
import { WorldCamera } from '../engine/camera';
import { containsPoint, resolveMovement } from '../engine/collision';
import { WorldInput } from '../engine/input';
import { findPath } from '../engine/pathfinding';
import { createRoomWorld } from '../engine/room-world';
import type {
  Direction,
  PlayerState,
  Point,
  WorldArea,
  WorldDefinition,
  WorldPortal,
  WorldUiState,
} from '../engine/types';
import {
  PhaserWorldRenderer,
  preloadWorldAssets,
  primaryWorldAssetLoaded,
} from './phaser-world-renderer';

const WALK_SPEED = 150;
const ROOM_WALK_SPEED = 75;
const SPRINT_MULTIPLIER = 1.65;

export interface PhaserWorldCallbacks {
  onReady: () => void;
  onAssetError: () => void;
  onUiChange: (state: WorldUiState) => void;
  onSceneChange: (room: WorldPortal | null) => void;
  onPresenceMove?: (location: ClientPresenceLocation) => void;
}

export class PhaserWorldScene extends Phaser.Scene {
  private readonly worldCamera = new WorldCamera();
  private readonly movementInput = new WorldInput();
  private readonly player: PlayerState;
  private readonly campusWorld: WorldDefinition;
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private worldRenderer: PhaserWorldRenderer | null = null;
  private world: WorldDefinition;
  private campusPlayer: PlayerState | null = null;
  private campusZoom = 1;
  private currentRoom: WorldPortal | null = null;
  private elapsed = 0;
  private viewport = { width: 1, height: 1 };
  private route: Point[] = [];
  private routeTarget: Point | null = null;
  private area: WorldArea | null = null;
  private nearbyPortal: WorldPortal | null = null;
  private previousZoom = -1;
  private pointerId: number | null = null;
  private pointerStart: Point | null = null;
  private lastPointer: Point | null = null;
  private dragging = false;
  private pinchDistance: number | null = null;
  private pinchMidpoint: Point | null = null;
  private ready = false;
  private cleanedUp = false;
  private remotePlayers: readonly PresencePlayer[] = [];
  private playerAvatarId: AvatarId | null = null;

  public constructor(
    world: WorldDefinition,
    private readonly callbacks: PhaserWorldCallbacks,
  ) {
    super({ key: 'dmap-world' });
    this.world = world;
    this.campusWorld = world;
    this.player = { ...world.spawn, direction: 'down', moving: false };
  }

  public preload(): void {
    preloadWorldAssets(this, this.world.theme);
  }

  public create(): void {
    if (!primaryWorldAssetLoaded(this)) {
      this.callbacks.onAssetError();
      return;
    }

    this.worldRenderer = new PhaserWorldRenderer(this, this.world);
    this.worldRenderer.rebuild(this.world, this.player);
    if (this.playerAvatarId) this.worldRenderer.setPlayerAvatar(this.playerAvatarId, this.player);
    this.bindEvents();
    this.resize(this.viewport.width, this.viewport.height);
    this.updateUiState();
    this.ready = true;
    this.callbacks.onReady();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  public update(_time: number, delta: number): void {
    if (!this.ready || !this.worldRenderer) return;
    const deltaSeconds = Math.min(0.05, Math.max(0, delta / 1000));
    this.elapsed += delta;
    this.updateMovement(deltaSeconds);
    this.worldCamera.update(this.player, this.world.bounds, deltaSeconds * 60);
    this.updateUiState();
    this.worldRenderer.update(
      this.player,
      this.elapsed,
      this.reduceMotion,
      this.route,
      this.routeTarget,
      this.nearbyPortal,
      this.worldCamera,
      this.remotePlayers,
      this.presenceScene(),
      deltaSeconds,
    );
    this.publishPresence();
  }

  public resize(width: number, height: number): void {
    this.viewport = { width: Math.max(1, width), height: Math.max(1, height) };
    this.worldCamera.resize(this.viewport.width, this.viewport.height);
    this.worldRenderer?.resize(this.viewport.width, this.viewport.height);
    if (this.world.environment === 'interior') {
      this.worldCamera.fitBounds(this.player, this.world.bounds);
    } else {
      this.worldCamera.centerImmediately(this.player, this.world.bounds);
    }
  }

  public zoomIn(): void {
    this.worldCamera.zoomBy(1.2, this.viewportCenter(), this.world.bounds);
  }

  public zoomOut(): void {
    this.worldCamera.zoomBy(1 / 1.2, this.viewportCenter(), this.world.bounds);
  }

  public resetView(): void {
    if (this.world.environment === 'interior') {
      this.worldCamera.fitBounds(this.player, this.world.bounds);
    } else {
      this.worldCamera.resetZoom();
      this.worldCamera.follow(this.player, this.world.bounds);
    }
  }

  public setVirtualAxis(x: number, y: number, sprinting = false): void {
    this.movementInput.setVirtualAxis(x, y, sprinting);
  }

  public interact(): void {
    if (!this.nearbyPortal) return;
    if (this.nearbyPortal.destination === 'room') this.enterRoom(this.nearbyPortal);
    else this.leaveRoom();
  }

  public setRemotePlayers(players: readonly PresencePlayer[]): void {
    this.remotePlayers = players;
  }

  public setPlayerAvatar(avatarId: AvatarId): void {
    this.playerAvatarId = avatarId;
    this.worldRenderer?.setPlayerAvatar(avatarId, this.player);
  }

  private updateMovement(deltaSeconds: number): void {
    const input = this.movementInput.getMovement();
    let movementX = 0;
    let movementY = 0;

    if (input.moving) {
      this.route = [];
      this.routeTarget = null;
      movementX = input.x;
      movementY = input.y;
      this.worldCamera.follow(this.player, this.world.bounds);
    } else {
      const waypoint = this.route[0];
      if (waypoint) {
        const distanceX = waypoint.x - this.player.x;
        const distanceY = waypoint.y - this.player.y;
        const distance = Math.hypot(distanceX, distanceY);
        if (distance < 7) {
          this.route.shift();
          if (this.route.length === 0) this.routeTarget = null;
        } else {
          movementX = distanceX / distance;
          movementY = distanceY / distance;
        }
      }
    }

    const moving = movementX !== 0 || movementY !== 0;
    this.player.moving = moving;
    if (!moving) return;

    this.player.direction = this.directionFromVector(movementX, movementY);
    const baseSpeed = this.world.environment === 'interior' ? ROOM_WALK_SPEED : WALK_SPEED;
    const speed = baseSpeed * (input.sprinting ? SPRINT_MULTIPLIER : 1);
    const collider = this.world.theme.avatar?.collider ?? {
      width: 18,
      height: 12,
      offsetX: -9,
      offsetY: -5,
    };
    const playerBox = {
      x: this.player.x + collider.offsetX,
      y: this.player.y + collider.offsetY,
      width: collider.width,
      height: collider.height,
    };
    const next = resolveMovement(
      playerBox,
      movementX * speed * deltaSeconds,
      movementY * speed * deltaSeconds,
      this.world.colliders,
      this.world.bounds,
    );
    this.player.x = next.x - collider.offsetX;
    this.player.y = next.y - collider.offsetY;
  }

  private updateUiState(): void {
    const nextArea =
      this.world.areas.find((area) => containsPoint(area.bounds, this.player.x, this.player.y)) ??
      null;
    const portalRadius = this.world.environment === 'interior' ? 42 : 82;
    const nextPortal =
      this.world.portals
        .map((portal) => ({
          portal,
          distance: Math.hypot(portal.x - this.player.x, portal.y - this.player.y),
        }))
        .filter(({ distance }) => distance <= portalRadius)
        .sort((left, right) => left.distance - right.distance)[0]?.portal ?? null;
    const zoom = Math.round(this.worldCamera.zoom * 100);

    if (
      nextArea?.key === this.area?.key &&
      nextPortal?.key === this.nearbyPortal?.key &&
      zoom === this.previousZoom
    ) {
      return;
    }

    this.area = nextArea;
    this.nearbyPortal = nextPortal;
    this.previousZoom = zoom;
    this.callbacks.onUiChange({
      area: this.area,
      nearbyPortal: this.nearbyPortal,
      room: this.currentRoom,
      environment: this.world.environment,
      zoom,
    });
  }

  private directionFromVector(x: number, y: number): Direction {
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
    return y > 0 ? 'down' : 'up';
  }

  private bindEvents(): void {
    const canvas = this.game.canvas;
    window.addEventListener('keydown', this.handleKeyDown);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.handleTouchEnd);
    canvas.addEventListener('touchcancel', this.handleTouchEnd);
  }

  private readonly cleanup = (): void => {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.ready = false;
    this.movementInput.destroy();
    const canvas = this.game.canvas;
    window.removeEventListener('keydown', this.handleKeyDown);
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    canvas.removeEventListener('wheel', this.handleWheel);
    canvas.removeEventListener('touchstart', this.handleTouchStart);
    canvas.removeEventListener('touchmove', this.handleTouchMove);
    canvas.removeEventListener('touchend', this.handleTouchEnd);
    canvas.removeEventListener('touchcancel', this.handleTouchEnd);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      return;
    if (event.code === 'KeyE' && !event.repeat) this.interact();
    if (event.code === 'Escape') {
      this.route = [];
      this.routeTarget = null;
      this.worldCamera.follow(this.player, this.world.bounds);
    }
    if (event.key === '+' || event.key === '=') this.zoomIn();
    if (event.key === '-' || event.key === '_') this.zoomOut();
    if (event.key === '0') this.resetView();
    if (['KeyE', 'Escape', 'Equal', 'Minus', 'Digit0'].includes(event.code)) event.preventDefault();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || this.pointerId !== null) return;
    this.game.canvas.focus({ preventScroll: true });
    this.pointerId = event.pointerId;
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.dragging = false;
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || !this.pointerStart || !this.lastPointer) return;
    const distance = Math.hypot(
      event.clientX - this.pointerStart.x,
      event.clientY - this.pointerStart.y,
    );
    if (!this.dragging && distance >= 7) {
      this.dragging = true;
      this.route = [];
      this.routeTarget = null;
      this.game.canvas.classList.add('is-dragging');
    }
    if (this.dragging && this.pinchDistance === null) {
      this.worldCamera.panBy(
        -(event.clientX - this.lastPointer.x) / this.worldCamera.zoom,
        -(event.clientY - this.lastPointer.y) / this.worldCamera.zoom,
        this.world.bounds,
      );
      this.lastPointer = { x: event.clientX, y: event.clientY };
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    const shouldNavigate = !this.dragging && this.pinchDistance === null;
    this.pointerId = null;
    this.pointerStart = null;
    this.lastPointer = null;
    this.dragging = false;
    this.game.canvas.classList.remove('is-dragging');
    if (!shouldNavigate) return;
    const point = this.clientToScreen(event.clientX, event.clientY);
    const worldPoint = this.worldCamera.screenToWorld(point.x, point.y);
    const path = findPath(this.player, worldPoint, this.world.colliders, this.world.bounds);
    this.route = path;
    this.routeTarget = path.length > 0 ? worldPoint : null;
    if (path.length > 0) this.worldCamera.follow(this.player, this.world.bounds);
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const anchor = this.clientToScreen(event.clientX, event.clientY);
    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= 300;
    const clampedDelta = Math.max(-40, Math.min(40, delta));
    this.worldCamera.zoomBy(
      Math.exp(-clampedDelta * (event.ctrlKey ? 0.006 : 0.0018)),
      anchor,
      this.world.bounds,
    );
  };

  private readonly handleTouchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const first = event.touches.item(0);
    const second = event.touches.item(1);
    if (!first || !second) return;
    this.dragging = true;
    this.pinchDistance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    this.pinchMidpoint = {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    };
  };

  private readonly handleTouchMove = (event: TouchEvent): void => {
    if (event.touches.length !== 2 || this.pinchDistance === null || !this.pinchMidpoint) return;
    event.preventDefault();
    const first = event.touches.item(0);
    const second = event.touches.item(1);
    if (!first || !second) return;
    const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    const midpoint = {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    };
    const anchor = this.clientToScreen(midpoint.x, midpoint.y);
    if (this.pinchDistance > 0) {
      this.worldCamera.zoomBy(distance / this.pinchDistance, anchor, this.world.bounds);
    }
    this.worldCamera.panBy(
      -(midpoint.x - this.pinchMidpoint.x) / this.worldCamera.zoom,
      -(midpoint.y - this.pinchMidpoint.y) / this.worldCamera.zoom,
      this.world.bounds,
    );
    this.pinchDistance = distance;
    this.pinchMidpoint = midpoint;
  };

  private readonly handleTouchEnd = (event: TouchEvent): void => {
    if (event.touches.length >= 2) return;
    this.pinchDistance = null;
    this.pinchMidpoint = null;
  };

  private clientToScreen(clientX: number, clientY: number): Point {
    const rect = this.game.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private viewportCenter(): Point {
    return { x: this.viewport.width / 2, y: this.viewport.height / 2 };
  }

  private presenceScene(): ClientPresenceLocation['scene'] {
    return this.currentRoom ? `room:${this.currentRoom.room.key}` : 'exterior';
  }

  private publishPresence(): void {
    this.callbacks.onPresenceMove?.({
      x: Math.round(this.player.x * 10) / 10,
      y: Math.round(this.player.y * 10) / 10,
      direction: this.player.direction,
      moving: this.player.moving,
      scene: this.presenceScene(),
    });
  }

  private enterRoom(portal: WorldPortal): void {
    this.campusPlayer = { ...this.player };
    this.campusZoom = this.worldCamera.zoom;
    this.currentRoom = portal;
    this.switchWorld(createRoomWorld(portal, this.campusWorld.theme), 'up');
    this.callbacks.onSceneChange(portal);
  }

  private leaveRoom(): void {
    const campusPlayer = this.campusPlayer;
    this.world = this.campusWorld;
    this.currentRoom = null;
    this.route = [];
    this.routeTarget = null;
    if (campusPlayer) Object.assign(this.player, campusPlayer);
    else Object.assign(this.player, this.campusWorld.spawn, { direction: 'down', moving: false });
    this.resetUiCache();
    this.worldRenderer?.rebuild(this.world, this.player);
    this.worldRenderer?.resize(this.viewport.width, this.viewport.height);
    this.worldCamera.setZoomImmediately(this.campusZoom, this.player, this.world.bounds);
    this.callbacks.onSceneChange(null);
  }

  private switchWorld(world: WorldDefinition, direction: Direction): void {
    this.world = world;
    this.route = [];
    this.routeTarget = null;
    Object.assign(this.player, world.spawn, { direction, moving: false });
    this.resetUiCache();
    this.worldRenderer?.rebuild(this.world, this.player);
    this.worldRenderer?.resize(this.viewport.width, this.viewport.height);
    this.worldCamera.fitBounds(this.player, world.bounds);
  }

  private resetUiCache(): void {
    this.area = null;
    this.nearbyPortal = null;
    this.previousZoom = -1;
  }
}
