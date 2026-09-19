import * as Phaser from 'phaser';
import type { Point } from '../../../domain/world/content/v1/types';

const STAR = 'navigation-star',
  MOTE = 'navigation-mote',
  RUNE = 'hearth-runes';
export function preloadWaygateEffects(scene: Phaser.Scene): void {
  if (!scene.textures.exists(RUNE)) scene.load.image(RUNE, '/game-assets/ritual-sigils/sun.svg');
}
interface Spark {
  core: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
}

/** Pooled world-space lights, shared by forest waygates and the carried Hearthstone.
 * Reuses the credited Kenney sparkle textures; clock speed never depends on movement.
 */
export class WaygateEffects {
  private readonly gateViews: Array<{
    point: Point;
    sparks: Spark[];
    light: Phaser.GameObjects.Image;
  }>;
  private readonly sparks: Spark[];
  private readonly rune: Phaser.GameObjects.Image;
  constructor(
    private readonly scene: Phaser.Scene,
    gates: readonly Point[],
  ) {
    this.gateViews = gates.map((point) => ({
      point,
      sparks: Array.from({ length: 12 }, () => this.spark(point.y - 17)),
      light: scene.add
        .image(point.x, point.y - 64, MOTE)
        .setTint(0xd3d59a)
        .setDisplaySize(94, 126)
        .setAlpha(0.14)
        .setDepth(point.y - 18)
        .setBlendMode(Phaser.BlendModes.ADD),
    }));
    this.sparks = Array.from({ length: 28 }, () => this.spark(0));
    this.rune = scene.add
      .image(0, 0, RUNE)
      .setTint(0xe8cf83)
      .setDisplaySize(92, 42)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
  }
  private spark(depth: number): Spark {
    return {
      core: this.scene.add
        .image(0, 0, STAR)
        .setTint(0xffecc0)
        .setDepth(depth)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false),
      halo: this.scene.add
        .image(0, 0, MOTE)
        .setTint(0xe7c46c)
        .setDepth(depth - 0.1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false),
    };
  }
  private show(s: Spark, x: number, y: number, alpha: number, size: number, depth: number): void {
    s.core
      .setVisible(true)
      .setPosition(x, y)
      .setDisplaySize(size, size * 1.3)
      .setAlpha(alpha)
      .setDepth(depth);
    s.halo
      .setVisible(true)
      .setPosition(x, y)
      .setDisplaySize(size * 2.6, size * 2.6)
      .setAlpha(alpha * 0.28)
      .setDepth(depth - 0.1);
  }
  update(time: number, reduced: boolean, player: Point, recallProgress: number | null): void {
    const view = this.scene.cameras.main.worldView;
    for (const gate of this.gateViews) {
      const p = gate.point;
      const visible =
        p.x >= view.left - 160 &&
        p.x <= view.right + 160 &&
        p.y >= view.top - 100 &&
        p.y <= view.bottom + 160;
      gate.light.setVisible(visible).setAlpha(reduced ? 0.12 : 0.13 + Math.sin(time / 1400) * 0.03);
      for (const [i, spark] of gate.sparks.entries()) {
        spark.core.setVisible(false);
        spark.halo.setVisible(false);
        if (!visible || reduced) continue;
        const phase = (time / 3900 + i * 0.137) % 1;
        this.show(
          spark,
          p.x + Math.sin(i * 2.3 + phase * 3) * (22 + (i % 3) * 10),
          p.y - 17 - phase * 98,
          Math.sin(phase * Math.PI) * 0.75,
          i % 4 === 0 ? 9 : 4,
          p.y - 17,
        );
      }
    }
    this.rune.setVisible(recallProgress !== null);
    for (const spark of this.sparks) {
      spark.core.setVisible(false);
      spark.halo.setVisible(false);
    }
    if (recallProgress === null) return;
    const t = recallProgress,
      strength = Math.sin((Math.min(1, t / 0.8) * Math.PI) / 2);
    this.rune
      .setPosition(player.x, player.y - 1)
      .setDepth(player.y - 0.2)
      .setAlpha(0.35 + strength * 0.5)
      .setDisplaySize(64 + strength * 40, 30 + strength * 20);
    if (reduced) return;
    // A double helix rises outside the traveler's silhouette, then draws inward.
    for (const [i, spark] of this.sparks.entries()) {
      const phase = (t * 1.5 + i / 28) % 1;
      const angle = phase * Math.PI * 5 + (i % 2) * Math.PI;
      const radius = (40 - phase * 10) * (1 - t * 0.45);
      this.show(
        spark,
        player.x + Math.cos(angle) * radius,
        player.y - phase * (65 + strength * 35),
        Math.sin(phase * Math.PI) * strength,
        i % 5 === 0 ? 13 : 7,
        player.y + 100,
      );
    }
  }
  destroy(): void {
    this.rune.destroy();
    for (const gate of this.gateViews) {
      gate.light.destroy();
      for (const s of gate.sparks) {
        s.core.destroy();
        s.halo.destroy();
      }
    }
    for (const s of this.sparks) {
      s.core.destroy();
      s.halo.destroy();
    }
  }
}
