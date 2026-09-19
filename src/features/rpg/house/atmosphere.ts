import * as Phaser from 'phaser';
import type { RpgSample } from '../types';

/** A bounded set of embers/steam wisps. Cosmetic interactions never change world geometry. */
export class HouseAtmosphere {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly emitters: Array<{
    id: string;
    kind: 'warmth' | 'brew' | 'clock';
    x: number;
    y: number;
    until: number;
  }>;

  public constructor(scene: Phaser.Scene, sample: RpgSample) {
    this.graphics = scene.add.graphics().setDepth(80000);
    this.emitters = (sample.houseInteractions ?? []).flatMap((item) => {
      const target = sample.landmarks.find((l) => l.id === item.id);
      if (!target || !item.effect || item.effect === 'spin') return [];
      return [{ id: item.id, kind: item.effect, x: target.x, y: target.y - 64, until: 0 }];
    });
  }

  public activate(id: string, time: number): void {
    const emitter = this.emitters.find((e) => e.id === id);
    if (emitter) emitter.until = time + 4200;
  }

  public update(time: number, reducedMotion: boolean): void {
    this.graphics.clear();
    if (reducedMotion) return;
    for (const e of this.emitters) {
      const active = time < e.until;
      if (e.kind === 'clock' && !active) continue;
      const steam = e.kind === 'brew';
      const count = active ? 9 : 4;
      for (let i = 0; i < count; i++) {
        const phase = (time / (steam ? 2400 : 1800) + i * 0.237) % 1;
        const alpha = Math.sin(phase * Math.PI) * (steam ? 0.22 : 0.6);
        const drift = Math.sin(phase * 4 + i * 2.6) * (steam ? 7 : 4);
        const x = Math.round(e.x + ((i % 3) - 1) * 8 + drift);
        const y = Math.round(e.y - phase * (active ? 46 : 28));
        this.graphics.fillStyle(steam ? 0xe9e0be : 0xf6d17b, alpha);
        if (steam) this.graphics.fillCircle(x, y, 2 + phase * 3);
        else this.graphics.fillRect(x, y, 2, 2);
      }
    }
  }

  public destroy(): void {
    this.graphics.destroy();
  }
}
