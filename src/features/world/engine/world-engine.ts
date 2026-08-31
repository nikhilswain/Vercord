import { WorldCamera } from './camera';
import { containsPoint, resolveMovement } from './collision';
import { WorldInput } from './input';
import { findPath } from './pathfinding';
import { renderWorld } from './render-world';
import { createRoomWorld } from './room-world';
import type {
  Direction,
  PlayerState,
  Point,
  WorldArea,
  WorldDefinition,
  WorldPortal,
  WorldUiState,
} from './types';

const WALK_SPEED = 150;
const SPRINT_MULTIPLIER = 1.65;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error(`Unable to load ${url}`)), { once: true });
    image.src = url;
  });
}

interface WorldEngineCallbacks {
  onReady: () => void;
  onAssetError: () => void;
  onUiChange: (state: WorldUiState) => void;
  onSceneChange: (room: WorldPortal | null) => void;
}

export class WorldEngine {
  private readonly context: CanvasRenderingContext2D;
  private readonly camera = new WorldCamera();
  private readonly input = new WorldInput();
  private readonly player: PlayerState;
  private readonly campusWorld: WorldDefinition;
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private image: HTMLImageElement | null = null;
  private avatarImages: HTMLImageElement[] = [];
  private world: WorldDefinition;
  private campusPlayer: PlayerState | null = null;
  private currentRoom: WorldPortal | null = null;
  private animationFrame: number | null = null;
  private previousTime = 0;
  private elapsed = 0;
  private viewport = { width: 1, height: 1 };
  private route: Point[] = [];
  private routeTarget: Point | null = null;
  private area: WorldArea | null = null;
  private nearbyPortal: WorldPortal | null = null;
  private previousZoom = -1;
  private destroyed = false;
  private pointerId: number | null = null;
  private pointerStart: Point | null = null;
  private lastPointer: Point | null = null;
  private dragging = false;
  private pinchDistance: number | null = null;
  private pinchMidpoint: Point | null = null;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    world: WorldDefinition,
    private readonly callbacks: WorldEngineCallbacks,
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
    this.world = world;
    this.campusWorld = world;
    this.player = {
      ...world.spawn,
      direction: 'down',
      moving: false,
    };
    this.bindEvents();
  }

  public start(): void {
    const avatarUrls = this.world.theme.avatar?.layerUrls ?? [];
    const avatarImages = Promise.all(avatarUrls.map((url) => loadImage(url))).catch(() => []);
    void Promise.all([loadImage(this.world.theme.atlasUrl), avatarImages])
      .then(([image, layers]) => {
        if (this.destroyed) return;
        this.image = image;
        this.avatarImages = layers;
        this.callbacks.onReady();
        this.previousTime = performance.now();
        this.animationFrame = requestAnimationFrame(this.frame);
      })
      .catch(() => {
        if (!this.destroyed) this.callbacks.onAssetError();
      });
  }

  public resize(width: number, height: number): void {
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.viewport = { width, height };
    this.canvas.width = Math.max(1, Math.round(width * pixelRatio));
    this.canvas.height = Math.max(1, Math.round(height * pixelRatio));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.camera.resize(width, height);
    this.camera.centerImmediately(this.player, this.world.bounds);
  }

  public zoomIn(): void {
    this.camera.zoomBy(1.2, this.viewportCenter(), this.world.bounds);
  }

  public zoomOut(): void {
    this.camera.zoomBy(1 / 1.2, this.viewportCenter(), this.world.bounds);
  }

  public resetView(): void {
    this.camera.resetZoom();
    this.camera.follow(this.player, this.world.bounds);
  }

  public setVirtualAxis(x: number, y: number, sprinting = false): void {
    this.input.setVirtualAxis(x, y, sprinting);
  }

  public interact(): void {
    if (!this.nearbyPortal) return;
    if (this.nearbyPortal.destination === 'room') this.enterRoom(this.nearbyPortal);
    else this.leaveRoom();
  }

  public destroy(): void {
    this.destroyed = true;
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.input.destroy();
    window.removeEventListener('keydown', this.handleKeyDown);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
  }

  private readonly frame = (time: number): void => {
    if (this.destroyed) return;
    if (!this.image) return;
    const deltaSeconds = Math.min(0.05, Math.max(0, (time - this.previousTime) / 1000));
    this.previousTime = time;
    this.elapsed += deltaSeconds * 1000;
    this.update(deltaSeconds);
    renderWorld(this.context, this.image, this.avatarImages, this.world, this.camera, this.viewport, {
      elapsed: this.elapsed,
      player: this.player,
      nearbyPortal: this.nearbyPortal,
      route: this.route,
      routeTarget: this.routeTarget,
      reduceMotion: this.reduceMotion,
    });
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private update(deltaSeconds: number): void {
    const input = this.input.getMovement();
    let movementX = 0;
    let movementY = 0;

    if (input.moving) {
      this.route = [];
      this.routeTarget = null;
      movementX = input.x;
      movementY = input.y;
      this.camera.follow(this.player, this.world.bounds);
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
    if (moving) {
      this.player.direction = this.directionFromVector(movementX, movementY);
      const speed = WALK_SPEED * (input.sprinting ? SPRINT_MULTIPLIER : 1);
      const playerBox = {
        x: this.player.x - 9,
        y: this.player.y - 5,
        width: 18,
        height: 12,
      };
      const next = resolveMovement(
        playerBox,
        movementX * speed * deltaSeconds,
        movementY * speed * deltaSeconds,
        this.world.colliders,
        this.world.bounds,
      );
      this.player.x = next.x + 9;
      this.player.y = next.y + 5;
    }

    this.camera.update(this.player, this.world.bounds, deltaSeconds * 60);
    this.updateUiState();
  }

  private updateUiState(): void {
    const nextArea =
      this.world.areas.find((area) => containsPoint(area.bounds, this.player.x, this.player.y)) ?? null;
    const nextPortal =
      this.world.portals
        .map((portal) => ({ portal, distance: Math.hypot(portal.x - this.player.x, portal.y - this.player.y) }))
        .filter(({ distance }) => distance <= 82)
        .sort((a, b) => a.distance - b.distance)[0]?.portal ?? null;
    const zoom = Math.round(this.camera.zoom * 100);

    if (
      nextArea?.key !== this.area?.key ||
      nextPortal?.key !== this.nearbyPortal?.key ||
      zoom !== this.previousZoom
    ) {
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
  }

  private directionFromVector(x: number, y: number): Direction {
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
    return y > 0 ? 'down' : 'up';
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd);
    this.canvas.addEventListener('touchcancel', this.handleTouchEnd);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.code === 'KeyE' && !event.repeat) this.interact();
    if (event.code === 'Escape') {
      this.route = [];
      this.routeTarget = null;
      this.camera.follow(this.player, this.world.bounds);
    }
    if (event.key === '+' || event.key === '=') this.zoomIn();
    if (event.key === '-' || event.key === '_') this.zoomOut();
    if (event.key === '0') this.resetView();
    if (['KeyE', 'Escape', 'Equal', 'Minus', 'Digit0'].includes(event.code)) event.preventDefault();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || this.pointerId !== null) return;
    this.canvas.focus({ preventScroll: true });
    this.pointerId = event.pointerId;
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.dragging = false;
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || !this.pointerStart || !this.lastPointer) return;
    const distance = Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y);
    if (!this.dragging && distance >= 7) {
      this.dragging = true;
      this.route = [];
      this.routeTarget = null;
      this.canvas.classList.add('is-dragging');
    }
    if (this.dragging && this.pinchDistance === null) {
      this.camera.panBy(
        -(event.clientX - this.lastPointer.x) / this.camera.zoom,
        -(event.clientY - this.lastPointer.y) / this.camera.zoom,
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
    this.canvas.classList.remove('is-dragging');
    if (!shouldNavigate) return;
    const point = this.clientToScreen(event.clientX, event.clientY);
    const worldPoint = this.camera.screenToWorld(point.x, point.y);
    const path = findPath(this.player, worldPoint, this.world.colliders, this.world.bounds);
    this.route = path;
    this.routeTarget = path.length > 0 ? worldPoint : null;
    if (path.length > 0) this.camera.follow(this.player, this.world.bounds);
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const anchor = this.clientToScreen(event.clientX, event.clientY);
    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= 300;
    const clampedDelta = Math.max(-40, Math.min(40, delta));
    this.camera.zoomBy(Math.exp(-clampedDelta * (event.ctrlKey ? 0.006 : 0.0018)), anchor, this.world.bounds);
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
    if (this.pinchDistance > 0) this.camera.zoomBy(distance / this.pinchDistance, anchor, this.world.bounds);
    this.camera.panBy(
      -(midpoint.x - this.pinchMidpoint.x) / this.camera.zoom,
      -(midpoint.y - this.pinchMidpoint.y) / this.camera.zoom,
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
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private viewportCenter(): Point {
    return { x: this.viewport.width / 2, y: this.viewport.height / 2 };
  }

  private enterRoom(portal: WorldPortal): void {
    this.campusPlayer = { ...this.player };
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
    this.camera.centerImmediately(this.player, this.world.bounds);
    this.callbacks.onSceneChange(null);
  }

  private switchWorld(world: WorldDefinition, direction: Direction): void {
    this.world = world;
    this.route = [];
    this.routeTarget = null;
    Object.assign(this.player, world.spawn, { direction, moving: false });
    this.resetUiCache();
    this.camera.centerImmediately(this.player, world.bounds);
  }

  private resetUiCache(): void {
    this.area = null;
    this.nearbyPortal = null;
    this.previousZoom = -1;
  }
}
