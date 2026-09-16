import type Phaser from 'phaser';
import type { Point } from '../../world/engine/types';
import { AdventureSession, MAX_ENEMY_PROJECTILES, type Enemy } from './session';
import { SPELL_VISUAL_HEIGHT } from './aim';
import { JUNGLE_WILDLIFE_ASSETS } from '../demo/wildlife-assets';
import { MAGIC_EFFECT_ASSETS, FOREST_GUARDIAN_ASSET } from '../demo/magic-assets';
import { FOREST_ENEMY_ASSETS } from '../demo/enemy-assets';
import { PLANT_ASSETS } from './plant-assets';
import { ENEMY_DEFINITIONS } from '../../../domain/adventure/enemies';
import { attackAnimationTime } from './animation-clock';
import { MOMO_SLIME_ASSET } from './slime-assets';
import { slimeMotion } from './slime-motion';
import { applySlimePalette } from './slime-palette';
import { FOREST_SPARK_ASSET, FOREST_CAST_HAND_OFFSETS } from './forest-casting';
import { FOREST_WILDLIFE_ASSETS, forestWildlifeAsset } from './wildlife-assets';
import { wildlifeDefinition } from '../../../domain/adventure/wildlife';

const creatureAsset = (enemy: Enemy) =>
  forestWildlifeAsset(enemy.kind) ??
  (enemy.kind === 'venus-trap' || enemy.kind === 'blue-death' || enemy.kind === 'root-beast'
    ? PLANT_ASSETS[enemy.kind]
    : enemy.kind === 'forest-brute' || enemy.kind === 'forest-skirmisher'
      ? FOREST_ENEMY_ASSETS[enemy.kind]
      : enemy.kind === 'guardian'
        ? FOREST_GUARDIAN_ASSET
        : enemy.kind === 'slime'
          ? MOMO_SLIME_ASSET
          : JUNGLE_WILDLIFE_ASSETS[enemy.kind as 'bear' | 'snake']);

