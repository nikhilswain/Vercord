import type Phaser from 'phaser';
import type { RpgAction, RpgDirection } from './types';

const ASSET_ROOT = '/game-assets/lpc-characters';
const FRAME_SIZE = 64;
const FEET_Y = 62;
const LAYERS = ['body', 'head', 'pants', 'shirt', 'boots', 'hair'] as const;
const ACTIONS: RpgAction[] = ['idle', 'walk', 'run'];
const DIRECTION_ROW: Record<RpgDirection, number> = { up: 0, left: 1, down: 2, right: 3 };
const ANIMATION: Record<RpgAction, { frames: number; frameMs: number }> = {
  idle: { frames: 3, frameMs: 420 },
  walk: { frames: 8, frameMs: 110 },
  run: { frames: 8, frameMs: 75 },
};

export const RPG_APPEARANCES = [
  { id: 'rowan', name: 'Rowan', portraitUrl: `${ASSET_ROOT}/rowan/portrait.png` },
  { id: 'ash', name: 'Ash', portraitUrl: `${ASSET_ROOT}/ash/portrait.png` },
];

function appearanceOrDefault(id: string): string {
  return RPG_APPEARANCES.some((appearance) => appearance.id === id) ? id : 'rowan';
}

function textureKey(appearance: string, layer: string, action: RpgAction): string {
  return `rpg-character-${appearance}-${layer}-${action}`;
}

export function preloadRpgCharacters(scene: Phaser.Scene): void {
  for (const { id } of RPG_APPEARANCES) {
    for (const layer of LAYERS) {
      for (const action of ACTIONS) {
        const key = textureKey(id, layer, action);
        if (scene.textures.exists(key)) continue;
        scene.load.spritesheet(key, `${ASSET_ROOT}/${id}/${layer}-${action}.png`, {
          frameWidth: FRAME_SIZE,
          frameHeight: FRAME_SIZE,
        });
      }
    }
  }
}

/** One shared LPC rig for player appearances and separately owned NPC entities. */
export class RpgCharacter {
  readonly container: Phaser.GameObjects.Container;
  private readonly layers: Phaser.GameObjects.Image[];
  private appearance: string;
  private direction: RpgDirection = 'down';
  private action: RpgAction = 'idle';
  private startedAt = 0;
  private frame = -1;

  constructor(scene: Phaser.Scene, appearanceId: string, x: number, y: number) {
    this.appearance = appearanceOrDefault(appearanceId);
    this.container = scene.add.container(x, y);
    const shadow = scene.add.ellipse(0, -1, 24, 9, 0x182128, 0.22);
    this.layers = LAYERS.map((layer) =>
      scene.add
        .image(0, 0, textureKey(this.appearance, layer, 'idle'), 6)
        .setOrigin(0.5, FEET_Y / FRAME_SIZE),
    );
    this.container.add([shadow, ...this.layers]);
    this.update(x, y, 'down', 'idle', 0, false);
  }

  setAppearance(id: string): void {
    const appearance = appearanceOrDefault(id);
    if (appearance === this.appearance) return;
    this.appearance = appearance;
    this.applyTextures();
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
    if (action !== this.action || direction !== this.direction) {
      const changedAction = action !== this.action;
      this.direction = direction;
      this.action = action;
      this.startedAt = time;
      this.frame = -1;
      if (changedAction) this.applyTextures();
    }

    const animation = ANIMATION[action];
    // Idle breathing is decorative; retain movement feedback with reduced motion.
    const column =
      reducedMotion && action === 'idle'
        ? 0
        : Math.floor(Math.max(0, time - this.startedAt) / animation.frameMs) % animation.frames;
    const frame = DIRECTION_ROW[direction] * animation.frames + column;
    if (frame === this.frame) return;
    this.frame = frame;
    for (const layer of this.layers) layer.setFrame(frame);
  }

  destroy(): void {
    // Textures belong to the game cache; other player/NPC rigs can still use them.
    this.container.destroy();
  }

  private applyTextures(): void {
    const firstFrame = DIRECTION_ROW[this.direction] * ANIMATION[this.action].frames;
    const frame = this.frame < 0 ? firstFrame : this.frame;
    LAYERS.forEach((name, index) => {
      this.layers[index]?.setTexture(textureKey(this.appearance, name, this.action), frame);
    });
  }
}
