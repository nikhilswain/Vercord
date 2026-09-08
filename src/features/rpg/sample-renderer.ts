import * as Phaser from 'phaser';
import { RPG_SAMPLES } from './sample-worlds';
import type { RpgSample, RpgStamp } from './types';

export function preloadRpgWorlds(scene: Phaser.Scene): void {
  const queued = new Set<string>();
  for (const sample of Object.values(RPG_SAMPLES)) {
    for (const texture of sample.textures) {
      if (queued.has(texture.key) || scene.textures.exists(texture.key)) continue;
      queued.add(texture.key);
      if (texture.frameWidth && texture.frameHeight) {
        scene.load.spritesheet(texture.key, texture.url, {
          frameWidth: texture.frameWidth,
          frameHeight: texture.frameHeight,
        });
      } else scene.load.image(texture.key, texture.url);
    }
  }
}

export function registerRpgFrames(scene: Phaser.Scene): void {
  for (const sample of Object.values(RPG_SAMPLES)) {
    for (const asset of sample.textures) {
      const texture = scene.textures.get(asset.key);
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      for (const [name, frame] of Object.entries(asset.frames ?? {})) {
        if (!texture.has(name)) texture.add(name, 0, frame.x, frame.y, frame.width, frame.height);
      }
    }
  }
}

/** Owns only world presentation. Ground is baked once; tall objects retain feet-based depth. */
export class RpgSampleRenderer {
  private readonly owned: Phaser.GameObjects.GameObject[] = [];
  private readonly flameLights: Phaser.GameObjects.Image[] = [];

  public constructor(
    private readonly scene: Phaser.Scene,
    sample: RpgSample,
  ) {
    const { bounds } = sample;
    scene.cameras.main.setBackgroundColor(sample.background);
    const ground = scene.add
      .renderTexture(bounds.x, bounds.y, bounds.width, bounds.height)
      .setOrigin(0)
      .setDepth(-10000);
    this.owned.push(ground);
    const groundParts = sample.stamps
      .filter((stamp) => (stamp.depth ?? stamp.y) < 0)
      .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))
      .map((stamp) => {
        const part = this.makeStamp(stamp, false);
        return part.setPosition(part.x - bounds.x, part.y - bounds.y);
      });
    // Phaser 4 reallocates dynamic texture storage when changing its filter.
    // Configure it before baking, then flush before releasing temporary objects.
    ground.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    ground.draw(groundParts).render();
    groundParts.forEach((part) => part.destroy());
    for (const stamp of sample.stamps) {
      if ((stamp.depth ?? stamp.y) < 0) continue;
      const object = this.makeStamp(stamp, true);
      this.owned.push(object);
    }
    if (sample.id === 'dungeon') {
      const shade = scene.add
        .rectangle(bounds.x, bounds.y, bounds.width, bounds.height, 0x07111c, 0.2)
        .setOrigin(0)
        .setDepth(90000);
      this.owned.push(shade);
    }
    this.addLighting(sample);
  }

  public update(time: number, reducedMotion: boolean): void {
    // Only a handful of torch lights animate; the environment never rebuilds during movement.
    this.flameLights.forEach((light, index) => {
      light.setAlpha(reducedMotion ? 0.35 : 0.32 + Math.sin(time * 0.003 + index * 2.3) * 0.025);
    });
  }

  public destroy(): void {
    this.owned.forEach((object) => object.destroy());
    this.owned.length = 0;
    this.flameLights.length = 0;
  }

  private makeStamp(stamp: RpgStamp, display: boolean): Phaser.GameObjects.Image {
    const image = new Phaser.GameObjects.Image(
      this.scene,
      stamp.x,
      stamp.y,
      stamp.texture,
      stamp.frame,
    );
    image.setOrigin(stamp.originX ?? 0, stamp.originY ?? 0);
    if (stamp.width !== undefined || stamp.height !== undefined) {
      image.setDisplaySize(stamp.width ?? image.width, stamp.height ?? image.height);
    }
    image.setDepth(stamp.depth ?? stamp.y + image.displayHeight);
    if (stamp.alpha !== undefined) image.setAlpha(stamp.alpha);
    if (stamp.tint !== undefined) image.setTint(stamp.tint);
    if (display) this.scene.add.existing(image);
    return image;
  }

  private addLighting(sample: RpgSample): void {
    const key = 'rpg-warm-light';
    if (!this.scene.textures.exists(key)) {
      const texture = this.scene.textures.createCanvas(key, 128, 128);
      if (texture) {
        const context = texture.context;
        const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(255,224,160,0.8)');
        gradient.addColorStop(0.35, 'rgba(255,183,91,0.35)');
        gradient.addColorStop(1, 'rgba(255,143,50,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        texture.refresh();
      }
    }
    for (const light of sample.lights) {
      const glow = this.scene.add
        .image(light.x, light.y, key)
        .setDisplaySize(light.radius * 2, light.radius * 2)
        .setTint(light.color)
        .setDepth(90001)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.35);
      this.owned.push(glow);
      this.flameLights.push(glow);
    }
  }
}
