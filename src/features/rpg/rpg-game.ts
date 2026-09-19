import type { ProvisionsSnapshot } from '../../domain/adventure/provisions';
import * as Phaser from 'phaser';
import { RpgScene } from './rpg-scene';
import { DEFAULT_RPG_CHARACTER_ID } from '../../domain/world/catalog/characters';
import type { Point } from '../world/engine/types';
import type { RpgPresencePlayer } from '../../domain/presence/rpg-protocol';
import type { RpgCallbacks, RpgRuntime, RpgSample, RpgPositionUpdate } from './types';
import type { SpellId } from './demo/types';
import type { AdventureJourney } from './adventure/journey';
import type { NavigationTarget, NavigationResult } from './navigation/types';
import type { JournalPreferences } from './journal/model';

/** React-facing lifecycle adapter. Game state and drawing live in separate modules. */
export class RpgGame implements RpgRuntime {
  private game: Phaser.Game | null = null;
  private scene: RpgScene | null = null;
  private width = 1;
  private height = 1;
  private appearance: string = DEFAULT_RPG_CHARACTER_ID;
  private players: readonly RpgPresencePlayer[] = [];
  private playerPosition: RpgPositionUpdate | null = null;
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
    private readonly journey?: AdventureJourney,
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
        this.journey,
      );
      this.scene.resize(this.width, this.height);
      this.scene.setAppearance(this.appearance);
      this.scene.setPlayers(this.players);
      if (this.playerPosition) this.scene.setPlayerPosition(this.playerPosition);
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
    if (sceneKey !== this.sceneKey) {
      this.players = [];
      this.playerPosition = null;
    }
    this.sample = sample;
    this.sceneKey = sceneKey;
    this.scene?.setScene(sample, sceneKey);
  }
  public setAppearance(id: string): void {
    this.appearance = id;
    this.scene?.setAppearance(id);
  }
  public setJournal(preferences: Partial<JournalPreferences>): void {
    this.scene?.setJournal(preferences);
  }
  public setPlayers(players: readonly RpgPresencePlayer[]): void {
    this.players = players;
    this.scene?.setPlayers(players);
  }
  public setPlayerPosition(location: RpgPositionUpdate): void {
    this.playerPosition = location;
    this.scene?.setPlayerPosition(location);
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
  public pickupLoot(): void {
    this.scene?.pickupLoot();
  }
  public attack(): void {
    this.scene?.attack();
  }
  public heal(): void {
    this.scene?.heal();
  }
  public selectSpell(spell: SpellId): void {
    this.scene?.selectSpell(spell);
  }
  public selectMelee(): void {
    this.scene?.selectMelee();
  }
  public equipWeapon(id: string): boolean {
    return this.scene?.equipWeapon(id) ?? false;
  }
  public useInventoryItem(id: string) {
    return this.scene?.useInventoryItem(id);
  }
  public craftInventoryItem(id: string, quantity?: number, requestId?: string) {
    return this.scene?.craftInventoryItem(id, quantity, requestId);
  }
  public guideToSupply(id: string): NavigationResult {
    return this.scene?.guideToSupply(id) ?? { ok: false, message: 'The world is still loading.' };
  }
  public closeSupplyCache(): void {
    this.scene?.closeSupplyCache();
  }
  public takeSupplyCache(id: string): string {
    return this.scene?.takeSupplyCache(id) ?? 'Cache unavailable.';
  }
  public closeStation(): void {
    this.scene?.closeStation();
  }
  public stationAction(action: string): string {
    return this.scene?.stationAction(action) ?? 'Station unavailable.';
  }
  public configureProvisions(
    settings: Partial<Pick<ProvisionsSnapshot, 'recovery' | 'quickBuff' | 'trackedRecipe'>>,
  ): void {
    this.scene?.configureProvisions(settings);
  }
  public returnToTown(): void {
    this.scene?.returnToTown();
  }
  public setEnemyLevel(level: number): void {
    this.scene?.setEnemyLevel(level);
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
  public guideTo(target: NavigationTarget): NavigationResult {
    return (
      this.scene?.guideTo(target) ?? {
        ok: false,
        message: 'The world is still loading. Try again in a moment.',
      }
    );
  }
  public stopNavigation(): void {
    this.scene?.stopNavigation();
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
    this.players = [];
    this.playerPosition = null;
    return this.teardown;
  }
}
