import * as Phaser from 'phaser';
import { RpgScene } from './rpg-scene';
import type { Point } from '../world/engine/types';
import type { RpgCallbacks, RpgRuntime, RpgSample } from './types';

/** React-facing lifecycle adapter. Game state and drawing live in separate modules. */
export class RpgGame implements RpgRuntime {
  private game: Phaser.Game | null = null;
  private scene: RpgScene | null = null;
  private width = 1;
  private height = 1;
  private appearance = 'rowan';
  private blocked = false;
  private destroyed = false;
  private teardown: Promise<void> | null = null;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private sample: RpgSample,
    private readonly callbacks: RpgCallbacks,
    private readonly samples: readonly RpgSample[],
    private sceneKey: string,
    private readonly positions: Map<string, Point>,
  ) {}

  public start(): void {
    if (this.game || this.destroyed) return;
    try {
      this.scene = new RpgScene(
        this.sample,
        this.callbacks,
        this.samples,
        this.sceneKey,
        this.positions,
      );
      this.scene.resize(this.width, this.height);
      this.scene.setAppearance(this.appearance);
      this.scene.setInputBlocked(this.blocked);
      this.game = new Phaser.Game({
        type: Phaser.WEBGL,
        title: 'Dmap RPG',
        canvas: this.canvas,
        width: this.width,
        height: this.height,
        scene: this.scene,
        pixelArt: true,
        roundPixels: true,
        antialias: false,
        antialiasGL: false,
        autoFocus: false,
        input: { activePointers: 3 },
        scale: { mode: Phaser.Scale.NONE },
        audio: { noAudio: true },
        fps: { target: 60, limit: 60 },
        banner: false,
      });
    } catch {
      this.callbacks.onError();
    }
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.game?.scale.resize(this.width, this.height);
    this.scene?.resize(this.width, this.height);
  }
  public setScene(sample: RpgSample, sceneKey: string): void {
    this.sample = sample;
    this.sceneKey = sceneKey;
    this.scene?.setScene(sample, sceneKey);
  }
  public setAppearance(id: string): void {
    this.appearance = id;
    this.scene?.setAppearance(id);
  }
  public setInputBlocked(blocked: boolean): void {
    this.blocked = blocked;
    this.scene?.setInputBlocked(blocked);
  }
  public setVirtualAxis(x: number, y: number, sprinting = false): void {
    this.scene?.setVirtualAxis(x, y, sprinting);
  }
  public interact(): void {
    this.scene?.interact();
  }
  public zoomBy(factor: number): void {
    this.scene?.zoomBy(factor);
  }
  public center(): void {
    this.scene?.center();
  }
  public focus(point: Point): void {
    this.scene?.focus(point);
  }
  public overview(): void {
    this.scene?.overview();
  }

  public destroy(): Promise<void> {
    if (this.teardown) return this.teardown;
    this.destroyed = true;
    this.scene?.dispose();
    const game = this.game;
    this.teardown = game
      ? new Promise<void>((resolve) => {
          // Phaser releases graphics after the current frame; the next runtime waits for this event.
          game.events.once(Phaser.Core.Events.DESTROY, resolve);
          game.destroy(false);
        })
      : Promise.resolve();
    this.game = null;
    this.scene = null;
    return this.teardown;
  }
}
