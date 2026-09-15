import * as Phaser from 'phaser';
import type { ScenarioSession } from '../../../domain/adventure/scenario';
import { RITUAL_RELEASE_MS, type RitualSeal } from './ritual-seal-assets';

/** Two small vector masks, fixed sprite pools, and the paused scenario clock. No frame allocations. */
export class RitualSealRenderer {
  private readonly views;
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly model: ScenarioSession,
    definitions: readonly RitualSeal[],
  ) {
    this.views = definitions.map((definition) => {
      const color = definition.kind === 'sun' ? 0xf1be61 : 0x9edcec;
      const plane = scene.add.container(definition.x, definition.y).setScale(1, 0.56).setDepth(-1);
      const glow = scene.add
        .image(0, 0, `ritual-${definition.kind}`)
        .setDisplaySize(198, 198)
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD);
      const ring = scene.add
        .image(0, 0, `ritual-${definition.kind}`)
        .setDisplaySize(184, 184)
        .setTint(color);
      const core = scene.add.graphics().lineStyle(2, color, 1);
      if (definition.kind === 'sun') {
        core.strokeCircle(0, 0, 8);
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          core.lineBetween(
            Math.cos(angle) * 12,
            Math.sin(angle) * 12,
            Math.cos(angle) * 17,
            Math.sin(angle) * 17,
          );
        }
      } else {
        core
          .beginPath()
          .arc(0, 0, 15, 0.6, Math.PI * 2 - 0.6)
          .strokePath();
        core
          .beginPath()
          .arc(8, 0, 14, 1.88, Math.PI * 2 - 1.88)
          .strokePath();
      }
      const motes = Array.from({ length: 6 }, () => scene.add.rectangle(0, 0, 3, 3, color));
      plane.add([glow, ring, core, ...motes]);
      return { definition, plane, glow, ring, core, motes, color };
    });
  }
  update(reducedMotion: boolean): void {
    const camera = this.scene.cameras.main;
    for (const view of this.views) {
      const { definition: seal, plane, ring, glow, core, motes } = view;
      const visible =
        camera.worldView.contains(seal.x, seal.y) ||
        (seal.x >= camera.worldView.left - 120 &&
          seal.x <= camera.worldView.right + 120 &&
          seal.y >= camera.worldView.top - 90 &&
          seal.y <= camera.worldView.bottom + 90);
      plane.setVisible(visible);
      if (!visible) continue;
      const released = this.model.progress.has(seal.flag);
      const age = this.model.age(seal.flag);
      const progress = released ? Math.min(1, (age * 1000) / RITUAL_RELEASE_MS) : 0;
      const spent = released && progress >= 1;
      const direction = seal.kind === 'sun' ? 1 : -1;
      const rotation =
        reducedMotion || spent
          ? 0
          : direction * (this.model.time * 0.18 + progress * progress * 2.5);
      const pulse = reducedMotion ? 0.86 : 0.86 + Math.sin(this.model.time * 1.8) * 0.1;
      const scale = reducedMotion ? 1 : 1 + Math.sin(progress * Math.PI) * 0.16;
      ring
        .setRotation(rotation)
        .setDisplaySize(184 * scale, 184 * scale)
        .setTint(spent ? 0x727775 : view.color)
        .setAlpha(spent ? 0.28 : released ? Math.max(0, 1 - progress) : pulse);
      glow
        .setRotation(rotation)
        .setDisplaySize(198 * scale, 198 * scale)
        .setAlpha(
          spent || reducedMotion ? 0 : released ? Math.sin(progress * Math.PI) * 0.35 : 0.14,
        );
      core.setAlpha(spent ? 0.24 : released ? 1 - progress : 0.95);
      for (let i = 0; i < motes.length; i++) {
        const mote = motes[i]!;
        const angle = (i * Math.PI) / 3 + rotation * 1.6;
        const radius = 83 + (reducedMotion ? 0 : progress * 48);
        mote
          .setVisible(!spent && !reducedMotion)
          .setPosition(Math.cos(angle) * radius, Math.sin(angle) * radius)
          .setAlpha(released ? 1 - progress : 0.6 + 0.25 * Math.sin(this.model.time * 2 + i));
      }
    }
  }
  destroy(): void {
    for (const view of this.views) view.plane.destroy();
  }
}
