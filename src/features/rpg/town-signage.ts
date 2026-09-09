import type * as Phaser from 'phaser';
import type { MapRoomType } from '../../domain/map/snapshot';
import type { RpgSceneLabel } from './types';

/** Measure actual glyphs and truncate at grapheme boundaries, including joined emoji. */
function fitLabel(label: Phaser.GameObjects.Text, value: string, width: number): void {
  label.setText(value);
  if (label.width <= width) return;
  const segments = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
    (entry) => entry.segment,
  );
  while (segments.length && label.width > width) {
    segments.pop();
    label.setText(`${segments.join('')}…`);
  }
}

function drawRoomSymbol(graphics: Phaser.GameObjects.Graphics, type: MapRoomType): void {
  const line = (points: number[]) => {
    graphics.beginPath().moveTo(points[0]!, points[1]!);
    for (let i = 2; i < points.length; i += 2) graphics.lineTo(points[i]!, points[i + 1]!);
    graphics.strokePath();
  };
  switch (type) {
    case 'text':
      line([3, 6, 15, 6]);
      line([3, 12, 15, 12]);
      line([7, 2, 5, 16]);
      line([13, 2, 11, 16]);
      break;
    case 'voice':
    case 'announcement':
      line([3, 7, 6, 7, 12, 3, 12, 15, 6, 11, 3, 11, 3, 7]);
      if (type === 'voice') line([15, 6, 17, 9, 15, 12]);
      else line([6, 11, 7, 16]);
      break;
    case 'stage':
      line([3, 16, 15, 16]);
      line([9, 2, 9, 11]);
      line([5, 6, 5, 10, 9, 13, 13, 10, 13, 6]);
      break;
    case 'forum':
      line([2, 3, 16, 3, 16, 12, 8, 12, 5, 16, 5, 12, 2, 12, 2, 3]);
      break;
    case 'media':
      graphics.strokeRect(2, 3, 14, 12);
      line([3, 13, 7, 8, 11, 12, 13, 10, 16, 13]);
      break;
    case 'unsupported':
      graphics.strokeCircle(9, 9, 7);
      line([9, 5, 9, 10]);
      line([9, 13, 9, 14]);
      break;
  }
}

interface LabelView {
  label: RpgSceneLabel;
  container: Phaser.GameObjects.Container;
  width: number;
  height: number;
}

/** Screen-readable roof annotations; full names remain available in the semantic Map directory. */
export class TownSignage {
  private readonly views: LabelView[];
  private lastCamera = '';

  public constructor(scene: Phaser.Scene, labels: readonly RpgSceneLabel[]) {
    const style = getComputedStyle(scene.game.canvas.closest('.rpg-page') ?? scene.game.canvas);
    const ink = style.getPropertyValue('--rpg-label-ink').trim() || '#fff4dc';
    const panel = style.getPropertyValue('--rpg-label-panel').trim() || '#19251e';
    this.views = [...labels]
      .sort((a, b) => Number(b.kind === 'district') - Number(a.kind === 'district'))
      .map((label) => {
        const district = label.kind === 'district';
        const markSpace = label.roomType ? 21 : 0;
        const text = scene.add.text(markSpace, 0, '', {
          fontFamily: district ? 'Pixelify Sans, sans-serif' : 'Inter Variable, sans-serif',
          fontSize: district ? '17px' : '12px',
          color: ink,
          fontStyle: district ? 'bold' : 'normal',
          resolution: 2,
          shadow: { offsetX: 0, offsetY: 1, color: '#101711', blur: 2, fill: true },
        });
        fitLabel(text, label.text, label.maxWidth - markSpace - 16);
        const parts: Phaser.GameObjects.GameObject[] = [text];
        const width = text.width + markSpace + 16;
        const height = Math.max(text.height, label.roomType ? 18 : 0) + 8;
        text.setPosition(-width / 2 + 8 + markSpace, -height + 4);
        const frame = scene.add
          .graphics()
          .fillStyle(Number.parseInt(panel.slice(1), 16), district ? 0.85 : 0.76)
          .fillRoundedRect(-width / 2, -height, width, height, 5);
        if (label.roomType) {
          const symbol = scene.add
            .graphics()
            .lineStyle(1.25, Number.parseInt(ink.slice(1), 16))
            .setPosition(-width / 2 + 7, -height + 4);
          drawRoomSymbol(symbol, label.roomType);
          parts.push(symbol);
        }
        return {
          label,
          width,
          height,
          container: scene.add
            .container(label.x, label.y, [frame, ...parts])
            .setDepth(district ? 95001 : 95000),
        };
      });
  }

  public update(camera: Phaser.Cameras.Scene2D.Camera): void {
    const key = `${camera.scrollX},${camera.scrollY},${camera.zoom},${camera.width},${camera.height}`;
    if (key === this.lastCamera) return;
    this.lastCamera = key;
    const occupied: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    for (const { label, container, width, height } of this.views) {
      // At an overview, neighborhood names orient the town without a carpet of channel names.
      if ((label.kind === 'room' && camera.zoom < 0.5) || occupied.length >= 160) {
        container.setVisible(false);
        continue;
      }
      const x = (label.x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2;
      const y = (label.y - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2;
      const box = {
        left: x - width / 2 - 5,
        top: y - height - 5,
        right: x + width / 2 + 5,
        bottom: y + 5,
      };
      const visible =
        box.right > 0 &&
        box.left < camera.width &&
        box.bottom > 0 &&
        box.top < camera.height &&
        !occupied.some(
          (other) =>
            box.left < other.right &&
            box.right > other.left &&
            box.top < other.bottom &&
            box.bottom > other.top,
        );
      container.setVisible(visible).setScale(1 / camera.zoom);
      if (visible) occupied.push(box);
    }
  }

  public destroy(): void {
    this.views.forEach(({ container }) => container.destroy());
  }
}
