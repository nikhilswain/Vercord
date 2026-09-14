import * as Phaser from 'phaser';
import type { Point } from '../../world/engine/types';
import type { ScenarioSession, StoryCondition } from '../../../domain/adventure/scenario';

export interface ScenarioSprite extends Point {
  id: string;
  label?: string;
  width: number;
  height: number;
  originY?: number;
  depth?: number;
  states: Array<
    StoryCondition & {
      texture: string;
      frames?: readonly number[];
      duration?: number;
      loop?: boolean;
      since?: string;
      beforeAge?: number;
      hideAfter?: number;
      destination?: Point;
    }
  >;
}

/** One fixed set of sprites. Only native frames/visibility change as story facts change. */
export class ScenarioRenderer {
  private readonly views: Array<{
    image: Phaser.GameObjects.Image;
    label?: Phaser.GameObjects.Text;
  }>;
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly model: ScenarioSession,
    private readonly sprites: readonly ScenarioSprite[],
  ) {
    this.views = sprites.map((sprite) => ({
      image: scene.add
        .image(sprite.x, sprite.y, sprite.states[0]!.texture)
        .setOrigin(0.5, sprite.originY ?? 1)
        .setDisplaySize(sprite.width, sprite.height),
      label: sprite.label
        ? scene.add
            .text(sprite.x, sprite.y - sprite.height, sprite.label, {
              fontFamily: 'Inter Variable, sans-serif',
              fontSize: '11px',
              color: '#fff5da',
              backgroundColor: '#253328',
              padding: { x: 5, y: 3 },
            })
            .setOrigin(0.5, 1)
            .setDepth(50002)
            .setVisible(false)
        : undefined,
    }));
  }
  update(player: Point, reducedMotion: boolean): void {
    const camera = this.scene.cameras.main;
    this.sprites.forEach((definition, index) => {
      const view = this.views[index]!;
      const state = definition.states.find(
        (candidate) =>
          this.model.matches(candidate) &&
          (candidate.beforeAge === undefined ||
            !candidate.since ||
            this.model.age(candidate.since) < candidate.beforeAge),
      );
      const age = state?.since ? this.model.age(state.since) : this.model.time;
      const shown = Boolean(state) && (state!.hideAfter === undefined || age < state!.hideAfter);
      view.image.setVisible(shown);
      view.label?.setVisible(false);
      if (!shown || !state) return;
      const duration = state.duration ?? 1;
      const clock = Number.isFinite(age) ? age : this.model.time;
      const progress =
        state.loop === false ? Math.min(1, age / duration) : (clock % duration) / duration;
      const frames = state.frames ?? [0];
      const frame =
        frames[
          reducedMotion && state.loop !== false
            ? 0
            : Math.min(frames.length - 1, Math.floor(progress * frames.length))
        ]!;
      if (
        view.image.texture.key !== state.texture ||
        String(view.image.frame.name) !== String(frame)
      )
        view.image
          .setTexture(state.texture, frame)
          .setDisplaySize(definition.width, definition.height);
      const movement = reducedMotion ? 1 : Math.min(1, age / duration);
      const x = state.destination
        ? definition.x + (state.destination.x - definition.x) * movement
        : definition.x;
      const y = state.destination
        ? definition.y + (state.destination.y - definition.y) * movement
        : definition.y;
      view.image.setPosition(x, y).setDepth(definition.depth ?? y);
      if (view.label && Math.hypot(x - player.x, y - player.y) < 100 && camera.zoom >= 0.7)
        view.label
          .setPosition(x, y - definition.height + 4)
          .setScale(1 / camera.zoom)
          .setVisible(true);
    });
  }
  destroy(): void {
    this.views.forEach(({ image, label }) => {
      image.destroy();
      label?.destroy();
    });
  }
}
