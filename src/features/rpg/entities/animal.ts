import type Phaser from 'phaser';
import type { RpgAction, RpgDirection } from '../types';

const FRAME_SIZE = 32;
const COLUMNS = 16;
const DIRECTION_ROW: Record<RpgDirection, number> = { right: 0, up: 1, down: 2, left: 3 };
const WALK_COLUMNS = [0, 1, 2, 1] as const;
const COATS = {
  cat: [0xe5e2d6, 0xd6a044, 0x974e2a, 0x494651],
  dog: [0xe5e2d6, 0xac7d50, 0xd6aa52, 0x494651],
} as const;

export function preloadRpgAnimals(scene: Phaser.Scene): void {
  for (const kind of ['cat', 'dog']) {
    const key = `rpg-animal-${kind}`;
    if (!scene.textures.exists(key))
      scene.load.spritesheet(key, `/game-assets/lpc-animals/${kind}.png`, {
        frameWidth: FRAME_SIZE,
        frameHeight: FRAME_SIZE,
      });
  }
}

function closestCoat(kind: 'cat' | 'dog', color: number): number {
  const distance = (candidate: number) =>
    [16, 8, 0].reduce(
      (sum, shift) => sum + (((candidate >> shift) & 255) - ((color >> shift) & 255)) ** 2,
      0,
    );
  return COATS[kind].reduce(
    (best, candidate, index) => (distance(candidate) < distance(COATS[kind][best]!) ? index : best),
    0,
  );
}

/** Authored LPC cats/dogs by bluecarrot16; originals and attribution live beside the atlases. */
export class RpgAnimal {
  readonly container: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly coatColumn: number;
  private frame = -1;

  constructor(scene: Phaser.Scene, kind: 'dog' | 'cat', coat: number) {
    this.container = scene.add.container();
    this.coatColumn = closestCoat(kind, coat) * 4;
    this.sprite = scene.add
      .image(0, 0, `rpg-animal-${kind}`, 2 * COLUMNS + this.coatColumn + 1)
      .setOrigin(0.5, (kind === 'dog' ? 31 : 29) / FRAME_SIZE);
    this.container.add([
      scene.add.ellipse(0, -1, kind === 'dog' ? 22 : 18, 6, 0x17221d, 0.2),
      this.sprite,
    ]);
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
    const column =
      action === 'idle' || reducedMotion
        ? 1
        : WALK_COLUMNS[Math.floor(time / (action === 'run' ? 105 : 155)) % WALK_COLUMNS.length]!;
    const frame = DIRECTION_ROW[direction] * COLUMNS + this.coatColumn + column;
    if (frame !== this.frame) {
      this.sprite.setFrame(frame);
      this.frame = frame;
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}