export function preloadJungleCreatures(scene: Phaser.Scene): void {
  for (const asset of [
    JUNGLE_WILDLIFE_ASSETS.bear,
    JUNGLE_WILDLIFE_ASSETS.snake,
    MOMO_SLIME_ASSET,
    FOREST_GUARDIAN_ASSET,
    FOREST_SPARK_ASSET,
    ...Object.values(FOREST_WILDLIFE_ASSETS),
    ...Object.values(FOREST_ENEMY_ASSETS),
    ...Object.values(PLANT_ASSETS),
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
  castGlow: Phaser.GameObjects.Image | null;
}

/** Fixed sprite pools and one effects layer; static forest art stays in RpgSampleRenderer. */
export class AdventureSessionRenderer {
  private readonly creatures: CreatureView[];
  private readonly flowers: Phaser.GameObjects.Image[];
  private readonly effects: Phaser.GameObjects.Graphics;
  private readonly water: Phaser.GameObjects.Graphics;
  private readonly projectiles: Phaser.GameObjects.Image[];
  private readonly enemySparks: Phaser.GameObjects.Image[];
  private readonly bursts: Phaser.GameObjects.Image[];
  private readonly traps: Phaser.GameObjects.Image[];
  private readonly charge: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly model: AdventureSession,
  ) {
    this.creatures = model.enemies.map((enemy) => {
      const asset = creatureAsset(enemy);
      const sprite = scene.add
        .image(enemy.x, enemy.y, asset.textureKey, asset.animations.idle.frames.down[0]!)
        .setOrigin(asset.origin.x, asset.origin.y)
        .setScale(asset.suggestedScale);
      if (enemy.kind === 'slime') applySlimePalette(sprite, enemy.variant);
      return {
        castGlow:
          ENEMY_DEFINITIONS[enemy.kind].projectile?.visual === 'spark'
            ? scene.add.image(0, 0, FOREST_SPARK_ASSET.textureKey).setVisible(false)
            : null,
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
        sprite,
        shadow: scene.add.ellipse(
          enemy.x,
          enemy.y,
          enemy.kind === 'slime' ? 40 : enemy.kind === 'bear' ? 38 : 25,
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
    this.enemySparks = Array.from({ length: MAX_ENEMY_PROJECTILES }, () =>
      scene.add.image(0, 0, FOREST_SPARK_ASSET.textureKey).setScale(3).setVisible(false),
    );
    this.bursts = pool(16);
    this.charge = pool(1)[0]!;
    this.traps = (model.content.traps ?? []).map((trap) =>
      scene.add
        .image(
          trap.x,
          trap.y,
          model.content.trapVisual?.texture ?? MAGIC_EFFECT_ASSETS['spike-trap'].textureKey,
        )
        .setDepth(trap.y),
    );
  }

  update(player: Point, reducedMotion: boolean): void {
    const g = this.effects.clear();
    const camera = this.scene.cameras.main;
    const visible = (point: Point) =>
      (point.x >= camera.worldView.x - 160 &&
        point.x <= camera.worldView.right + 160 &&
        point.y >= camera.worldView.y - 160 &&
        point.y <= camera.worldView.bottom + 160) ||
      Math.hypot(player.x - point.x, player.y - point.y) < 100;
    this.model.enemies.forEach((enemy, index) => {
      const view = this.creatures[index]!;
      const age = this.model.time - enemy.phaseAt;
      const asset = creatureAsset(enemy);
      const plant = enemy.kind in PLANT_ASSETS;
      const scale = asset.suggestedScale * (ENEMY_DEFINITIONS[enemy.kind].boss ? 1.5 : 1);
      const deathDuration = asset.animations.death.durationMs / 1000;
      const shown =
        (this.model.isEnemyActive(enemy) || (enemy.health === 0 && enemy.phase === 'death')) &&
        visible(enemy) &&
        (enemy.health > 0 || age < deathDuration + 0.35);
      view.sprite.setVisible(shown);
      view.shadow.setVisible(shown && enemy.health > 0 && !plant);
      view.label.setVisible(false);
      view.castGlow?.setVisible(false);
      if (!shown) return;
      const animation = asset.animations[enemy.phase === 'windup' ? 'attack' : enemy.phase];
      // These side-view cast frames must face the target even during a vertical approach.
      const direction = wildlifeDefinition(enemy.kind)
        ? enemy.phase === 'windup' || enemy.phase === 'attack'
          ? enemy.target.x < enemy.x
            ? 'left'
            : 'right'
          : enemy.sideFacing
        : enemy.kind === 'forest-skirmisher' &&
            (enemy.phase === 'windup' || enemy.phase === 'attack')
          ? enemy.target.x < enemy.x
            ? 'left'
            : 'right'
          : enemy.direction;
      const frames = animation.frames[direction];
      const elapsedMs =
        enemy.phase === 'attack'
          ? attackAnimationTime(age * 1000, enemy.behavior, animation)
          : enemy.phase === 'windup'
            ? Math.min(1, (age * 1000) / enemy.windupDurationMs) * (animation.windupEndAtMs ?? 0)
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
      const slime =
        enemy.kind === 'slime'
          ? slimeMotion(
              enemy.phase,
              age * 1000,
              enemy.windupDurationMs,
              enemy.behavior.impactMs,
              reducedMotion,
            )
          : null;
      const anticipation =
        enemy.phase === 'windup' && !reducedMotion
          ? Math.min(1, (age * 1000) / enemy.windupDurationMs)
          : 0;
      view.sprite
        .setPosition(enemy.x, enemy.y - (slime?.lift ?? 0))
        .setScale(
          scale * (slime?.scaleX ?? 1 + anticipation * 0.035),
          scale * (slime?.scaleY ?? 1 - anticipation * 0.045),
        )
        .setDepth(enemy.y)
        .setFrame(frame)
        .setFlipX(asset.flipXDirections?.includes(direction) ?? false)
        .setAlpha(
          slime?.alpha ??
            (enemy.health === 0 ? Math.max(0, 1 - Math.max(0, age - deathDuration) / 0.35) : 1),
        );
      view.shadow
        .setPosition(enemy.x, enemy.y - 1)
        .setDepth(enemy.y - 0.2)
        .setScale(slime?.shadowScale ?? 1);
      if (enemy.phase === 'hurt') view.sprite.setTint(0xffc7b2);
      else if (this.model.time < enemy.slowedUntil) view.sprite.setTint(0x91deff);
      else if (enemy.phase === 'windup') view.sprite.setTint(0xffe6c3);
      else view.sprite.clearTint();
      if (
        view.castGlow &&
        (enemy.phase === 'windup' ||
          (enemy.phase === 'attack' && age * 1000 < enemy.behavior.impactMs))
      ) {
        const progress =
          enemy.phase === 'windup'
            ? Math.min(1, (age * 1000) / enemy.windupDurationMs) * 0.5
            : 0.5 + ((age * 1000) / enemy.behavior.impactMs) * 0.5;
        const hand = FOREST_CAST_HAND_OFFSETS[frames.indexOf(frame)]!;
        view.castGlow
          .setVisible(true)
          .setPosition(
            enemy.x + hand.x * (direction === 'left' ? 1 : -1) * view.sprite.scaleX,
            enemy.y + hand.y * view.sprite.scaleY,
          )
          .setScale(reducedMotion ? 2 : 1 + progress * 2)
          .setDepth(enemy.y + 1);
      }
      if (
        enemy.health > 0 &&
        (!wildlifeDefinition(enemy.kind) || enemy.health < enemy.maxHealth) &&
        Math.hypot(enemy.x - player.x, enemy.y - player.y) < 190 &&
        camera.zoom >= 0.65
      ) {
        const y = enemy.y - (enemy.kind === 'guardian' ? 94 : asset.feet.y * scale) - 9;
        const label = `${enemy.name ?? ENEMY_DEFINITIONS[enemy.kind].name} · Lv ${enemy.level}`;
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
    // Reuse sprite slots for sparks; plants keep their seed visuals on the shared effects layer.
    this.enemySparks.forEach((sprite) => sprite.setVisible(false));
    let sparkIndex = 0;
    for (const seed of this.model.enemyProjectiles) {
      if (!visible(seed)) continue;
      const angle = Math.atan2(seed.velocity.y, seed.velocity.x);
      const x = seed.x,
        y = seed.y - SPELL_VISUAL_HEIGHT;
      if (seed.visual === 'spark') {
        this.enemySparks[sparkIndex++]!.setVisible(true)
          .setPosition(x, y)
          .setDepth(seed.y + 1);
        g.lineStyle(3, 0xf0b84b, 0.7).lineBetween(
          x - Math.cos(angle) * 14,
          y - Math.sin(angle) * 14,
          x,
          y,
        );
        continue;
      }
      g.lineStyle(3, 0xb5db7e, 0.6).lineBetween(
        x - Math.cos(angle) * 13,
        y - Math.sin(angle) * 13,
        x,
        y,
      );
      g.fillStyle(0x34462a).fillCircle(x, y, 7);
      g.fillStyle(0xcadf8a).fillCircle(x, y, 5);
      g.fillStyle(0xf1ebbb).fillCircle(x - 1, y - 2, 2);
    }
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
    this.drawMagic();
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
    this.creatures.forEach(({ sprite, shadow, label, castGlow }) => {
      sprite.destroy();
      shadow.destroy();
      label.destroy();
      castGlow?.destroy();
    });
    this.flowers.forEach((flower) => flower.destroy());
    this.effects.destroy();
    this.water.destroy();
    [...this.projectiles, ...this.enemySparks, ...this.bursts, ...this.traps].forEach((sprite) =>
      sprite.destroy(),
    );
    this.charge.destroy();
  }

  private drawMagic(): void {
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
        p.y - SPELL_VISUAL_HEIGHT,
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
    (this.model.content.traps ?? []).forEach((_, index) => {
      const state = this.model.getTrapState(index);
      const asset = MAGIC_EFFECT_ASSETS['spike-trap'];
      const visual = this.model.content.trapVisual;
      this.traps[index]!.setFrame((visual?.frames ?? asset.frames)[state.frame]!)
        .setOrigin(asset.origin.x, visual?.originY ?? asset.origin.y)
        .setScale(visual?.scale ?? asset.suggestedScale);
      if (state.warning) this.traps[index]!.setTint(0xffd58a);
      else this.traps[index]!.clearTint();
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
