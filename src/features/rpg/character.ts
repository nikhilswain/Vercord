import type Phaser from 'phaser';
import type { RpgAction, RpgDirection } from './types';
import {
  preloadRpgMeleeWeapons,
  RPG_MELEE_ANIMATION,
  RPG_MELEE_WEAPON_STYLE,
  type RpgMeleePose,
} from './melee-assets';
import {
  getRpgWeaponVisual,
  RPG_WEAPON_HAND_POSES,
  type RpgWeaponVisual,
  type RpgWeaponHandPose,
} from './weapon-visuals';
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
type CharacterPose = RpgAction | 'cast' | 'slash' | 'thrust';
export interface CharacterPresentation {
  consume?: { food: boolean; elapsedMs: number; durationMs: number } | null;
  defeatMs?: number | null;
  hurtMs?: number;
}
const ACTIONS: CharacterPose[] = ['idle', 'walk', 'run', 'cast', 'slash', 'thrust'];
/** Seven authored LPC spellcast poses; release begins at the extended-arm frame. */
export const RPG_CAST_DURATION_MS = 700;
export const RPG_CAST_RELEASE_MS = 400;
const DIRECTION_ROW: Record<RpgDirection, number> = { up: 0, left: 1, down: 2, right: 3 };
const ANIMATION: Record<CharacterPose, { frames: number; frameMs: number }> = {
  idle: { frames: 3, frameMs: 420 },
  walk: { frames: 8, frameMs: 110 },
  run: { frames: 8, frameMs: 75 },
  cast: { frames: 7, frameMs: 100 },
  slash: RPG_MELEE_ANIMATION.slash,
  thrust: RPG_MELEE_ANIMATION.thrust,
};

export const RPG_APPEARANCES = RPG_CHARACTER_DEFINITIONS;

function appearanceOrDefault(id: string): string {
  return getRpgCharacter(id).id;
}

function textureKey(appearance: string, layer: RpgCharacterLayer, action: CharacterPose): string {
  return `rpg-character-${getRpgCharacter(appearance).layers[layer].source}-${layer}-${action}`;
}

