import * as Phaser from 'phaser';
import type { Rect } from '../../domain/world/content/v1/types';
import type { RpgSample, RpgStamp } from './types';

const TILE = 32;
const INDEX_CELL = 512;
let terrainId = 0;
interface Chunk {
  image: Phaser.GameObjects.Image;
  texture: string;
}

/** Visible, bounded terrain textures: world size never determines GPU texture size. */
export class TownTerrainRenderer {
  private readonly id = terrainId++;
  private readonly roads = new Map<string, Rect[]>();
  private readonly decorations = new Map<string, RpgStamp[]>();
  private readonly chunks = new Map<string, Chunk>();
  private chunkSize = 0;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly sample: RpgSample,
  ) {
    for (const road of sample.terrain?.roads ?? []) this.index(this.roads, road, road);
    for (const stamp of sample.stamps.filter((part) => (part.depth ?? part.y) < 0)) {
      const frame = scene.textures.getFrame(stamp.texture, stamp.frame);
      const width = stamp.width ?? frame.realWidth;
      const height = stamp.height ?? frame.realHeight;
      this.index(
        this.decorations,
        {
          x: stamp.x - width * (stamp.originX ?? 0),
          y: stamp.y - height * (stamp.originY ?? 0),
          width,
          height,
        },
        stamp,
      );
    }
  }

  public update(): void {
    const camera = this.scene.cameras.main;
    const zoom = camera.zoom;
    // Keep each backing canvas <=512px and roughly constant visible chunk counts when zoomed out.
    const size = zoom < 0.25 ? 4096 : zoom < 0.5 ? 2048 : zoom < 1 ? 1024 : 512;
    if (size !== this.chunkSize) {
      this.clear();
      this.chunkSize = size;
    }
    const { bounds } = this.sample;
    const cx = camera.scrollX + camera.width / 2;
    const cy = camera.scrollY + camera.height / 2;
    const left = Math.max(0, Math.floor((cx - camera.width / (2 * zoom) - TILE) / size));
    const top = Math.max(0, Math.floor((cy - camera.height / (2 * zoom) - TILE) / size));
    const right = Math.min(
      Math.ceil(bounds.width / size) - 1,
      Math.floor((cx + camera.width / (2 * zoom) + TILE) / size),
    );
    const bottom = Math.min(
      Math.ceil(bounds.height / size) - 1,
      Math.floor((cy + camera.height / (2 * zoom) + TILE) / size),
    );
    const visible = new Set<string>();
    let built = 0;
    for (let row = top; row <= bottom; row++)
      for (let col = left; col <= right; col++) {
        const key = `${col}:${row}`;
        visible.add(key);
        if (!this.chunks.has(key) && built < 3) {
          this.chunks.set(key, this.build(col, row));
          built++;
        }
      }
    for (const [key, chunk] of this.chunks)
      if (!visible.has(key)) {
        this.release(chunk);
        this.chunks.delete(key);
      }
  }

  public destroy(): void {
    this.clear();
    this.roads.clear();
    this.decorations.clear();
  }

  private index<T>(index: Map<string, T[]>, box: Rect, entry: T): void {
    for (
      let y = Math.floor(box.y / INDEX_CELL);
      y <= Math.floor((box.y + box.height) / INDEX_CELL);
      y++
    )
      for (
        let x = Math.floor(box.x / INDEX_CELL);
        x <= Math.floor((box.x + box.width) / INDEX_CELL);
        x++
      ) {
        const key = `${x}:${y}`;
        const entries = index.get(key) ?? [];
        entries.push(entry);
        index.set(key, entries);
      }
  }

  private onRoad(x: number, y: number): boolean {
    const px = x * TILE + TILE / 2,
      py = y * TILE + TILE / 2;
    return (
      this.roads.get(`${Math.floor(px / INDEX_CELL)}:${Math.floor(py / INDEX_CELL)}`) ?? []
    ).some(
      (road) =>
        px >= road.x && px < road.x + road.width && py >= road.y && py < road.y + road.height,
    );
  }

  private build(col: number, row: number): Chunk {
    const size = this.chunkSize;
    const ox = col * size,
      oy = row * size;
    const width = Math.min(size, this.sample.bounds.width - ox);
    const height = Math.min(size, this.sample.bounds.height - oy);
    const scale = 512 / size;
    const textureKey = `town-terrain:${this.id}:${size}:${col}:${row}`;
    const texture = this.scene.textures.createCanvas(
      textureKey,
      Math.ceil(width * scale),
      Math.ceil(height * scale),
    );
    if (!texture) throw new Error('Unable to create town terrain');
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const context = texture.context;
    context.imageSmoothingEnabled = false;
    context.scale(scale, scale);
    const frameCache = new Map<string, Phaser.Textures.Frame>();
    const draw = (
      key: string,
      frameId: string | number | undefined,
      x: number,
      y: number,
      drawWidth?: number,
      drawHeight?: number,
    ) => {
      const cacheKey = `${key}:${frameId ?? ''}`;
      let frame = frameCache.get(cacheKey);
      if (!frame) {
        frame = this.scene.textures.getFrame(key, frameId);
        frameCache.set(cacheKey, frame);
      }
      context.drawImage(
        frame.source.image as CanvasImageSource,
        frame.cutX,
        frame.cutY,
        frame.cutWidth,
        frame.cutHeight,
        x - ox,
        y - oy,
        drawWidth ?? frame.realWidth,
        drawHeight ?? frame.realHeight,
      );
    };
    const norse = this.sample.id === 'norse';
    if (size >= 4096) {
      // At town-wide scale, fill repeating ground and road rectangles directly.
      // Painting every 32px tile would do world-sized CPU work just to draw an overview.
      const pattern = (key: string, frameId: number) => {
        const tile = document.createElement('canvas');
        tile.width = TILE;
        tile.height = TILE;
        const frame = this.scene.textures.getFrame(key, frameId);
        tile
          .getContext('2d')!
          .drawImage(
            frame.source.image as CanvasImageSource,
            frame.cutX,
            frame.cutY,
            frame.cutWidth,
            frame.cutHeight,
            0,
            0,
            TILE,
            TILE,
          );
        return context.createPattern(tile, 'repeat')!;
      };
      context.fillStyle = pattern(norse ? 'norse-terrain' : 'lpc-terrain', 17);
      context.fillRect(0, 0, width, height);
      context.fillStyle = pattern(norse ? 'norse-terrain' : 'lpc-terrain', norse ? 15 : 68);
      const roads = new Set<Rect>();
      for (let y = Math.floor(oy / INDEX_CELL); y <= Math.floor((oy + height) / INDEX_CELL); y++)
        for (let x = Math.floor(ox / INDEX_CELL); x <= Math.floor((ox + width) / INDEX_CELL); x++)
          for (const road of this.roads.get(`${x}:${y}`) ?? []) roads.add(road);
      for (const road of roads) context.fillRect(road.x - ox, road.y - oy, road.width, road.height);
    } else
      for (let y = oy / TILE; y < (oy + height) / TILE; y++)
        for (let x = ox / TILE; x < (ox + width) / TILE; x++) {
          const onPath = this.onRoad(x, y);
          const north = this.onRoad(x, y - 1),
            east = this.onRoad(x + 1, y);
          const south = this.onRoad(x, y + 1),
            west = this.onRoad(x - 1, y);
          if (norse) {
            const mask = (north ? 1 : 0) | (east ? 2 : 0) | (south ? 4 : 0) | (west ? 8 : 0);
            draw('norse-terrain', onPath ? mask : 16 + ((x * 17 + y * 31) % 4), x * TILE, y * TILE);
          } else {
            const edgeX = west ? 0 : east ? 2 : 1;
            const edgeY = north ? 0 : south ? 2 : 1;
            if (onPath || edgeX !== 1 || edgeY !== 1) draw('lpc-terrain', 68, x * TILE, y * TILE);
            if (!onPath)
              draw(
                'lpc-terrain',
                edgeX !== 1 || edgeY !== 1
                  ? edgeY * 16 + edgeX
                  : (x * 13 + y * 7) % 9 === 0
                    ? 35
                    : 17,
                x * TILE,
                y * TILE,
              );
          }
        }
    const parts = new Set<RpgStamp>();
    for (let y = Math.floor(oy / INDEX_CELL); y <= Math.floor((oy + height) / INDEX_CELL); y++)
      for (let x = Math.floor(ox / INDEX_CELL); x <= Math.floor((ox + width) / INDEX_CELL); x++)
        for (const part of this.decorations.get(`${x}:${y}`) ?? []) parts.add(part);
    for (const part of [...parts].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))) {
      const frame = this.scene.textures.getFrame(part.texture, part.frame);
      const w = part.width ?? frame.realWidth,
        h = part.height ?? frame.realHeight;
      context.globalAlpha = part.alpha ?? 1;
      draw(
        part.texture,
        part.frame,
        part.x - w * (part.originX ?? 0),
        part.y - h * (part.originY ?? 0),
        w,
        h,
      );
    }
    texture.refresh();
    return {
      texture: textureKey,
      image: this.scene.add
        .image(ox, oy, textureKey)
        .setOrigin(0)
        .setDisplaySize(width, height)
        .setDepth(-10000),
    };
  }

  private release(chunk: Chunk): void {
    chunk.image.destroy();
    this.scene.textures.remove(chunk.texture);
  }
  private clear(): void {
    for (const chunk of this.chunks.values()) this.release(chunk);
    this.chunks.clear();
  }
}
