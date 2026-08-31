import { WorldCamera } from './camera';
import { containsPoint, resolveMovement } from './collision';
import { findPath } from './pathfinding';
import { renderWorld } from './render-world';
import type {
  Direction,
  PlayerState,
  Point,
  WorldArea,
  WorldDefinition,
  WorldPortal,
  WorldUiState,
} from './types';

const ASSET_URL = '/game-assets/kenney-urban/tiles.png';
const WALK_SPEED = 150;
const SPRINT_MULTIPLIER = 1.65;

interface WorldEngineCallbacks {
  onReady: () => void;
  onAssetError: () => void;
  onUiChange: (state: WorldUiState) => void;
  onOpenRoom: (portal: WorldPortal) => void;
}

interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
}

export class WorldEngine {
  private readonly context: CanvasRenderingContext2D;
  private readonly image = new Image();
  private readonly camera = new WorldCamera();
  private readonly input: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
  };
  private readonly player: PlayerState;
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

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: WorldDefinition,
    private readonly callbacks: WorldEngineCallbacks,
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
    this.player = {
      ...world.spawn,
      direction: 'down',
      moving: false,
    };
    this.bindEvents();
  }

  public start(): void {
    this.image.addEventListener('load', this.handleImageLoad);
    this.image.addEventListener('error', this.handleImageError);
    this.image.src = ASSET_URL;
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
    this.camera.zoomBy(1.2);
  }

  public zoomOut(): void {
    this.camera.zoomBy(1 / 1.2);
  }

  public resetView(): void {
    this.camera.resetZoom();
    this.camera.centerImmediately(this.player, this.world.bounds);
  }

  public interact(): void {
    if (this.nearbyPortal) this.callbacks.onOpenRoom(this.nearbyPortal);
  }

  public destroy(): void {
    this.destroyed = true;
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.image.removeEventListener('load', this.handleImageLoad);
    this.image.removeEventListener('error', this.handleImageError);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('wheel', this.handleWheel);
  }

  private readonly handleImageLoad = (): void => {
    if (this.destroyed) return;
    this.callbacks.onReady();
    this.previousTime = performance.now();
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private readonly handleImageError = (): void => {
    if (!this.destroyed) this.callbacks.onAssetError();
  };

  private readonly frame = (time: number): void => {
    if (this.destroyed) return;
    const deltaSeconds = Math.min(0.05, Math.max(0, (time - this.previousTime) / 1000));
    this.previousTime = time;
    this.elapsed += deltaSeconds * 1000;
    this.update(deltaSeconds);
    renderWorld(this.context, this.image, this.world, this.camera, this.viewport, {
      elapsed: this.elapsed,
      player: this.player,
      nearbyPortal: this.nearbyPortal,
      route: this.route,
      routeTarget: this.routeTarget,
    });
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private update(deltaSeconds: number): void {
    const keyboardX = Number(this.input.right) - Number(this.input.left);
    const keyboardY = Number(this.input.down) - Number(this.input.up);
    let movementX = 0;
    let movementY = 0;

    if (keyboardX !== 0 || keyboardY !== 0) {
      this.route = [];
      this.routeTarget = null;
      const length = Math.hypot(keyboardX, keyboardY);
      movementX = keyboardX / length;
      movementY = keyboardY / length;
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
      const speed = WALK_SPEED * (this.input.sprint ? SPRINT_MULTIPLIER : 1);
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
      this.callbacks.onUiChange({ area: this.area, nearbyPortal: this.nearbyPortal, zoom });
    }
  }

  private directionFromVector(x: number, y: number): Direction {
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
    return y > 0 ? 'down' : 'up';
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const handled = this.setInput(event.code, true);
    if (event.code === 'KeyE' && !event.repeat) this.interact();
    if (handled || event.code === 'KeyE') event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (this.setInput(event.code, false)) event.preventDefault();
  };

  private readonly handleBlur = (): void => {
    this.input.up = false;
    this.input.down = false;
    this.input.left = false;
    this.input.right = false;
    this.input.sprint = false;
  };

  private setInput(code: string, pressed: boolean): boolean {
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        this.input.up = pressed;
        return true;
      case 'ArrowDown':
      case 'KeyS':
        this.input.down = pressed;
        return true;
      case 'ArrowLeft':
      case 'KeyA':
        this.input.left = pressed;
        return true;
      case 'ArrowRight':
      case 'KeyD':
        this.input.right = pressed;
        return true;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.input.sprint = pressed;
        return true;
      default:
        return false;
    }
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.canvas.focus({ preventScroll: true });
    const rect = this.canvas.getBoundingClientRect();
    const worldPoint = this.camera.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    const path = findPath(this.player, worldPoint, this.world.colliders, this.world.bounds);
    this.route = path;
    this.routeTarget = path.length > 0 ? worldPoint : null;
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.camera.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  };
}
