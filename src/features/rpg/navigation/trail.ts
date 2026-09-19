import * as Phaser from 'phaser';
import type { Point } from '../../../domain/world/content/v1/types';
import type { NavigationState } from './types';
import { TrailSparkField, TRAIL_SPARK_LIMIT } from './trail-field';

const STAR = 'navigation-star';
const MOTE = 'navigation-mote';
const GOLD = 0xffd66c;
const CREAM = 0xfff0b0;

export function preloadNavigationTrail(scene: Phaser.Scene): void {
  for (const [key, file] of [
    [STAR, 'star_01.png'],
    [MOTE, 'circle_05.png'],
  ] as const) {
    if (!scene.textures.exists(key))
      scene.load.image(key, `/game-assets/navigation-sparkles/${file}`);
  }
}

/** Pooled, world-anchored firefly lights. No line, frame-based velocity or per-point emitters. */
export class NavigationTrail {
  private readonly field = new TrailSparkField();
  private readonly views;
  private readonly layer: Phaser.GameObjects.Container;
  private identity = '';
  private shownAt = 0;

  public constructor(private readonly scene: Phaser.Scene) {
    scene.textures.get(STAR).setFilter(Phaser.Textures.FilterMode.LINEAR);
    scene.textures.get(MOTE).setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.layer = scene.add.container().setDepth(1).setVisible(false);
    this.views = Array.from({ length: TRAIL_SPARK_LIMIT }, () => {
      const halo = scene.add.image(0, 0, MOTE).setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD);
      const core = scene.add.image(0, 0, STAR).setTint(CREAM).setBlendMode(Phaser.BlendModes.ADD);
      this.layer.add([halo, core]);
      return { halo, core, id: -1, appearedAt: 0, x: Infinity, y: Infinity };
    });
  }

  public update(
    state: NavigationState | null,
    player: Point,
    now: number,
    reducedMotion: boolean,
    zoom: number,
  ): void {
    if (!state || state.status !== 'guiding' || state.path.length < 2) {
      this.layer.setVisible(false);
      this.identity = '';
      return;
    }
    const identity = `${state.scene}/${state.target.id}/${state.portal ?? ''}`;
    if (identity !== this.identity) {
      this.identity = identity;
      this.shownAt = now;
      for (const view of this.views) view.id = -1;
    }
    this.layer.setVisible(true);
    const appear = reducedMotion ? 1 : Math.min(1, (now - this.shownAt) / 240);
    const scale = 1 / Math.sqrt(Math.max(0.4, zoom));
    const camera = this.scene.cameras.main.worldView;
    const sparks = this.field.sample(state.path, player, now, reducedMotion);
    for (const view of this.views) {
      view.halo.setVisible(false);
      view.core.setVisible(false);
    }
    for (const spark of sparks) {
      if (
        spark.alpha < 0.015 ||
        spark.x < camera.left - 40 ||
        spark.x > camera.right + 40 ||
        spark.y < camera.top - 40 ||
        spark.y > camera.bottom + 40
      )
        continue;
      const view = this.views[spark.id % TRAIL_SPARK_LIMIT]!;
      const relocated = view.id !== spark.id || Math.hypot(view.x - spark.x, view.y - spark.y) > 24;
      if (relocated) view.appearedAt = now;
      view.id = spark.id;
      view.x = spark.x;
      view.y = spark.y;
      const settle = reducedMotion ? 1 : Math.min(1, (now - view.appearedAt) / 180);
      const alpha = spark.alpha * appear * settle;
      const size = spark.size * scale;
      view.halo
        .setVisible(true)
        .setPosition(spark.x, spark.y)
        .setDisplaySize(size * (spark.major ? 1.5 : 2), size * (spark.major ? 1.25 : 2))
        .setAlpha(alpha * (spark.major ? 0.32 : 0.22));
      view.core
        .setVisible(true)
        .setPosition(spark.x, spark.y)
        .setTexture(spark.major ? STAR : MOTE)
        .setRotation(spark.rotation)
        .setDisplaySize(size * (spark.major ? 0.85 : 1), size * (spark.major ? 1.15 : 1))
        .setAlpha(alpha * (spark.major ? 1 : 0.9));
    }
  }

  public destroy(): void {
    this.layer.destroy();
  }
}
