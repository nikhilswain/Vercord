import * as Phaser from 'phaser';
import type { Point } from '../../world/engine/types';
import { getItem, type ItemId } from '../../../domain/adventure/inventory';
import type { AdventureSession } from '../adventure/session';
import { ITEM_ART } from '../inventory/item-art';
import { ACTION_FX, actionEffectFrame } from './assets';

const COLORS = { healing: 0x96e9ad, battle: 0xffcf79, swiftstep: 0x9ae2f0, meal: 0xe4c392 };
type Treatment = keyof typeof COLORS;
const treatment = (id: string): Treatment =>
  id === 'battle-bottle'
    ? 'battle'
    : id === 'swiftstep-bottle'
      ? 'swiftstep'
      : getItem(id)?.benefit === 'meal' || getItem(id)?.plainFood
        ? 'meal'
        : 'healing';

/** The same pooled presentation follows the traveler in town and every adventure area. */
export class TravelerEffects {
  private readonly prop: Phaser.GameObjects.Image;
  private readonly aura: Phaser.GameObjects.Image;
  private readonly particles: Phaser.GameObjects.Graphics;
  private lastUse: AdventureSession['lastConsumption'];
  private completion: { at: number; kind: Treatment } | null = null;

  constructor(scene: Phaser.Scene, model: AdventureSession) {
    this.lastUse = model.lastConsumption;
    this.prop = scene.add.image(0, 0, ITEM_ART['healing-bottle'].key).setVisible(false);
    this.aura = scene.add.image(0, 0, ACTION_FX.healing.key).setVisible(false);
    this.particles = scene.add.graphics();
  }

  update(
    player: Point,
    model: AdventureSession,
    now: number,
    reduced: boolean,
    defeat: number | null,
  ): void {
    const g = this.particles.clear().setDepth(player.y + 46);
    this.prop.setVisible(false);
    this.aura.setVisible(false);
    if (defeat !== null) {
      this.completion = null;
      if (defeat < 700) return;
      const progress = Math.min(1, (defeat - 700) / 2000);
      for (let i = 0; i < (reduced ? 5 : 18); i++) {
        const phase = reduced ? (i + 1) / 6 : (progress + i / 18) % 1;
        const x = player.x + 12 + Math.sin(i * 2.4) * (14 - phase * 5);
        const y = player.y - 6 - (reduced ? 15 : phase * 52);
        this.spark(x, y, 0xc0e4cf, Math.sin(Math.PI * progress) * (1 - phase), i % 4 === 0);
      }
      return;
    }
    if (model.lastConsumption !== this.lastUse) {
      this.lastUse = model.lastConsumption;
      if (this.lastUse) this.completion = { at: now, kind: treatment(this.lastUse.itemId) };
    }
    const pending = model.provisions.pending;
    if (pending) {
      const kind = treatment(pending.id);
      const age = pending.duration - pending.remaining;
      const progress = Math.min(1, age / pending.duration);
      const bite = reduced ? 0.8 : (Math.sin(age * 9 - 1.2) + 1) / 2;
      const art = ITEM_ART[pending.id as ItemId];
      const food = kind === 'meal' || pending.id === 'healing-herb';
      if (art) {
        this.prop
          .setTexture(art.key, art.frame ?? 0)
          .setDisplaySize(food ? 11 : 12, food ? 11 : 12)
          .setPosition(
            player.x + (food ? 4 + (1 - bite) * 3 : 12 - progress * 3),
            player.y - (food ? 23 + bite * 4 : 24 + Math.sin(progress * Math.PI) * 10),
          )
          .setRotation(food ? -0.15 : -0.3 - Math.sin(progress * Math.PI) * 1.7)
          .setDepth(player.y + 45)
          .setVisible(true);
      }
      if (food) {
        for (let i = 0; i < (reduced ? 1 : 5); i++) {
          const p = (age * 1.3 + i * 0.2) % 1;
          g.fillStyle(i % 2 ? 0xf1ddb1 : 0xb68d59, (1 - p) * bite).fillRect(
            Math.round(player.x + 3 + Math.sin(i * 4) * p * 9),
            Math.round(player.y - 24 + p * 10),
            1,
            1,
          );
        }
      } else if (progress > 0.3 && progress < 0.95) {
        // The tipped bottle pours onto the traveler, then its own aura takes over.
        for (let i = 0; i < (reduced ? 2 : 6); i++) {
          const p = (age * 5 + i / 6) % 1;
          g.fillStyle(COLORS[kind], 0.85 * (1 - p * 0.5)).fillRect(
            Math.round(player.x + 7 - p * 8),
            Math.round(player.y - 32 + p * 15),
            1,
            2,
          );
        }
      }
    }
    if (!this.completion) return;
    const age = now - this.completion.at;
    if (age > 1600) {
      this.completion = null;
      return;
    }
    const { kind } = this.completion;
    const fade = Math.sin(Math.PI * Math.min(1, age / 1600));
    if (kind !== 'meal') {
      const asset = ACTION_FX[kind];
      if (age < asset.duration) {
        this.aura
          .setTexture(asset.key, actionEffectFrame(kind, age, reduced))
          .setPosition(player.x, player.y - (kind === 'battle' ? 22 : kind === 'swiftstep' ? 4 : 8))
          .setScale(
            kind === 'healing' ? 0.48 : kind === 'battle' ? 0.8 : 1.1,
            kind === 'healing' ? 0.25 : kind === 'battle' ? 0.95 : 0.55,
          )
          .setAlpha((reduced ? 0.35 : 0.65) * fade)
          .setDepth(player.y + (kind === 'healing' ? -1 : 40))
          .setVisible(true);
        this.aura.clearTint();
        if (kind === 'swiftstep')
          this.aura.setTint(COLORS.swiftstep).setTintMode(Phaser.TintModes.FILL);
        else if (kind === 'battle') this.aura.setTint(COLORS.battle);
      }
    }
    for (let i = 0; i < (reduced ? 4 : 12); i++) {
      const p = reduced ? i / 12 : (age / 1200 + i / 12) % 1;
      const spread = Math.sin(i * 2.4) * 19;
      const x =
        kind === 'swiftstep' ? player.x + Math.cos(p * Math.PI * 2 + i) * 23 : player.x + spread;
      const y =
        player.y -
        (kind === 'swiftstep' ? 4 + Math.sin(p * Math.PI * 2 + i) * 7 : reduced ? 20 : p * 39);
      this.spark(x, y, COLORS[kind], fade * (1 - p), i % 4 === 0 && kind !== 'meal');
    }
  }

  private spark(x: number, y: number, color: number, alpha: number, cross: boolean): void {
    x = Math.round(x);
    y = Math.round(y);
    this.particles.fillStyle(color, alpha).fillRect(x, y, 2, 2);
    if (cross) this.particles.fillRect(x - 2, y, 6, 1).fillRect(x, y - 2, 1, 6);
  }
  destroy(): void {
    this.prop.destroy();
    this.aura.destroy();
    this.particles.destroy();
  }
}
