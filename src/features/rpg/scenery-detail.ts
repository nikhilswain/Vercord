import * as Phaser from 'phaser';

const MAX_PIXELS = 2 * 1024 * 1024;
let detailId = 0;

interface DetailTexture {
  key: string;
  level: number;
  pixels: number;
  users: number;
  used: number;
}
interface ScenerySource {
  frame: Phaser.Textures.Frame;
  width: number;
  height: number;
  texture?: DetailTexture;
}

/** Prefilter static art for distant views. Copies share each frame/level; the cache owns its GPU budget. */
export class SceneryDetail {
  private readonly id = detailId++;
  private readonly sources = new WeakMap<Phaser.GameObjects.Image, ScenerySource>();
  private readonly active = new Map<Phaser.GameObjects.Image, ScenerySource>();
  private readonly textures = new Map<string, DetailTexture>();
  private pixels = 0;
  private sequence = 0;
  private previousVisible: ReadonlySet<Phaser.GameObjects.Image> | null = null;
  private previousZoom = 0;
  private pending = false;

  constructor(private readonly scene: Phaser.Scene) {}

  add(image: Phaser.GameObjects.Image): void {
    this.sources.set(image, {
      frame: image.frame,
      width: image.displayWidth,
      height: image.displayHeight,
    });
  }

  update(visible: ReadonlySet<Phaser.GameObjects.Image>, zoom: number): void {
    if (visible === this.previousVisible && zoom === this.previousZoom && !this.pending) return;
    this.previousVisible = visible;
    this.previousZoom = zoom;
    this.pending = false;
    // Release the previous level together so shared references cannot block a zoom migration.
    for (const [image, source] of this.active)
      if (!visible.has(image) || this.level(source, zoom) !== source.texture?.level)
        this.restore(image, source);

    const started = performance.now();
    let built = 0;
    for (const image of visible) {
      const source = this.sources.get(image);
      if (!source) continue;
      const { frame, width, height } = source;
      const level = this.level(source, zoom);
      if (level === 1) {
        this.restore(image, source);
        continue;
      }
      const key = `${frame.texture.key}:${frame.name}:${level}`;
      let texture = this.textures.get(key);
      if (!texture) {
        if (built >= 2 || (built > 0 && performance.now() - started >= 2)) {
          this.pending = true;
          continue;
        }
        const w = Math.max(1, Math.ceil(frame.realWidth / level));
        const h = Math.max(1, Math.ceil(frame.realHeight / level));
        this.restore(image, source);
        if (!this.makeSpace(w * h)) continue;
        texture = this.build(frame, w, h, level);
        this.textures.set(key, texture);
        this.pixels += texture.pixels;
        built++;
      }
      texture.used = ++this.sequence;
      if (source.texture === texture) continue;
      if (source.texture) source.texture.users--;
      source.texture = texture;
      texture.users++;
      image.setTexture(texture.key).setDisplaySize(width, height);
      this.active.set(image, source);
    }
  }

  destroy(): void {
    for (const [image, source] of this.active) this.restore(image, source);
    for (const texture of this.textures.values()) this.scene.textures.remove(texture.key);
    this.textures.clear();
    this.previousVisible = null;
    this.pixels = 0;
  }

  private restore(image: Phaser.GameObjects.Image, source: ScenerySource): void {
    if (!source.texture) return;
    source.texture.users--;
    source.texture = undefined;
    // Phaser may destroy the display list before emitting the scene shutdown event.
    if (image.scene)
      image
        .setTexture(source.frame.texture.key, source.frame.name)
        .setDisplaySize(source.width, source.height);
    this.active.delete(image);
  }

  private level({ frame, width, height }: ScenerySource, zoom: number): number {
    const scale = zoom * Math.max(width / frame.realWidth, height / frame.realHeight);
    return Math.min(64, 2 ** Math.max(0, Math.floor(Math.log2(1 / scale))));
  }

  private makeSpace(pixels: number): boolean {
    if (pixels > MAX_PIXELS) return false;
    const unused = [...this.textures].filter(([, texture]) => texture.users === 0);
    unused.sort((a, b) => a[1].used - b[1].used);
    for (const [key, texture] of unused) {
      if (this.pixels + pixels <= MAX_PIXELS) break;
      this.scene.textures.remove(texture.key);
      this.pixels -= texture.pixels;
      this.textures.delete(key);
    }
    return this.pixels + pixels <= MAX_PIXELS;
  }

  private build(
    frame: Phaser.Textures.Frame,
    width: number,
    height: number,
    level: number,
  ): DetailTexture {
    const key = `scenery-detail:${this.id}:${++this.sequence}`;
    const texture = this.scene.textures.createCanvas(key, width, height);
    if (!texture) throw new Error('Unable to create scenery detail');
    const context = texture.context;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const sx = width / frame.realWidth;
    const sy = height / frame.realHeight;
    context.drawImage(
      frame.source.image as CanvasImageSource,
      frame.cutX,
      frame.cutY,
      frame.cutWidth,
      frame.cutHeight,
      frame.x * sx,
      frame.y * sy,
      frame.cutWidth * sx,
      frame.cutHeight * sy,
    );
    texture.refresh();
    // Canvas refresh follows the game's pixel-art filter, so apply minification filtering last.
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return { key, level, pixels: width * height, users: 0, used: this.sequence };
  }
}
