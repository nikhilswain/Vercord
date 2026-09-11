import type Phaser from 'phaser';
import { RpgCharacter } from '../character';
import type { RpgAction, RpgDirection } from '../types';
import {
  getTiagoDemoCharacter,
  TIAGO_DEMO_CHARACTERS,
  type TiagoDemoCharacter,
} from './tiago-assets';

export function preloadTiagoTravelers(scene: Phaser.Scene): void {
  for (const asset of TIAGO_DEMO_CHARACTERS) {
    if (!scene.textures.exists(asset.textureKey))
      scene.load.spritesheet(asset.textureKey, asset.atlasUrl, {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
      });
  }
}

class TiagoTraveler {
  readonly container: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Image;
  constructor(
    scene: Phaser.Scene,
    private readonly asset: TiagoDemoCharacter,
    x: number,
    y: number,
  ) {
    this.container = scene.add.container(x, y);
    this.sprite = scene.add
      .image(0, 0, asset.textureKey, asset.previewFrame)
      .setOrigin(asset.feet.x / asset.frameWidth, asset.feet.y / asset.frameHeight)
      .setScale(asset.scale);
    this.container.add([scene.add.ellipse(0, -1, 23, 9, 0x182128, 0.22), this.sprite]);
  }
  update(
    x: number,
    y: number,
    direction: RpgDirection,
    action: RpgAction,
    time: number,
    reducedMotion: boolean,
  ): void {
    this.container.setPosition(x, y).setDepth(y);
    const animation = this.asset.animations[action === 'idle' ? 'idle' : 'walk'];
    const frames = animation.frames[direction];
    const rate = action === 'run' ? animation.frameRate * 1.4 : animation.frameRate;
    const frame =
      reducedMotion && action === 'idle'
        ? frames[0]!
        : frames[Math.floor((time * rate) / 1000) % frames.length]!;
    if (this.sprite.frame.name !== String(frame)) this.sprite.setFrame(frame);
  }
  destroy(): void {
    this.container.destroy();
  }
}

/** Rig boundary: native frame sizes and proportions never leak into movement or combat. */
export class RpgTraveler {
  private rig: RpgCharacter | TiagoTraveler;
  private appearance: string;
  get container(): Phaser.GameObjects.Container {
    return this.rig.container;
  }
  constructor(
    private readonly scene: Phaser.Scene,
    appearance: string,
    x: number,
    y: number,
  ) {
    this.appearance = appearance;
    this.rig = this.create(appearance, x, y);
  }
  setAppearance(appearance: string): void {
    if (appearance === this.appearance) return;
    const { x, y } = this.container;
    this.rig.destroy();
    this.appearance = appearance;
    this.rig = this.create(appearance, x, y);
  }
  update(...args: Parameters<RpgCharacter['update']>): void {
    this.rig.update(...args);
  }
  destroy(): void {
    this.rig.destroy();
  }
  private create(appearance: string, x: number, y: number): RpgCharacter | TiagoTraveler {
    const asset = getTiagoDemoCharacter(appearance);
    return asset && this.scene.textures.exists(asset.textureKey)
      ? new TiagoTraveler(this.scene, asset, x, y)
      : new RpgCharacter(this.scene, appearance, x, y);
  }
}
