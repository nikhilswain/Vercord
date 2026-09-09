import type Phaser from 'phaser';
import type { RpgAction, RpgDirection } from '../types';

function shade(color: number, factor: number): number {
  const channel = (shift: number) => Math.min(255, Math.round(((color >> shift) & 255) * factor));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Original code-drawn pixel animals share the same feet/depth contract as human rigs. */
export class RpgAnimal {
  readonly container: Phaser.GameObjects.Container;
  private readonly drawing: Phaser.GameObjects.Graphics;
  private pose = '';

  constructor(
    scene: Phaser.Scene,
    private readonly kind: 'dog' | 'cat',
    private readonly coat: number,
  ) {
    this.container = scene.add.container();
    this.drawing = scene.add.graphics();
    this.container.add([
      scene.add.ellipse(0, -1, kind === 'dog' ? 28 : 22, 8, 0x17221d, 0.22),
      this.drawing,
    ]);
  }

  update(
    x: number,
    y: number,
    direction: RpgDirection,
    action: RpgAction,
    time: number,
    reducedMotion: boolean,
  ): void {
    this.container.setPosition(x, y).setDepth(y);
    const moving = action !== 'idle';
    const frame = reducedMotion ? 0 : Math.floor(time / (moving ? 140 : 600)) % 4;
    const pose = `${direction}:${moving}:${frame}`;
    if (pose === this.pose) return;
    this.pose = pose;
    this.drawing.clear().setScale(direction === 'left' ? -1 : 1, 1);
    const ink = shade(this.coat, 0.38);
    const dark = shade(this.coat, 0.72);
    const light = shade(this.coat, 1.2);
    const cream = 0xe9d4a5;
    const leg = moving ? [0, 2, 0, -2][frame]! : 0;
    const rect = (color: number, rx: number, ry: number, width: number, height: number) =>
      this.drawing.fillStyle(color).fillRect(rx, ry, width, height);
    const side = direction === 'left' || direction === 'right';
    if (side) {
      if (this.kind === 'dog') {
        // Tail, far legs, back, belly, floppy ear, muzzle and collar.
        rect(ink, -20, -21, 10, 4);
        rect(this.coat, -21, -24 + (frame % 2), 4, 6);
        rect(dark, -9, -7, 4, 8 + leg);
        rect(dark, 8, -7, 4, 8 - leg);
        rect(ink, -14, -21, 29, 15);
        rect(this.coat, -12, -20, 26, 12);
        rect(light, -9, -20, 19, 3);
        rect(cream, -10, -11, 22, 3);
        rect(ink, 7, -29, 15, 16);
        rect(this.coat, 9, -28, 11, 13);
        rect(dark, 6, -28, 6, 13);
        rect(light, 13, -27, 6, 3);
        rect(cream, 17, -21, 10, 6);
        rect(ink, 25, -22, 3, 4);
        rect(0x171f1d, 17, -25, 2, 3);
        rect(0xf6e5be, 17, -25, 1, 1);
        rect(0x548b86, 11, -15, 8, 3);
        rect(0xe5bb62, 16, -12, 2, 3);
        rect(this.coat, -12, -9, 4, 10 - leg);
        rect(this.coat, 10, -9, 4, 10 + leg);
        rect(cream, -12, -1 - leg, 5, 3);
        rect(cream, 10, -1 + leg, 5, 3);
      } else {
        rect(ink, -18, -30, 4, 17);
        rect(this.coat, -17, -30, 2, 17);
        rect(this.coat, -15, -16, 7, 4);
        rect(dark, -20, -32 + (frame % 2), 5, 4);
        rect(dark, -8, -7, 3, 8 + leg);
        rect(dark, 6, -7, 3, 8 - leg);
        rect(ink, -12, -19, 24, 13);
        rect(this.coat, -10, -18, 20, 10);
        rect(light, -7, -18, 14, 3);
        rect(dark, -7, -18, 2, 5);
        rect(dark, -1, -18, 2, 4);
        rect(dark, 5, -18, 2, 5);
        rect(cream, -5, -10, 13, 3);
        rect(ink, 4, -27, 14, 15);
        rect(this.coat, 5, -26, 12, 13);
        rect(ink, 4, -32, 4, 6);
        rect(ink, 13, -32, 4, 6);
        rect(0xc88e82, 5, -30, 2, 4);
        rect(0xc88e82, 14, -30, 2, 4);
        rect(0xa9cd87, 13, -24, 3, 3);
        rect(ink, 15, -24, 1, 3);
        rect(cream, 13, -18, 8, 4);
        rect(cream, 19, -21, 5, 1);
        rect(cream, 19, -16, 5, 1);
        rect(0x68483f, 20, -19, 2, 2);
        rect(this.coat, -10, -9, 3, 10 - leg);
        rect(this.coat, 7, -9, 3, 10 + leg);
        rect(cream, -10, -1 - leg, 4, 3);
        rect(cream, 7, -1 + leg, 4, 3);
      }
    } else {
      const cat = this.kind === 'cat';
      const facing = direction === 'down';
      const width = cat ? 12 : 16;
      const left = -width / 2;
      rect(ink, left - 1, -25, width + 2, 21);
      rect(this.coat, left, -24, width, 18);
      rect(light, left + 2, -23, width - 4, 5);
      rect(dark, left, -12, width, 2);
      if (cat) {
        rect(dark, left + 1, -20, 3, 2);
        rect(dark, width / 2 - 4, -17, 3, 2);
      }
      rect(dark, left, -5, 4, 6 + leg);
      rect(dark, width / 2 - 4, -5, 4, 6 - leg);
      if (cat) {
        rect(ink, 1, facing ? -33 : -8, 3, 10);
        rect(this.coat, 2, facing ? -34 : -8, 2, 9);
      } else rect(dark, -2 + (frame % 2), facing ? -30 : -8, 4, 9);
      const headY = facing ? -22 : -32;
      rect(ink, left - 2, headY, width + 4, 14);
      rect(this.coat, left - 1, headY + 1, width + 2, 12);
      if (cat) {
        rect(ink, left - 2, headY - 4, 4, 6);
        rect(ink, width / 2 - 2, headY - 4, 4, 6);
        rect(0xc88e82, left - 1, headY - 2, 2, 3);
        rect(0xc88e82, width / 2 - 1, headY - 2, 2, 3);
      } else {
        rect(dark, left - 4, headY, 5, 13);
        rect(dark, width / 2 - 1, headY, 5, 13);
      }
      if (facing) {
        rect(cat ? 0xa9cd87 : ink, left + 1, headY + 4, 3, 3);
        rect(cat ? 0xa9cd87 : ink, width / 2 - 4, headY + 4, 3, 3);
        rect(cream, -4, headY + 8, 8, 5);
        rect(ink, -1, headY + 8, 3, 2);
        if (cat) {
          rect(cream, left - 5, headY + 8, 6, 1);
          rect(cream, width / 2 - 1, headY + 8, 6, 1);
          rect(cream, left - 4, headY + 11, 5, 1);
          rect(cream, width / 2 - 1, headY + 11, 5, 1);
        }
        if (!cat) rect(0x548b86, left, headY + 14, width, 2);
      }
      rect(cream, left, -1 + leg, 4, 3);
      rect(cream, width / 2 - 4, -1 - leg, 4, 3);
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}
