import type { AtlasView, Point, Rect } from './types';

/** A single demand-driven loop owns the viewBox. Input changes its target, never
 * starts competing tweens. Static SVG geometry is independent of this camera. */
export class AtlasCamera {
  view: AtlasView;
  target: AtlasView;
  overview: AtlasView;
  aspect = 1;
  pixelWidth = 1;
  baseWidth = 1;
  enabled = true;
  onChange?: () => void;
  private frame = 0;
  private previous = 0;
  private pan: Point = { x: 0, y: 0 };
  private anchor: (Point & { nx: number; ny: number }) | null = null;
  private zoomDirection = 0;
  private observer: ResizeObserver;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private measured = false;

  constructor(
    readonly svg: SVGSVGElement,
    readonly bounds: Rect,
  ) {
    this.overview = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
      width: bounds.width,
    };
    this.view = { ...this.overview };
    this.target = { ...this.view };
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(svg);
  }
  get scale() {
    return this.view.width / this.pixelWidth;
  }
  private resize() {
    const rect = this.svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const oldBase = this.baseWidth;
    this.aspect = rect.width / rect.height;
    this.pixelWidth = rect.width;
    this.baseWidth = Math.max(this.bounds.width, this.bounds.height * this.aspect) * 1.15;
    this.overview = { ...this.overview, width: this.baseWidth };
    this.stop();
    this.view = this.measured
      ? { ...this.view, width: (this.view.width * this.baseWidth) / oldBase }
      : { ...this.overview };
    this.measured = true;
    this.target = { ...this.view };
    this.render();
  }
  render() {
    const { x, y, width } = this.view,
      height = width / this.aspect;
    this.svg.setAttribute('viewBox', `${x - width / 2} ${y - height / 2} ${width} ${height}`);
    this.svg.style.setProperty('--atlas-unit', String(this.scale));
    this.onChange?.();
  }
  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.anchor = null;
    this.target = { ...this.view };
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.pan = { x: 0, y: 0 };
      this.stop();
    }
  }
  moveTo(next: AtlasView) {
    this.anchor = null;
    this.pan = { x: 0, y: 0 };
    this.target = { ...next, width: this.clampWidth(next.width) };
    this.schedule();
  }
  private clampWidth(width: number) {
    return Math.max(Math.min(480, this.baseWidth * 0.2), Math.min(this.baseWidth * 1.6, width));
  }
  point(clientX: number, clientY: number): Point {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: this.view.x + (clientX - rect.left - rect.width / 2) * this.scale,
      y: this.view.y + (clientY - rect.top - rect.height / 2) * this.scale,
    };
  }
  zoom(factor: number, client?: Point) {
    if (!this.enabled || factor === 1) return;
    const direction = Math.sign(factor - 1);
    if (!this.anchor || direction !== this.zoomDirection) this.target = { ...this.view };
    this.zoomDirection = direction;
    const rect = this.svg.getBoundingClientRect();
    client ??= { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const point = this.point(client.x, client.y),
      nx = (client.x - rect.left - rect.width / 2) / rect.width,
      ny = (client.y - rect.top - rect.height / 2) / rect.width;
    const width = this.clampWidth(this.target.width * factor);
    this.anchor = { ...point, nx, ny };
    this.target = { x: point.x - nx * width, y: point.y - ny * width, width };
    this.schedule();
  }
  wheel(event: WheelEvent) {
    if (!this.enabled) return;
    event.preventDefault();
    if (Math.abs(event.deltaY) < 0.01 || Math.abs(event.deltaX) > Math.abs(event.deltaY) * 2)
      return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.svg.clientHeight : 1;
    this.zoom(
      Math.exp(
        Math.max(-160, Math.min(160, event.deltaY * unit)) * (event.ctrlKey ? 0.012 : 0.0025),
      ),
      { x: event.clientX, y: event.clientY },
    );
  }
  drag(dx: number, dy: number, start: AtlasView) {
    this.stop();
    const scale = start.width / this.pixelWidth;
    this.view = { x: start.x - dx * scale, y: start.y - dy * scale, width: start.width };
    this.limitPan(this.view);
    this.target = { ...this.view };
    this.render();
  }
  setPan(x: number, y: number) {
    if (!this.enabled) return;
    this.pan = { x, y };
    if (x || y) {
      this.stop();
      this.schedule();
    }
  }
  private limitPan(view: AtlasView) {
    const b = this.bounds,
      margin = this.view.width * 0.15;
    view.x = Math.max(b.x - margin, Math.min(b.x + b.width + margin, view.x));
    view.y = Math.max(b.y - margin, Math.min(b.y + b.height + margin, view.y));
  }
  private schedule() {
    if (this.frame || !this.enabled) return;
    this.previous = performance.now();
    this.frame = requestAnimationFrame((now) => this.tick(now));
  }
  private tick(now: number) {
    this.frame = 0;
    const dt = Math.min(0.04, (now - this.previous) / 1000);
    this.previous = now;
    const { x, y } = this.pan,
      panning = x || y;
    if (panning) {
      const length = Math.hypot(x, y),
        speed = 520 * this.scale;
      this.view.x += (x / length) * speed * dt;
      this.view.y += (y / length) * speed * dt;
      this.limitPan(this.view);
      this.target = { ...this.view };
    } else {
      const fraction = this.reduced.matches ? 1 : 1 - Math.exp(-18 * dt);
      this.view.width += (this.target.width - this.view.width) * fraction;
      if (this.anchor) {
        this.view.x = this.anchor.x - this.anchor.nx * this.view.width;
        this.view.y = this.anchor.y - this.anchor.ny * this.view.width;
      } else {
        this.view.x += (this.target.x - this.view.x) * fraction;
        this.view.y += (this.target.y - this.view.y) * fraction;
      }
    }
    const distance = Math.max(
      Math.abs(this.view.width - this.target.width),
      Math.abs(this.view.x - this.target.x),
      Math.abs(this.view.y - this.target.y),
    );
    if (!panning && distance < 0.015) {
      this.view = { ...this.target };
      this.anchor = null;
    }
    this.render();
    if (panning || distance >= 0.015) this.frame = requestAnimationFrame((time) => this.tick(time));
  }
  destroy() {
    this.stop();
    this.observer.disconnect();
    this.onChange = undefined;
  }
}
