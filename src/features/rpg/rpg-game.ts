import * as Phaser from 'phaser';
import { RpgScene } from './rpg-scene';
import type { RpgCallbacks, RpgRuntime, RpgThemeId } from './types';

/** React-facing lifecycle adapter. Game state and drawing live in separate modules. */
export class RpgGame implements RpgRuntime {
  private game: Phaser.Game | null = null;
  private scene: RpgScene | null = null;
  private width = 1;
  private height = 1;
  private appearance = 'rowan';
  private blocked = false;
  private destroyed = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private theme: RpgThemeId,
    private readonly callbacks: RpgCallbacks,
  ) {}

  public start(): void {
    if (this.game || this.destroyed) return;
    try {
      this.scene = new RpgScene(this.theme, this.callbacks);
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
  public setTheme(theme: RpgThemeId): void {
    this.theme = theme;
    this.scene?.setTheme(theme);
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

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene?.dispose();
    this.game?.destroy(false);
    this.game = null;
    this.scene = null;
  }
}
