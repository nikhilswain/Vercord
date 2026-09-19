import type Phaser from 'phaser';
import type { Point } from '../../world/engine/types';
import { ITEM_ART } from '../inventory/item-art';
import type { AdventureSession } from './session';

export function preloadLoot(scene: Phaser.Scene): void {
  const loaded = new Set<string>();
  for (const art of Object.values(ITEM_ART)) {
    if (loaded.has(art.key) || scene.textures.exists(art.key)) continue;
    loaded.add(art.key);
    if (art.frameWidth && art.frameHeight)
      scene.load.spritesheet(art.key, art.url, {
        frameWidth: art.frameWidth,
        frameHeight: art.frameHeight,
      });
    else {
      if (art.crop) {
        const crop = art.crop;
        scene.load.once(`filecomplete-image-${art.key}`, () =>
          scene.textures.get(art.key).add(art.frame ?? 0, 0, crop.x, crop.y, crop.size, crop.size),
        );
      }
      scene.load.image(art.key, art.url);
    }
  }
}
interface LootView {
  icon: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
}
const destroy = (view: LootView) => {
  view.icon.destroy();
  view.shadow.destroy();
};

/** One tiny icon per visible stack; off-camera loot stays in the saved model only. */
export class GroundLootRenderer {
  private readonly views = new Map<string, LootView>();
  private readonly glints: Phaser.GameObjects.Graphics;
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly model: AdventureSession,
  ) {
    this.glints = scene.add.graphics().setDepth(49999);
  }
  update(player: Point, reducedMotion: boolean): void {
    const camera = this.scene.cameras.main.worldView;
    const nearest = this.model.nearbyLoot(player)?.id;
    const visible = new Set<string>();
    const g = this.glints.clear();
    for (const drop of this.model.loot) {
      if (
        drop.x < camera.x - 64 ||
        drop.x > camera.right + 64 ||
        drop.y < camera.y - 64 ||
        drop.y > camera.bottom + 64
      )
        continue;
      visible.add(drop.id);
      let view = this.views.get(drop.id);
      if (!view) {
        const art = ITEM_ART[drop.itemId];
        view = {
          icon: this.scene.add
            .image(drop.x, drop.y, art.key, art.frame)
            .setDisplaySize(24, 24)
            .setOrigin(0.5, 1),
          shadow: this.scene.add.ellipse(drop.x, drop.y, 20, 7, 0x14291d, 0.5),
        };
        this.views.set(drop.id, view);
      }
      const phase = this.model.time * 2 + drop.x * 0.13 + drop.y * 0.09;
      const lift = reducedMotion ? 3 : 3 + Math.round(Math.sin(phase));
      view.icon.setPosition(drop.x, drop.y - lift).setDepth(drop.y + 1);
      view.shadow.setDepth(drop.y - 1).setStrokeStyle(1, 0xd9c382, drop.id === nearest ? 0.8 : 0.3);
      // A quiet pixel glint, independent of player speed. No permanent item labels.
      const alpha = reducedMotion ? 0.7 : 0.5 + (Math.sin(phase * 1.4) + 1) * 0.2;
      g.fillStyle(0xffe5a0, alpha);
      g.fillRect(drop.x + 8, drop.y - 27 - lift, 1, 5);
      g.fillRect(drop.x + 6, drop.y - 25 - lift, 5, 1);
    }
    for (const [id, view] of this.views)
      if (!visible.has(id)) {
        destroy(view);
        this.views.delete(id);
      }
  }
  destroy(): void {
    this.views.forEach(destroy);
    this.views.clear();
    this.glints.destroy();
  }
}
