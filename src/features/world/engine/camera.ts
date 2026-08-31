import type { Point, Rect } from './types';

export class WorldCamera {
  public x = 0;
  public y = 0;
  public zoom = 1;
  public targetZoom = 1;
  private width = 1;
  private height = 1;
  private targetX = 0;
  private targetY = 0;
  private following = true;

  public resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  public centerImmediately(target: Point, bounds: Rect): void {
    this.following = true;
    const position = this.centeredPosition(target, bounds);
    this.x = position.x;
    this.y = position.y;
    this.targetX = position.x;
    this.targetY = position.y;
  }

  public update(target: Point, bounds: Rect, deltaScale: number): void {
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1, 0.2 * deltaScale);
    if (this.following) {
      const desired = this.centeredPosition(target, bounds);
      this.targetX = desired.x;
      this.targetY = desired.y;
    } else {
      const targetPosition = this.clamp(this.targetX, this.targetY, bounds);
      this.targetX = targetPosition.x;
      this.targetY = targetPosition.y;
    }
    const follow = Math.min(1, 0.14 * deltaScale);
    this.x += (this.targetX - this.x) * follow;
    this.y += (this.targetY - this.y) * follow;
    const clamped = this.clamp(this.x, this.y, bounds);
    this.x = clamped.x;
    this.y = clamped.y;
  }

  public zoomBy(factor: number, anchor?: Point, bounds?: Rect): void {
    const nextZoom = Math.max(0.55, Math.min(2.4, this.targetZoom * factor));
    if (anchor && bounds) {
      const worldAnchor = this.screenToWorld(anchor.x, anchor.y);
      this.targetX = worldAnchor.x - anchor.x / nextZoom;
      this.targetY = worldAnchor.y - anchor.y / nextZoom;
      const clamped = this.clamp(this.targetX, this.targetY, bounds, nextZoom);
      this.targetX = clamped.x;
      this.targetY = clamped.y;
      this.following = false;
    }
    this.targetZoom = nextZoom;
  }

  public resetZoom(): void {
    this.targetZoom = 1;
  }

  public panBy(deltaX: number, deltaY: number, bounds: Rect): void {
    this.following = false;
    const position = this.clamp(this.x + deltaX, this.y + deltaY, bounds);
    this.x = position.x;
    this.y = position.y;
    this.targetX = position.x;
    this.targetY = position.y;
  }

  public follow(target: Point, bounds: Rect): void {
    this.following = true;
    const position = this.centeredPosition(target, bounds);
    this.targetX = position.x;
    this.targetY = position.y;
  }

  public screenToWorld(x: number, y: number): Point {
    return { x: x / this.zoom + this.x, y: y / this.zoom + this.y };
  }

  public visibleBounds(): Rect {
    return {
      x: this.x,
      y: this.y,
      width: this.width / this.zoom,
      height: this.height / this.zoom,
    };
  }

  private centeredPosition(target: Point, bounds: Rect): Point {
    return this.clamp(
      target.x - this.width / this.zoom / 2,
      target.y - this.height / this.zoom / 2,
      bounds,
    );
  }

  private clamp(x: number, y: number, bounds: Rect, zoom = this.zoom): Point {
    const visibleWidth = this.width / zoom;
    const visibleHeight = this.height / zoom;
    const minX = bounds.x;
    const minY = bounds.y;
    const maxX = bounds.x + bounds.width - visibleWidth;
    const maxY = bounds.y + bounds.height - visibleHeight;

    return {
      x: visibleWidth >= bounds.width ? bounds.x - (visibleWidth - bounds.width) / 2 : Math.max(minX, Math.min(maxX, x)),
      y:
        visibleHeight >= bounds.height
          ? bounds.y - (visibleHeight - bounds.height) / 2
          : Math.max(minY, Math.min(maxY, y)),
    };
  }
}
