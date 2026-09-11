import type Phaser from 'phaser';
import type { Point } from '../../world/engine/types';
import { JungleAdventure, type Enemy } from './adventure';
import { JUNGLE_WILDLIFE_ASSETS } from './wildlife-assets';

export function preloadJungleCreatures(scene: Phaser.Scene): void {
  for (const asset of Object.values(JUNGLE_WILDLIFE_ASSETS)) {
    if (!scene.textures.exists(asset.textureKey))
      scene.load.spritesheet(asset.textureKey, asset.imageUrl, {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
      });
  }
}

interface CreatureView {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
}

/** Fixed sprite pools and one effects layer; static forest art stays in RpgSampleRenderer. */
export class JungleAdventureRenderer {
  private readonly creatures: CreatureView[];
  private readonly flowers: Phaser.GameObjects.Image[];
  private readonly effects: Phaser.GameObjects.Graphics;
  private readonly water: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly model: JungleAdventure,
  ) {
    this.creatures = model.enemies.map((enemy) => {
      const asset = JUNGLE_WILDLIFE_ASSETS[enemy.kind];
      return {
        sprite: scene.add
          .image(enemy.x, enemy.y, asset.textureKey, asset.animations.idle.frames.down[0]!)
          .setOrigin(asset.origin.x, asset.origin.y)
          .setScale(asset.suggestedScale),
        shadow: scene.add.ellipse(
          enemy.x,
          enemy.y,
          enemy.kind === 'bear' ? 38 : 25,
          10,
          0x102b24,
          0.3,
        ),
      };
    });
    this.flowers = model.content.flowers.map((flower) =>
      scene.add
        .image(flower.x, flower.y, 'lpc-flowers', flower.kind === 'healing' ? 5 : 8)
        .setOrigin(0.5, 0.9)
        .setDepth(flower.y),
    );
    this.water = scene.add.graphics().setDepth(-40);
    this.effects = scene.add.graphics().setDepth(50000);
  }

  update(player: Point, reducedMotion: boolean): void {
    const g = this.effects.clear();
    const camera = this.scene.cameras.main;
    const visible = (point: Point) =>
      camera.worldView.contains(point.x, point.y) ||
      Math.hypot(player.x - point.x, player.y - point.y) < 100;
    this.model.enemies.forEach((enemy, index) => {
      const view = this.creatures[index]!;
      const age = this.model.time - enemy.phaseAt;
      const shown = visible(enemy) && (enemy.health > 0 || age < 1);
      view.sprite.setVisible(shown);
      view.shadow.setVisible(shown && enemy.health > 0);
      if (!shown) return;
      const asset = JUNGLE_WILDLIFE_ASSETS[enemy.kind];
      const animation = asset.animations[enemy.phase === 'windup' ? 'idle' : enemy.phase];
      const frames = animation.frames[enemy.direction];
      const cycle = (age * 1000) / animation.durationMs;
      const frame =
        reducedMotion && enemy.phase === 'idle'
          ? frames[0]!
          : frames[
              animation.loop
                ? Math.floor(cycle * frames.length) % frames.length
                : Math.min(frames.length - 1, Math.floor(cycle * frames.length))
            ]!;
      const jump =
        !reducedMotion && enemy.kind === 'slime' && enemy.phase === 'attack'
          ? Math.sin(Math.min(1, age / 0.38) * Math.PI) * 22
          : 0;
      view.sprite
        .setPosition(enemy.x, enemy.y - jump)
        .setDepth(enemy.y)
        .setFrame(frame)
        .setAlpha(enemy.health === 0 ? Math.max(0, 1 - age) : 1);
      view.shadow.setPosition(enemy.x, enemy.y - 1).setDepth(enemy.y - 0.2);
      if (enemy.phase === 'hurt') view.sprite.setTint(0xffc7b2);
      else view.sprite.clearTint();
      if (enemy.phase === 'windup') this.warning(g, enemy, age);
      if (
        enemy.health > 0 &&
        Math.hypot(enemy.x - player.x, enemy.y - player.y) < 190 &&
        camera.zoom >= 0.65
      ) {
        const y = enemy.y - asset.feet.y * asset.suggestedScale - 9;
        g.fillStyle(0x18251d, 0.9).fillRoundedRect(enemy.x - 20, y, 40, 5, 2);
        g.fillStyle(enemy.kind === 'slime' ? 0x98d6ba : 0xe5b887, 1).fillRoundedRect(
          enemy.x - 19,
          y + 1,
          (38 * enemy.health) / enemy.maxHealth,
          3,
          1,
        );
      }
    });
    this.model.content.flowers.forEach((flower, index) => {
      const shown = !this.model.gathered.has(flower.id);
      this.flowers[index]!.setVisible(shown);
      if (!shown || !visible(flower)) return;
      const pulse = reducedMotion ? 0.7 : 0.6 + Math.sin(this.model.time * 2 + index) * 0.15;
      g.lineStyle(1, flower.kind === 'healing' ? 0xf5df98 : 0xafdcf5, pulse).strokeEllipse(
        flower.x,
        flower.y + 1,
        28,
        11,
      );
      g.fillStyle(flower.kind === 'healing' ? 0xffe4a6 : 0xccecff, pulse);
      g.fillCircle(
        flower.x + 8,
        flower.y - 25 - (reducedMotion ? 0 : Math.sin(this.model.time * 2 + index) * 3),
        2,
      );
    });
    this.drawSwing(g, player);
    for (const effect of this.model.effects) {
      const age = this.model.time - effect.at;
      const progress = age / 0.85;
      const color = effect.kind === 'hit' ? 0xffe1b0 : effect.kind === 'heal' ? 0xbbeca8 : 0xd4edfa;
      g.lineStyle(2, color, 1 - progress).strokeCircle(effect.x, effect.y - 14, 9 + progress * 20);
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5;
        const spread = reducedMotion ? 14 : 14 + progress * 25;
        g.fillStyle(color, 1 - progress).fillRect(
          effect.x + Math.cos(angle) * spread,
          effect.y - 16 + Math.sin(angle) * spread - (reducedMotion ? 0 : progress * 20),
          3,
          3,
        );
      }
    }
    this.drawWater(reducedMotion);
  }

  destroy(): void {
    this.creatures.forEach(({ sprite, shadow }) => {
      sprite.destroy();
      shadow.destroy();
    });
    this.flowers.forEach((flower) => flower.destroy());
    this.effects.destroy();
    this.water.destroy();
  }

  private warning(g: Phaser.GameObjects.Graphics, enemy: Enemy, age: number): void {
    const size = enemy.kind === 'bear' ? 48 : 34;
    g.fillStyle(0xd87348, 0.14).fillEllipse(enemy.target.x, enemy.target.y, size * 2, size);
    g.lineStyle(2, 0xffcd83, 0.9).strokeEllipse(enemy.target.x, enemy.target.y, size * 2, size);
    const rise = Math.min(1, age / 0.6);
    g.lineStyle(3, 0xffe3a4, 1).lineBetween(
      enemy.x,
      enemy.y - 55,
      enemy.x,
      enemy.y - 62 - rise * 8,
    );
    g.fillStyle(0xffe3a4, 1).fillCircle(enemy.x, enemy.y - 49, 2);
  }

  private drawSwing(g: Phaser.GameObjects.Graphics, player: Point): void {
    const swing = this.model.swing;
    if (!swing) return;
    const progress = Math.min(1, (this.model.time - swing.at) / 0.32);
    const facing = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[
      swing.direction
    ];
    const angle = facing - 1.1 + progress * 2.2;
    const x = player.x,
      y = player.y - 20;
    g.lineStyle(9, 0xddeebf, (1 - progress) * 0.5)
      .beginPath()
      .arc(x, y, 53, angle - 0.5, angle, false)
      .strokePath();
    const point = (r: number, side = 0) => ({
      x: x + Math.cos(angle) * r + Math.cos(angle + Math.PI / 2) * side,
      y: y + Math.sin(angle) * r + Math.sin(angle + Math.PI / 2) * side,
    });
    const hilt = point(18),
      tip = point(67),
      a = point(25, 3),
      b = point(25, -3);
    g.fillStyle(0xe6edf0, 1).fillTriangle(a.x, a.y, tip.x, tip.y, b.x, b.y);
    g.lineStyle(2, 0x53676a, 1).strokeTriangle(a.x, a.y, tip.x, tip.y, b.x, b.y);
    const guardA = point(24, 7),
      guardB = point(24, -7);
    g.lineStyle(4, 0xdab46e, 1).lineBetween(guardA.x, guardA.y, guardB.x, guardB.y);
    g.lineStyle(4, 0x6c4931, 1).lineBetween(hilt.x, hilt.y, a.x, a.y);
  }

  private drawWater(reducedMotion: boolean): void {
    const g = this.water.clear();
    for (const pool of this.model.content.water) {
      for (let i = 0; i < 10; i++) {
        const phase = reducedMotion ? 0.5 : (this.model.time * 0.22 + i * 0.17) % 1;
        const x = pool.x + 45 + ((i * 71) % (pool.width - 90));
        const y = pool.y + 40 + ((i * 53) % (pool.height - 80));
        g.lineStyle(1, 0xc1ecdb, (1 - phase) * 0.35).strokeEllipse(
          x,
          y,
          9 + phase * 20,
          3 + phase * 7,
        );
      }
    }
  }
}
