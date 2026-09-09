import type Phaser from 'phaser';
import type { Point } from '../../../domain/world/content/v1/types';

interface PetEffect {
  started: number;
  hearts: Phaser.GameObjects.Graphics[];
  point: Point;
}

/** Short, bounded interaction feedback. No persistent state or quest rewards live in the renderer. */
export class PetEffects {
  private readonly effects = new Map<string, PetEffect>();

  constructor(private readonly scene: Phaser.Scene) {}

  has(id: string): boolean {
    return this.effects.has(id);
  }

  start(id: string, point: Point, time: number): void {
    if (this.effects.has(id) || this.effects.size >= 8) return;
    const hearts = Array.from({ length: 3 }, () => {
      const heart = this.scene.add.graphics().setDepth(95004);
      ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'].forEach((row, y) => {
        [...row].forEach((cell, x) => {
          if (cell === '1')
            heart.fillStyle(y < 2 ? 0xffa7af : 0xe75d78).fillRect(x * 2, y * 2, 2, 2);
        });
      });
      return heart.setVisible(false);
    });
    this.effects.set(id, { hearts, point: { ...point }, started: time });
  }

  update(time: number, reducedMotion: boolean): void {
    for (const [id, effect] of this.effects) {
      const elapsed = time - effect.started;
      if (elapsed >= 1400) {
        effect.hearts.forEach((heart) => heart.destroy());
        this.effects.delete(id);
        continue;
      }
      effect.hearts.forEach((heart, index) => {
        const age = elapsed - index * 140;
        const progress = Math.max(0, age / 1120);
        heart
          .setVisible(reducedMotion || age >= 0)
          .setAlpha(reducedMotion ? 1 : Math.min(1, Math.max(0, (1 - progress) * 3)))
          .setPosition(
            Math.round(effect.point.x + (index - 1) * 15 - 7),
            Math.round(
              effect.point.y - 42 - (reducedMotion ? (index === 1 ? 10 : 0) : progress * 30),
            ),
          );
      });
    }
  }

  destroy(): void {
    for (const effect of this.effects.values()) effect.hearts.forEach((heart) => heart.destroy());
    this.effects.clear();
  }
}