export function preloadRpgCharacters(scene: Phaser.Scene, includeCasting = false): void {
  if (includeCasting) preloadRpgMeleeWeapons(scene);
  const queued = new Set<string>();
  for (const { id } of RPG_APPEARANCES) {
    for (const layer of LAYERS) {
      for (const action of ACTIONS) {
        if ((action === 'cast' || action === 'slash' || action === 'thrust') && !includeCasting)
          continue;
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
  private readonly rig: Phaser.GameObjects.Container;
  private readonly weaponBehind: Phaser.GameObjects.Image;
  private readonly weaponFront: Phaser.GameObjects.Image;
  private readonly handOverlays: Phaser.GameObjects.Image[];
  private weaponVisual: RpgWeaponVisual | null = null;
  private weaponPose: RpgWeaponHandPose | null = null;
  private weaponAppearance: string | null = null;
  private weaponBodyFrame = -1;
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
    // Exact equipped item images use their measured handle pivot, never the body center.
    this.weaponBehind = scene.add
      .image(0, 0, textureKey(this.appearance, 'body', 'idle'), 0)
      .setVisible(false);
    this.weaponFront = scene.add
      .image(0, 0, textureKey(this.appearance, 'body', 'idle'), 0)
      .setVisible(false);
    this.handOverlays = Array.from({ length: 2 }, () =>
      scene.add
        .image(0, 0, textureKey(this.appearance, 'body', 'idle'), 0)
        .setOrigin(0.5, FEET_Y / FRAME_SIZE)
        .setVisible(false),
    );
    this.rig = scene.add.container(0, 0, [
      this.weaponBehind,
      ...this.layers,
      this.weaponFront,
      ...this.handOverlays,
    ]);
    this.container.add([shadow, this.rig]);
    this.update(x, y, 'down', 'idle', 0, false);
  }

  setAppearance(id: string): void {
    const appearance = appearanceOrDefault(id);
    if (appearance === this.appearance) return;
    this.appearance = appearance;
    this.applyTextures();
  }

  /** Cast/melee are local pose state and never extend the live presence action contract. */
  update(
    x: number,
    y: number,
    direction: RpgDirection,
    action: RpgAction,
    time: number,
    reducedMotion: boolean,
    castElapsedMs?: number | null,
    meleePose?: RpgMeleePose | null,
    presentation: CharacterPresentation = {},
  ): void {
    this.container.setPosition(x, y).setDepth(y);
    const defeat = presentation.defeatMs;
    const fallen = defeat !== undefined && defeat !== null;
    const consume = fallen ? null : presentation.consume;
    // Presentation transforms never change the collision footprint or network position.
    const fall = fallen ? Math.min(1, Math.max(0, (defeat - 180) / 560)) : 0;
    const eased = reducedMotion ? (fall > 0 ? 1 : 0) : fall * fall * (3 - 2 * fall);
    const hurt = Math.max(0, 1 - (presentation.hurtMs ?? Infinity) / 180);
    this.rig
      .setPosition(fallen ? eased * 8 : reducedMotion ? 0 : -hurt * 2, fallen ? -eased * 5 : 0)
      .setRotation(fallen ? (-eased * Math.PI) / 2 : 0)
      .setAlpha(fallen ? Math.max(0, 1 - Math.max(0, defeat - 1600) / 1000) : 1);
    if (fallen || consume) direction = 'down';
    const casting =
      castElapsedMs !== undefined &&
      castElapsedMs !== null &&
      Number.isFinite(castElapsedMs) &&
      castElapsedMs >= 0 &&
      castElapsedMs < RPG_CAST_DURATION_MS;
    const melee =
      !fallen &&
      !consume &&
      meleePose &&
      meleePose.style === RPG_MELEE_WEAPON_STYLE[meleePose.weapon] &&
      Number.isFinite(meleePose.elapsedMs) &&
      meleePose.elapsedMs >= 0 &&
      meleePose.elapsedMs < RPG_MELEE_ANIMATION[meleePose.style].durationMs
        ? meleePose
        : undefined;
    const pose: CharacterPose =
      fallen || consume ? 'cast' : melee ? melee.style : casting ? 'cast' : action;
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
    const column = fallen
      ? defeat < 180
        ? 2
        : 0
      : consume
        ? consume.food
          ? reducedMotion
            ? 2
            : Math.sin(consume.elapsedMs / 110) > 0
              ? 2
              : 1
          : consume.elapsedMs / consume.durationMs > 0.4
            ? 4
            : 2
        : melee
          ? Math.min(animation.frames - 1, Math.floor(melee.elapsedMs / animation.frameMs))
          : casting
            ? Math.min(animation.frames - 1, Math.floor(castElapsedMs / animation.frameMs))
            : reducedMotion && pose === 'idle'
              ? 0
              : Math.floor(Math.max(0, time - this.startedAt) / animation.frameMs) %
                animation.frames;
    const frame = DIRECTION_ROW[direction] * animation.frames + column;
    this.updateWeapon(melee, direction, column, frame);
    if (frame === this.frame) return;
    this.frame = frame;
    for (const layer of this.layers) layer.setFrame(frame);
  }

  private updateWeapon(
    melee: RpgMeleePose | undefined,
    direction: RpgDirection,
    column: number,
    frame: number,
  ): void {
    if (melee) {
      const visual = getRpgWeaponVisual(melee.weapon, melee.tier);
      const grip = RPG_WEAPON_HAND_POSES[melee.style][direction][column]!;
      if (
        visual === this.weaponVisual &&
        grip === this.weaponPose &&
        frame === this.weaponBodyFrame &&
        this.appearance === this.weaponAppearance
      )
        return;
      this.weaponBehind.setVisible(grip.behind);
      this.weaponFront.setVisible(!grip.behind);
      const weapon = grip.behind ? this.weaponBehind : this.weaponFront;
      const sourceAngle = Math.atan2(
        visual.tip[1] - visual.grip[1],
        visual.tip[0] - visual.grip[0],
      );
      if (weapon.texture.key !== visual.texture)
        weapon
          .setTexture(visual.texture)
          .clearTint()
          .setOrigin(visual.grip[0] / 128, visual.grip[1] / 128)
          .setScale(visual.scale);
      weapon
        .setPosition(grip.x - FRAME_SIZE / 2, grip.y - FEET_Y)
        .setRotation((grip.angle * Math.PI) / 180 - sourceAngle);
      if (
        grip !== this.weaponPose ||
        frame !== this.weaponBodyFrame ||
        this.appearance !== this.weaponAppearance
      ) {
        const skin = getRpgCharacter(this.appearance).layers.body.tint;
        for (let index = 0; index < this.handOverlays.length; index++) {
          const fingers = this.handOverlays[index]!;
          const shown = !grip.behind && grip.fingers && (index === 0 || Boolean(grip.secondHand));
          fingers.setVisible(shown);
          if (!shown) continue;
          const x = index === 0 ? grip.x : grip.secondHand![0];
          const y = index === 0 ? grip.y : grip.secondHand![1];
          fingers
            .setTexture(textureKey(this.appearance, 'body', melee.style), frame)
            .setCrop(Math.round(x - 2), Math.round(y - 2), 4, 4);
          if (skin === undefined) fingers.clearTint();
          else fingers.setTint(skin);
        }
      }
      this.weaponVisual = visual;
      this.weaponPose = grip;
      this.weaponBodyFrame = frame;
      this.weaponAppearance = this.appearance;
    } else if (this.weaponVisual) {
      this.weaponBehind.setVisible(false);
      this.weaponFront.setVisible(false);
      for (const hand of this.handOverlays) hand.setVisible(false);
      this.weaponVisual = null;
      this.weaponPose = null;
      this.weaponBodyFrame = -1;
      this.weaponAppearance = null;
    }
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
