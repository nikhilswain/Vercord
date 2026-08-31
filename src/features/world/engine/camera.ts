import type { Point, Rect } from './types';

export class WorldCamera {
  public x = 0;
  public y = 0;
  public zoom = 1;
  public targetZoom = 1;
  private width = 1;
  private height = 1;

  public resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  public centerImmediately(target: Point, bounds: Rect): void {
    this.snapTo(target, bounds);
  }

  public update(target: Point, bounds: Rect, deltaScale: number): void {
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1, 0.2 * deltaScale);
    const desired = this.clamp(
      target.x - this.width / this.zoom / 2,
      target.y - this.height / this.zoom / 2,
      bounds,
    );
    const follow = Math.min(1, 0.14 * deltaScale);
    this.x += (desired.x - this.x) * follow;
    this.y += (desired.y - this.y) * follow;
  }

  public zoomBy(factor: number): void {
    this.targetZoom = Math.max(0.62, Math.min(2.2, this.targetZoom * factor));
  }

  public resetZoom(): void {
    this.targetZoom = 1;
  }

  public screenToWorld(x: number, y: number): Point {
    return { x: x / this.zoom + this.x, y: y / this.zoom + this.y };
  }

  private snapTo(target: Point, bounds: Rect): void {
    const position = this.clamp(
      target.x - this.width / this.zoom / 2,
      target.y - this.height / this.zoom / 2,
      bounds,
    );
    this.x = position.x;
    this.y = position.y;
  }

  private clamp(x: number, y: number, bounds: Rect): Point {
    const visibleWidth = this.width / this.zoom;
    const visibleHeight = this.height / this.zoom;
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
