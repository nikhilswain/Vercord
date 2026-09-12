import type Phaser from 'phaser';
import type { Point } from '../../world/engine/types';
import { AdventureSession, trapState, type Enemy } from './session';
import { JUNGLE_WILDLIFE_ASSETS } from '../demo/wildlife-assets';
import {
  MAGIC_EFFECT_ASSETS,
  FOREST_GUARDIAN_ASSET,
  GREEN_SLIME_ASSET,
} from '../demo/magic-assets';
import { FOREST_ENEMY_ASSETS } from '../demo/enemy-assets';
import { ENEMY_DEFINITIONS } from '../../../domain/adventure/enemies';
import { attackAnimationTime } from './animation-clock';

const creatureAsset = (enemy: Enemy) =>
  enemy.kind === 'forest-brute' || enemy.kind === 'forest-skirmisher'
    ? FOREST_ENEMY_ASSETS[enemy.kind]
    : enemy.kind === 'guardian'
      ? FOREST_GUARDIAN_ASSET
      : enemy.kind === 'slime' && enemy.variant === 'green'
        ? GREEN_SLIME_ASSET
        : JUNGLE_WILDLIFE_ASSETS[enemy.kind];

export function preloadJungleCreatures(scene: Phaser.Scene): void {
  for (const asset of [
    ...Object.values(JUNGLE_WILDLIFE_ASSETS),
    FOREST_GUARDIAN_ASSET,
    GREEN_SLIME_ASSET,
    ...Object.values(FOREST_ENEMY_ASSETS),
    ...Object.values(MAGIC_EFFECT_ASSETS),
  ]) {
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
  label: Phaser.GameObjects.Text;
}

/** Fixed sprite pools and one effects layer; static forest art stays in RpgSampleRenderer. */
export class AdventureSessionRenderer {
  private readonly creatures: CreatureView[];
  private readonly flowers: Phaser.GameObjects.Image[];
  private readonly effects: Phaser.GameObjects.Graphics;
  private readonly water: Phaser.GameObjects.Graphics;
  private readonly projectiles: Phaser.GameObjects.Image[];
  private readonly bursts: Phaser.GameObjects.Image[];
  private readonly traps: Phaser.GameObjects.Image[];
  private readonly charge: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly model: AdventureSession,
  ) {
    this.creatures = model.enemies.map((enemy) => {
      const asset = creatureAsset(enemy);
      return {
        label: scene.add
          .text(enemy.x, enemy.y, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            color: '#f1e5c4',
            backgroundColor: '#15291fe6',
            padding: { x: 5, y: 3 },
          })
          .setOrigin(0.5, 1)
          .setDepth(50001)
          .setVisible(false),
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
    const pool = (count: number) =>
      Array.from({ length: count }, () =>
        scene.add.image(0, 0, MAGIC_EFFECT_ASSETS['fire-bolt'].textureKey).setVisible(false),
      );
    this.projectiles = pool(8);
    this.bursts = pool(16);
    this.charge = pool(1)[0]!;
    this.traps = (model.content.traps ?? []).map((trap) =>
      scene.add
        .image(trap.x, trap.y, MAGIC_EFFECT_ASSETS['spike-trap'].textureKey)
        .setDepth(trap.y),
    );
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
      view.label.setVisible(false);
      if (!shown) return;
      const asset = creatureAsset(enemy);
      const animation = asset.animations[enemy.phase === 'windup' ? 'idle' : enemy.phase];
      const frames = animation.frames[enemy.direction];
      const elapsedMs =
        enemy.phase === 'attack'
          ? attackAnimationTime(age * 1000, ENEMY_DEFINITIONS[enemy.kind], animation)
          : age * 1000;
      const cycle = elapsedMs / animation.durationMs;
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
      else if (this.model.time < enemy.slowedUntil) view.sprite.setTint(0x91deff);
      else view.sprite.clearTint();
      if (enemy.phase === 'windup') this.warning(g, enemy, age);
      if (
        enemy.health > 0 &&
        Math.hypot(enemy.x - player.x, enemy.y - player.y) < 190 &&
        camera.zoom >= 0.65
      ) {
        const y =
          enemy.y - (enemy.kind === 'guardian' ? 94 : asset.feet.y * asset.suggestedScale) - 9;
        const label = `${ENEMY_DEFINITIONS[enemy.kind].name} · Lv ${enemy.level}`;
        if (view.label.text !== label) view.label.setText(label);
        view.label.setPosition(enemy.x, y - 4).setVisible(true);
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
    this.drawMagic(g);
    for (const effect of this.model.effects) {
      const age = this.model.time - effect.at;
      const progress = age / 0.85;
      if (effect.kind === 'fire' || effect.kind === 'water' || effect.kind.endsWith('-death'))
        continue;
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
    this.creatures.forEach(({ sprite, shadow, label }) => {
      sprite.destroy();
      shadow.destroy();
      label.destroy();
    });
    this.flowers.forEach((flower) => flower.destroy());
    this.effects.destroy();
    this.water.destroy();
    [...this.projectiles, ...this.bursts, ...this.traps].forEach((sprite) => sprite.destroy());
    this.charge.destroy();
  }

  private warning(g: Phaser.GameObjects.Graphics, enemy: Enemy, age: number): void {
    const size = ENEMY_DEFINITIONS[enemy.kind].hitRadius;
    g.fillStyle(0xd87348, 0.14).fillEllipse(enemy.target.x, enemy.target.y, size * 2, size);
    g.lineStyle(2, 0xffcd83, 0.9).strokeEllipse(enemy.target.x, enemy.target.y, size * 2, size);
    const rise = Math.min(1, (age * 1000) / ENEMY_DEFINITIONS[enemy.kind].windupMs);
    g.lineStyle(3, 0xffe3a4, 1).lineBetween(
      enemy.x,
      enemy.y - 55,
      enemy.x,
      enemy.y - 62 - rise * 8,
    );
    g.fillStyle(0xffe3a4, 1).fillCircle(enemy.x, enemy.y - 49, 2);
  }

  private drawMagic(g: Phaser.GameObjects.Graphics): void {
    const show = (
      sprite: Phaser.GameObjects.Image,
      id: keyof typeof MAGIC_EFFECT_ASSETS,
      x: number,
      y: number,
      age: number,
      rotation = 0,
    ) => {
      const asset = MAGIC_EFFECT_ASSETS[id];
      const cycle = Math.max(0, (age * 1000) / asset.durationMs);
      const frame =
        asset.frames[
          asset.loop
            ? Math.floor(cycle * asset.frames.length) % asset.frames.length
            : Math.min(asset.frames.length - 1, Math.floor(cycle * asset.frames.length))
        ]!;
      if (sprite.texture.key !== asset.textureKey) sprite.setTexture(asset.textureKey, frame);
      else if (String(sprite.frame.name) !== String(frame)) sprite.setFrame(frame);
      sprite
        .setPosition(x, y)
        .setOrigin(asset.origin.x, asset.origin.y)
        .setScale(asset.suggestedScale)
        .setRotation(rotation)
        .setDepth(y + 40)
        .setVisible(true);
    };
    this.projectiles.forEach((sprite, i) => {
      const p = this.model.projectiles[i];
      if (!p) {
        sprite.setVisible(false);
        return;
      }
      show(
        sprite,
        p.spell === 'fire' ? 'fire-bolt' : 'water-bolt',
        p.x,
        p.y - 22,
        this.model.time - p.at,
        Math.atan2(p.velocity.y, p.velocity.x),
      );
    });
    this.bursts.forEach((sprite, i) => {
      const effect = this.model.effects[i];
      const id =
        effect?.kind === 'fire'
          ? 'fire-impact'
          : effect?.kind === 'water'
            ? 'water-impact'
            : effect?.kind === 'fire-death'
              ? 'fire-death'
              : effect?.kind === 'water-death'
                ? 'water-death'
                : effect?.kind === 'poison-death'
                  ? 'poison-death'
                  : null;
      if (
        !effect ||
        !id ||
        (this.model.time - effect.at) * 1000 > MAGIC_EFFECT_ASSETS[id].durationMs
      ) {
        sprite.setVisible(false);
        return;
      }
      show(sprite, id, effect.x, effect.y - 20, this.model.time - effect.at);
    });
    (this.model.content.traps ?? []).forEach((trap, index) => {
      const state = trapState(this.model.time, trap.offset);
      const asset = MAGIC_EFFECT_ASSETS['spike-trap'];
      this.traps[index]!.setFrame(asset.frames[state.frame]!)
        .setOrigin(asset.origin.x, asset.origin.y)
        .setScale(asset.suggestedScale);
      if (state.warning) {
        g.lineStyle(2, 0xffda7a, 0.8).strokeEllipse(trap.x, trap.y, 48, 25);
      }
    });
    const cast = this.model.cast;
    this.charge.setVisible(Boolean(cast && !cast.released));
    if (cast && !cast.released) {
      const age = Math.min(1, ((this.model.time - cast.at) * 1000) / this.model.casting.releaseMs);
      const x = cast.origin.x + cast.aim.x * 14,
        y = cast.origin.y - 24 + cast.aim.y * 6;
      show(
        this.charge,
        cast.spell === 'fire' ? 'fire-cast' : 'water-cast',
        x,
        y,
        this.model.time - cast.at,
      );
      this.charge.setScale(0.35 + age * 0.4);
    }
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
