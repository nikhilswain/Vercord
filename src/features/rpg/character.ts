import type Phaser from 'phaser';
import type { RpgAction, RpgDirection } from './types';
import {
  getRpgCharacter,
  RPG_CHARACTER_ASSET_ROOT,
  RPG_CHARACTER_DEFINITIONS,
  RPG_CHARACTER_LAYERS,
  type RpgCharacterLayer,
} from '../../domain/world/catalog/characters';

const FRAME_SIZE = 64;
const FEET_Y = 62;
const LAYERS = RPG_CHARACTER_LAYERS;
type CharacterPose = RpgAction | 'cast';
const ACTIONS: CharacterPose[] = ['idle', 'walk', 'run', 'cast'];
/** Seven authored LPC spellcast poses; release begins at the extended-arm frame. */
export const RPG_CAST_DURATION_MS = 700;
export const RPG_CAST_RELEASE_MS = 400;
const DIRECTION_ROW: Record<RpgDirection, number> = { up: 0, left: 1, down: 2, right: 3 };
const ANIMATION: Record<CharacterPose, { frames: number; frameMs: number }> = {
  idle: { frames: 3, frameMs: 420 },
  walk: { frames: 8, frameMs: 110 },
  run: { frames: 8, frameMs: 75 },
  cast: { frames: 7, frameMs: 100 },
};

export const RPG_APPEARANCES = RPG_CHARACTER_DEFINITIONS;

function appearanceOrDefault(id: string): string {
  return getRpgCharacter(id).id;
}

function textureKey(appearance: string, layer: RpgCharacterLayer, action: CharacterPose): string {
  return `rpg-character-${getRpgCharacter(appearance).layers[layer].source}-${layer}-${action}`;
}

export function preloadRpgCharacters(scene: Phaser.Scene, includeCasting = false): void {
  const queued = new Set<string>();
  for (const { id } of RPG_APPEARANCES) {
    for (const layer of LAYERS) {
      for (const action of ACTIONS) {
        if (action === 'cast' && !includeCasting) continue;
        const key = textureKey(id, layer, action);
        if (scene.textures.exists(key) || queued.has(key)) continue;
        queued.add(key);
        const source = getRpgCharacter(id).layers[layer].source;
        scene.load.spritesheet(
          key,
          `${RPG_CHARACTER_ASSET_ROOT}/${source}/${layer}-${action}.png`,
          {
            frameWidth: FRAME_SIZE,
            frameHeight: FRAME_SIZE,
          },
        );
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
  private action: CharacterPose = 'idle';
  private startedAt = 0;
  private frame = -1;

  constructor(scene: Phaser.Scene, appearanceId: string, x: number, y: number) {
    this.appearance = appearanceOrDefault(appearanceId);
    this.container = scene.add.container(x, y);
    const shadow = scene.add.ellipse(0, -1, 24, 9, 0x182128, 0.22);
    this.layers = LAYERS.map((layer) => {
      const sprite = scene.add
        .image(0, 0, textureKey(this.appearance, layer, 'idle'), 6)
        .setOrigin(0.5, FEET_Y / FRAME_SIZE);
      const tint = getRpgCharacter(this.appearance).layers[layer].tint;
      if (tint !== undefined) sprite.setTint(tint);
      return sprite;
    });
    this.container.add([shadow, ...this.layers]);
    this.update(x, y, 'down', 'idle', 0, false);
  }

  setAppearance(id: string): void {
    const appearance = appearanceOrDefault(id);
    if (appearance === this.appearance) return;
    this.appearance = appearance;
    this.applyTextures();
  }

  /** castElapsedMs is local pose state; it never extends the live presence action contract. */
  update(
    x: number,
    y: number,
    direction: RpgDirection,
    action: RpgAction,
    time: number,
    reducedMotion: boolean,
    castElapsedMs?: number | null,
  ): void {
    this.container.setPosition(x, y).setDepth(y);
    const casting =
      castElapsedMs !== undefined &&
      castElapsedMs !== null &&
      Number.isFinite(castElapsedMs) &&
      castElapsedMs >= 0 &&
      castElapsedMs < RPG_CAST_DURATION_MS;
    const pose: CharacterPose = casting ? 'cast' : action;
    if (pose !== this.action || direction !== this.direction) {
      const changedAction = pose !== this.action;
      this.direction = direction;
      this.action = pose;
      this.startedAt = time;
      this.frame = -1;
      if (changedAction) this.applyTextures();
    }

    const animation = ANIMATION[pose];
    // Idle breathing is decorative; retain movement feedback with reduced motion.
    const column = casting
      ? Math.min(animation.frames - 1, Math.floor(castElapsedMs / animation.frameMs))
      : reducedMotion && pose === 'idle'
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
      const sprite = this.layers[index];
      if (!sprite) return;
      sprite.setTexture(textureKey(this.appearance, name, this.action), frame);
      const tint = getRpgCharacter(this.appearance).layers[name].tint;
      if (tint === undefined) sprite.clearTint();
      else sprite.setTint(tint);
    });
  }
}
