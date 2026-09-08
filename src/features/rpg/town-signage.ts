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

/** Phaser annotations own no input; the Map directory exposes the same full names semantically. */
export function renderTownSignage(scene: Phaser.Scene, labels: readonly RpgSceneLabel[]) {
  const style = getComputedStyle(scene.game.canvas.closest('.rpg-page') ?? scene.game.canvas);
  const ink = style.getPropertyValue('--rpg-ink').trim() || '#302c21';
  const panel = style.getPropertyValue('--rpg-panel').trim() || '#f0e3bc';
  const edge = style.getPropertyValue('--rpg-frame').trim() || '#604735';
  return labels.map((label) => {
    const markSpace = label.roomType ? 25 : 0;
    const text = scene.add.text(markSpace, 0, '', {
      fontFamily: 'Inter Variable, sans-serif',
      fontSize: '11px',
      color: ink,
      fontStyle: label.detail ? 'bold' : 'normal',
      resolution: 2,
    });
    fitLabel(text, label.text, label.maxWidth - markSpace - 16);
    const parts: Phaser.GameObjects.GameObject[] = [text];
    let width = text.width + markSpace;
    let height = text.height;
    if (label.detail) {
      const detail = scene.add.text(0, height + 4, '', {
        fontFamily: 'Inter Variable, sans-serif',
        fontSize: '10px',
        color: ink,
        resolution: 2,
      });
      fitLabel(detail, label.detail, label.maxWidth - 16);
      parts.push(detail);
      width = Math.max(width, detail.width);
      height += detail.height + 4;
    }
    const frame = scene.add
      .graphics()
      .fillStyle(Number.parseInt(panel.slice(1), 16), 0.98)
      .fillRect(-8, -6, width + 16, height + 12)
      .lineStyle(1, Number.parseInt(edge.slice(1), 16))
      .strokeRect(-8, -6, width + 16, height + 12);
    if (label.roomType) {
      const symbol = scene.add.graphics().lineStyle(1.5, Number.parseInt(ink.slice(1), 16));
      drawRoomSymbol(symbol, label.roomType);
      parts.push(symbol);
    }
    return scene.add
      .container(label.x - width / 2, label.y - height, [frame, ...parts])
      .setDepth(94000);
  });
}
