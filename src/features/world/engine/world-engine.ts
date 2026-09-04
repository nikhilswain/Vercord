import * as Phaser from 'phaser';

import type { AvatarId } from '../../../domain/avatar/identity';
import type { PresencePlayer } from '../../../domain/presence/protocol';
import { PhaserWorldScene, type PhaserWorldCallbacks } from '../phaser/phaser-world-scene';
import type { WorldDefinition } from './types';

export class WorldEngine {
  private game: Phaser.Game | null = null;
  private scene: PhaserWorldScene | null = null;
  private viewport = { width: 1, height: 1 };
  private destroyed = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: WorldDefinition,
    private readonly callbacks: PhaserWorldCallbacks,
  ) {}

  public start(): void {
    if (this.game || this.destroyed) return;
    this.scene = new PhaserWorldScene(this.world, this.callbacks);
    this.game = new Phaser.Game({
      type: Phaser.WEBGL,
      title: 'Dmap',
      width: this.viewport.width,
      height: this.viewport.height,
      canvas: this.canvas,
      scene: this.scene,
      backgroundColor: '#2f594b',
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      antialiasGL: false,
      autoFocus: false,
      input: {
        activePointers: 3,
      },
      scale: {
        mode: Phaser.Scale.NONE,
        width: this.viewport.width,
        height: this.viewport.height,
      },
      audio: {
        noAudio: true,
      },
      banner: false,
    });
  }

  public resize(width: number, height: number): void {
    this.viewport = { width: Math.max(1, width), height: Math.max(1, height) };
    this.game?.scale.resize(this.viewport.width, this.viewport.height);
    this.scene?.resize(this.viewport.width, this.viewport.height);
  }

  public zoomIn(): void {
    this.scene?.zoomIn();
  }

  public zoomOut(): void {
    this.scene?.zoomOut();
  }

  public resetView(): void {
    this.scene?.resetView();
  }

  public setVirtualAxis(x: number, y: number, sprinting = false): void {
    this.scene?.setVirtualAxis(x, y, sprinting);
  }

  public interact(): void {
    this.scene?.interact();
  }

  public enterRoomByKey(roomKey: string): boolean {
    return this.scene?.enterRoomByKey(roomKey) ?? false;
  }

  public setRemotePlayers(players: readonly PresencePlayer[]): void {
    this.scene?.setRemotePlayers(players);
  }

  public setPlayerAvatar(avatarId: AvatarId): void {
    this.scene?.setPlayerAvatar(avatarId);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.game?.destroy(false);
    this.game = null;
    this.scene = null;
  }
}
