import * as Phaser from 'phaser';
import { WorldInput, worldInputBlocked } from '../world/engine/input';
import type { Point } from '../world/engine/types';
import type { RpgLocation, RpgPresencePlayer } from '../../domain/presence/rpg-protocol';
import { sampleSceneId, sceneDefinition, isHouseSceneId } from '../../domain/world/catalog/scenes';
import { DEFAULT_RPG_CHARACTER_ID } from '../../domain/world/catalog/characters';
import {
  preloadRpgCharacters,
  RpgCharacter,
  RPG_CAST_DURATION_MS,
  RPG_CAST_RELEASE_MS,
} from './character';
import type { SpellId } from './demo/types';
import { AdventureSession } from './adventure/session';
import { combatTargetAtPointer } from './adventure/aim';
import { DEMO_EQUIPMENT_POLICY } from '../../domain/adventure/equipment';
import { RPG_MELEE_ANIMATION, RPG_MELEE_WEAPON_STYLE } from './melee-assets';
import { AdventureSessionRenderer, preloadJungleCreatures } from './adventure/renderer';
import { preloadRpgWorlds, registerRpgFrames, RpgSampleRenderer } from './sample-renderer';
import { directionToward, RpgSimulation } from './simulation';
import { TownSignage } from './town-signage';
import { RpgRemoteCharacters } from './remote-characters';
import { RpgAmbientEntities } from './entities/renderer';
import { preloadRpgAnimals } from './entities/animal';
import type { RpgCallbacks, RpgSample, RpgUiState, RpgPositionUpdate } from './types';

export class RpgScene extends Phaser.Scene {
  private readonly simulation: RpgSimulation;
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private movement: WorldInput | null = null;
  private scenery: RpgSampleRenderer | null = null;
  private avatar: RpgCharacter | null = null;
  private adventureSession: AdventureSession | null = null;
  private adventureRenderer: AdventureSessionRenderer | null = null;
  private remotes: RpgRemoteCharacters | null = null;
  private ambient: RpgAmbientEntities | null = null;
  private players: readonly RpgPresencePlayer[] = [];
  private positionReady = false;
  private npcs: RpgCharacter[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private signage: TownSignage | null = null;
  private marker: Phaser.GameObjects.Graphics | null = null;
  private playerMarker: Phaser.GameObjects.Ellipse | null = null;
  private appearance: string = DEFAULT_RPG_CHARACTER_ID;
  private created = false;
  private failed = false;
  private disposed = false;
  private inputBlocked = false;
  private demoFocused = document.hasFocus();
  private width = 1;
  private height = 1;
  private lastUi = '';
  private lastUiTime = 0;
  private lastMove = '';
  private lastMoveTime = 0;
  private elapsed = 0;
  private previousFrameTime: number | null = null;
  private previousTap: { point: Point; time: number } | null = null;
  private following = true;
  private manualMovement = false;
  private lastWheelTime = -Infinity;
  private talkingTo: string | null = null;
  private feedback: { message: string; until: number } | null = null;
  private pointerDrag: { id: number; start: Point; last: Point; dragging: boolean } | null = null;

  public constructor(
    sample: RpgSample,
    private readonly callbacks: RpgCallbacks,
    private readonly samples: readonly RpgSample[],
    private sceneKey: string,
    positions: Map<string, Point>,
  ) {
    super({ key: 'rpg-sample' });
    this.simulation = new RpgSimulation(sample, sceneKey, positions);
  }

  public preload(): void {
    this.load.on('loaderror', this.onLoadError);
    preloadRpgWorlds(this, this.samples);
    preloadRpgCharacters(
      this,
      this.samples.some((sample) => sample.demo),
    );
    preloadRpgAnimals(this);
    if (this.samples.some((sample) => sample.demo)) {
      preloadJungleCreatures(this);
    }
  }

  public create(): void {
    if (this.disposed || this.failed) return;
    registerRpgFrames(this, this.samples);
    this.movement = new WorldInput();
    this.created = true;
    this.renderSample();
    this.game.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.game.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.game.canvas.addEventListener('auxclick', this.onContextMenu);
    this.game.canvas.addEventListener('pointermove', this.onPointerMove);
    this.game.canvas.addEventListener('pointerup', this.onPointerUp);
    this.game.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.game.canvas.addEventListener('lostpointercapture', this.onPointerCancel);
    this.game.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.game.canvas.addEventListener('webglcontextlost', this.onContextLost);
    window.addEventListener('keydown', this.onKeyDown);
    // Loading can outlast a window switch, before these listeners existed.
    this.demoFocused = document.hasFocus();
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.dispose, this);
    this.game.canvas.dataset.rpgReady = 'true';
    this.callbacks.onReady();
  }

  public update(time: number): void {
    if (!this.created || this.failed || this.disposed || document.hidden || !this.avatar) return;
    // The FPS limiter's delta includes its carried remainder, which may already have been
    // simulated. Use elapsed RAF timestamps so local travel cannot outrun the server clock.
    const dt =
      this.previousFrameTime === null
        ? 0
        : Math.min(50, Math.max(0, time - this.previousFrameTime));
    this.previousFrameTime = time;
    this.elapsed += dt;
    const adventure = this.activeAdventure();
    const blocked =
      this.inputBlocked || worldInputBlocked() || Boolean(adventure && !this.demoFocused);
    this.simulation.blocked = blocked || Boolean(adventure?.cast || adventure?.melee);
    const input = this.movement?.getMovement() ?? { x: 0, y: 0, moving: false, sprinting: false };
    // Only a new manual movement gesture resumes follow. An existing auto-run never does.
    if (
      !this.simulation.blocked &&
      input.moving &&
      !this.manualMovement &&
      !this.pointerDrag?.dragging
    )
      this.following = true;
    this.manualMovement = input.moving;
    this.simulation.tick(dt / 1000, input);
    if (adventure && !blocked && adventure.tick(dt / 1000, this.simulation.player)) {
      this.simulation.stop();
      this.simulation.player = { ...this.simulation.sample.spawn };
      this.center();
    }
    const { player, direction, action } = this.simulation;
    const melee = adventure?.melee;
    const meleeStyle = melee ? RPG_MELEE_WEAPON_STYLE[melee.weapon.family] : 'slash';
    this.avatar.update(
      player.x,
      player.y,
      direction,
      action,
      this.elapsed,
      this.motion.matches,
      adventure?.cast ? (adventure.time - adventure.cast.at) * 1000 : null,
      melee && adventure
        ? {
            elapsedMs:
              ((adventure.time - melee.at) * 1000 * RPG_MELEE_ANIMATION[meleeStyle].durationMs) /
              melee.weapon.animationMs,
            style: meleeStyle,
            weapon: melee.weapon.family,
            tier: melee.weapon.tier,
          }
        : null,
    );
    this.playerMarker?.setPosition(player.x, player.y - 1).setDepth(player.y - 0.1);
    this.avatar.container.setAlpha(
      adventure && adventure.time < adventure.invincibleUntil
        ? this.motion.matches
          ? 0.7
          : 0.65 + Math.sin(adventure.time * 22) * 0.25
        : 1,
    );
    this.adventureRenderer?.update(player, this.motion.matches);
    const nearby = this.simulation.nearby();
    this.simulation.sample.npcs.forEach((npc, index) => {
      this.npcs[index]?.update(
        npc.x,
        npc.y,
        nearby?.target.id === npc.id ? directionToward(npc, player) : npc.direction,
        'idle',
        this.elapsed,
        this.motion.matches,
      );
      this.labels[index]
        ?.setScale(1 / this.cameras.main.zoom)
        .setVisible(this.cameras.main.zoom >= 0.75 || nearby?.target.id === npc.id);
    });
    this.scenery?.update(this.elapsed, this.motion.matches);
    const camera = this.cameras.main;
    // Phaser applies zoom around the camera origin; scroll stays in unscaled world units.
    if (this.following) {
      const targetX = camera.clampX(player.x - camera.width / 2);
      const targetY = camera.clampY(player.y - 18 - camera.height / 2);
      const follow = this.motion.matches ? 1 : 1 - Math.exp((-10 * dt) / 1000);
      camera.setScroll(
        camera.scrollX + (targetX - camera.scrollX) * follow,
        camera.scrollY + (targetY - camera.scrollY) * follow,
      );
    }
    this.signage?.update(camera);
    this.remotes?.update(camera, this.elapsed, this.motion.matches);
    this.ambient?.update(camera, this.elapsed, this.motion.matches, player);
    this.publishMove();
    if (action !== 'idle') this.marker?.setVisible(false);
    if (this.elapsed - this.lastUiTime >= 100) this.publishUi();
  }

  public resize(width: number, height: number): void {
    const camera = this.created ? this.cameras.main : null;
    const center = camera
      ? { x: camera.scrollX + this.width / 2, y: camera.scrollY + this.height / 2 }
      : null;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (!camera || !center) return;
    this.cancelPointer();
    camera.setSize(this.width, this.height);
    this.setCameraZoom(
      Math.max(this.minimumZoom(), Math.min(this.width < 700 ? 3 : 4, camera.zoom)),
    );
    camera.centerOn(center.x, center.y);
    this.publishUi();
  }

  public setScene(sample: RpgSample, sceneKey: string): void {
    if (this.simulation.sample === sample && this.sceneKey === sceneKey) return;
    if (this.sceneKey !== sceneKey) {
      this.players = [];
      this.positionReady = false;
      this.lastMove = '';
      this.lastMoveTime = this.elapsed;
    }
    this.sceneKey = sceneKey;
    this.simulation.changeSample(sample, sceneKey);
    if (this.created && !this.failed && !this.disposed) {
      this.renderSample();
      this.callbacks.onReady();
    }
  }

  public setAppearance(id: string): void {
    this.appearance = id;
    this.avatar?.setAppearance(id);
  }

  public setPlayers(players: readonly RpgPresencePlayer[]): void {
    const scene = sampleSceneId(this.simulation.sample);
    this.players = players.filter((player) => player.scene === scene);
    this.remotes?.setPlayers(this.players, this.elapsed);
  }

  public setPlayerPosition(location: RpgPositionUpdate): void {
    if (!this.simulation.setPlayerPosition(location, location.resumeDestination)) return;
    this.positionReady = true;
    this.lastMove = JSON.stringify(this.location());
    this.lastMoveTime = this.elapsed;
    this.cancelPointer();
    this.previousTap = null;
    this.marker?.setVisible(false);
    this.avatar?.update(
      location.x,
      location.y,
      location.direction,
      'idle',
      this.elapsed,
      this.motion.matches,
    );
    if (this.created && this.following && !location.resumeDestination)
      this.cameras.main.centerOn(location.x, location.y - 18);
    this.publishUi();
  }

  public setInputBlocked(blocked: boolean): void {
    this.inputBlocked = blocked;
    this.simulation.blocked = blocked;
    if (!blocked && this.talkingTo) {
      this.ambient?.release(this.talkingTo);
      this.talkingTo = null;
    }
    if (blocked) {
      this.simulation.stop();
      this.cancelPointer();
      this.previousTap = null;
    }
  }

  public setVirtualAxis(x: number, y: number, sprinting = false): void {
    this.movement?.setVirtualAxis(x, y, sprinting);
  }

  public interact(): void {
    if (!this.created || this.failed || this.disposed || this.inputBlocked || worldInputBlocked())
      return;
    if (this.activeAdventure()?.gather(this.simulation.player)) {
      this.simulation.stop();
      this.publishUi();
      return;
    }
    const nearby = this.simulation.nearby() ?? this.ambient?.nearby(this.simulation.player);
    if (!nearby) return;
    this.simulation.stop();
    const target = nearby.target;
    const portal = this.simulation.sample.demo?.portal;
    if (portal?.id === target.id) {
      this.adventureSession?.rest();
      this.callbacks.onDemoTravel?.(portal.target);
      return;
    }
    const interaction = this.ambient?.interact(target.id, this.simulation.player);
    if (interaction === 'busy') return;
    if (interaction === 'pet') {
      this.simulation.direction = directionToward(this.simulation.player, target);
      this.feedback = { message: `You petted ${target.name}.`, until: Date.now() + 1400 };
      this.publishUi();
      return;
    }
    if (interaction === 'talk') this.talkingTo = target.id;
    if ('lines' in target) {
      this.callbacks.onDialogue({
        name: target.name,
        role: `${target.role} · NPC`,
        lines: target.lines,
        appearance: target.appearance,
      });
    } else if (target.id.startsWith('house:') && this.callbacks.onHouse)
      this.callbacks.onHouse(target.id);
    else if (target.id === 'town-square' && this.simulation.sample.townSquareNavigation)
      this.callbacks.onStreet?.('square');
    else if (target.destination) this.callbacks.onTravel(target.destination);
    else
      this.callbacks.onDialogue({
        name: target.name,
        role: this.simulation.sample.name,
        lines: [target.description],
      });
  }

  public zoomBy(factor: number): void {
    if (!this.created) return;
    const camera = this.cameras.main;
    const steps = [
      this.minimumZoom(),
      0.25,
      0.5,
      0.75,
      1,
      1.5,
      2,
      3,
      ...(this.width < 700 ? [] : [4]),
    ];
    const current = camera.zoom;
    const next =
      factor > 1
        ? steps.find((step) => step > current + 0.001)
        : [...steps].reverse().find((step) => step < current - 0.001);
    const center = { x: camera.scrollX + camera.width / 2, y: camera.scrollY + camera.height / 2 };
    this.cancelPointer();
    this.setCameraZoom(next ?? current);
    camera.centerOn(center.x, center.y);
    this.publishUi();
  }

  public attack(target?: Point): void {
    const adventure = this.activeAdventure();
    if (
      !this.created ||
      this.disposed ||
      this.inputBlocked ||
      !this.demoFocused ||
      worldInputBlocked() ||
      !adventure
    )
      return;
    const direction = adventure.attack(this.simulation.player, this.simulation.direction, target);
    if (direction) {
      this.simulation.stop();
      this.simulation.direction = direction;
      this.following = true;
      this.publishUi();
    }
  }

  public heal(): void {
    if (
      !this.created ||
      this.disposed ||
      this.inputBlocked ||
      !this.demoFocused ||
      worldInputBlocked()
    )
      return;
    this.activeAdventure()?.heal(this.simulation.player);
    this.publishUi();
  }

  public selectSpell(spell: SpellId): void {
    if (
      !this.created ||
      this.disposed ||
      this.inputBlocked ||
      !this.demoFocused ||
      worldInputBlocked()
    )
      return;
    this.activeAdventure()?.selectSpell(spell);
    this.publishUi();
  }

  private activeAdventure(): AdventureSession | null {
    return this.simulation.sample.demo?.area === 'jungle' ? this.adventureSession : null;
  }

  public selectMelee(): void {
    if (!this.created || this.disposed || this.inputBlocked || worldInputBlocked()) return;
    this.activeAdventure()?.selectMelee();
    this.publishUi();
  }

  // Equipment commands are intentionally available while its modal pauses simulation.
  public equipWeapon(id: string): void {
    if (!this.created || this.disposed) return;
    if (this.activeAdventure()?.equip(id)) this.simulation.stop();
    this.publishUi();
  }

  public setEnemyLevel(level: number): void {
    if (!this.created || this.disposed) return;
    if (this.activeAdventure()?.setEnemyLevel(level)) {
      this.simulation.stop();
      this.simulation.player = { ...this.simulation.sample.spawn };
      this.center();
    }
    this.publishUi();
  }

  public center(): void {
    if (!this.created) return;
    this.cancelPointer();
    this.following = true;
    this.setCameraZoom(this.exploringZoom());
    this.cameras.main.centerOn(this.simulation.player.x, this.simulation.player.y - 18);
    this.publishUi();
  }

  public focus(point: Point): void {
    if (!this.created) return;
    this.cancelPointer();
    this.following = false;
    this.setCameraZoom(Math.max(1, this.cameras.main.zoom));
    this.cameras.main.centerOn(point.x, point.y - 48);
    this.publishUi();
  }

  public overview(): void {
    if (!this.created) return;
    this.cancelPointer();
    this.following = false;
    const bounds = this.simulation.sample.bounds;
    this.setCameraZoom(
      Math.max(
        this.minimumZoom(),
        Math.min(1, (this.width * 0.85) / bounds.width, (this.height * 0.85) / bounds.height),
      ),
    );
    this.cameras.main.centerOn(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    this.publishUi();
  }

  private minimumZoom(): number {
    const { bounds } = this.simulation.sample;
    return Math.min(0.25, (this.width * 0.85) / bounds.width, (this.height * 0.85) / bounds.height);
  }

  private exploringZoom(): number {
    const sample = this.simulation.sample;
    if (isHouseSceneId(sampleSceneId(sample)))
      return Math.max(
        0.75,
        Math.min(
          1.5,
          (this.width - 64) / sample.bounds.width,
          (this.height - 160) / sample.bounds.height,
        ),
      );
    return this.width < 700 || sample.terrain !== undefined ? 1 : 2;
  }

  private setCameraZoom(zoom: number): void {
    const camera = this.cameras.main.setZoom(zoom);
    const bounds = this.simulation.sample.bounds;
    const width = Math.max(bounds.width, camera.width / zoom);
    const height = Math.max(bounds.height, camera.height / zoom);
    // Keep a small town centered when its full extent is smaller than the viewport.
    camera.setBounds(
      bounds.x - (width - bounds.width) / 2,
      bounds.y - (height - bounds.height) / 2,
      width,
      height,
      false,
    );
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.simulation.rememberPosition();
    this.movement?.destroy();
    this.movement = null;
    this.clearVisuals();
    this.players = [];
    this.positionReady = false;
    this.load?.off('loaderror', this.onLoadError);
    const canvas = this.game?.canvas;
    this.cancelPointer();
    canvas?.removeEventListener('pointerdown', this.onPointerDown);
    canvas?.removeEventListener('contextmenu', this.onContextMenu);
    canvas?.removeEventListener('auxclick', this.onContextMenu);
    canvas?.removeEventListener('pointermove', this.onPointerMove);
    canvas?.removeEventListener('pointerup', this.onPointerUp);
    canvas?.removeEventListener('pointercancel', this.onPointerCancel);
    canvas?.removeEventListener('lostpointercapture', this.onPointerCancel);
    canvas?.removeEventListener('wheel', this.onWheel);
    canvas?.removeEventListener('webglcontextlost', this.onContextLost);
    if (canvas) delete canvas.dataset.rpgReady;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private renderSample(): void {
    this.clearVisuals();
    const sample = this.simulation.sample;
    this.scenery = new RpgSampleRenderer(this, sample);
    this.signage = new TownSignage(this, sample.signage ?? []);
    const player = this.simulation.player;
    this.playerMarker = this.add
      .ellipse(player.x, player.y - 1, 27, 11)
      .setStrokeStyle(1, 0xffdfa4, 0.8)
      .setDepth(player.y - 0.1);
    this.avatar = new RpgCharacter(this, this.appearance, player.x, player.y);
    this.remotes = new RpgRemoteCharacters(
      this,
      sceneDefinition(sampleSceneId(this.simulation.sample)).visiblePlayerLimit - 1,
    );
    this.remotes.setPlayers(this.players, this.elapsed);
    if (!sample.demo) this.ambient = new RpgAmbientEntities(this, sample, this.sceneKey);
    if (sample.demo?.jungle) {
      this.adventureSession ??= new AdventureSession(
        sample.demo.jungle,
        sample.colliders,
        sample.bounds,
        sample.spawn,
        { durationMs: RPG_CAST_DURATION_MS, releaseMs: RPG_CAST_RELEASE_MS },
        {
          equipmentPolicy: DEMO_EQUIPMENT_POLICY,
          enemyLevelOverride: 1,
          safeAreas: [
            {
              x: sample.bounds.x,
              y: sample.spawn.y - 64,
              width: sample.bounds.width,
              height: sample.bounds.y + sample.bounds.height - sample.spawn.y + 64,
            },
          ],
        },
      );
      this.adventureRenderer = new AdventureSessionRenderer(this, this.adventureSession);
    }
    this.npcs = sample.npcs.map((npc) => new RpgCharacter(this, npc.appearance, npc.x, npc.y));
    this.labels = sample.npcs.map((npc) =>
      this.add
        .text(npc.x, npc.y - 64, `${npc.name} · NPC`, {
          fontFamily: 'Inter Variable, sans-serif',
          fontSize: '11px',
          color: '#fff5da',
          backgroundColor: '#253328',
          padding: { x: 5, y: 3 },
        })
        .setOrigin(0.5, 1)
        .setDepth(95000)
        .setVisible(false),
    );
    this.marker = this.add.graphics().setDepth(50000).setVisible(false);
    this.cameras.main.setSize(this.width, this.height).setRoundPixels(true);
    this.lastUi = '';
    this.center();
  }

  private clearVisuals(): void {
    this.adventureRenderer?.destroy();
    this.adventureRenderer = null;
    this.talkingTo = null;
    this.feedback = null;
    this.scenery?.destroy();
    this.scenery = null;
    this.avatar?.destroy();
    this.avatar = null;
    this.remotes?.destroy();
    this.remotes = null;
    this.ambient?.destroy();
    this.ambient = null;
    this.npcs.forEach((npc) => npc.destroy());
    this.npcs = [];
    this.labels.forEach((label) => label.destroy());
    this.labels = [];
    this.signage?.destroy();
    this.signage = null;
    this.marker?.destroy();
    this.marker = null;
    this.playerMarker?.destroy();
    this.playerMarker = null;
  }

  private publishUi(): void {
    if (!this.created || this.disposed) return;
    this.lastUiTime = this.elapsed;
    const state: RpgUiState = {
      theme: this.simulation.sample.id,
      place: this.simulation.place(),
      nearby:
        (
          this.simulation.nearby(Boolean(this.callbacks.onHouse)) ??
          this.ambient?.nearby(this.simulation.player)
        )?.ui ?? null,
      position: {
        x: Math.round(this.simulation.player.x),
        y: Math.round(this.simulation.player.y),
      },
      zoom: this.cameras.main.zoom,
      minZoom: this.minimumZoom(),
      following: this.following,
      feedback: this.feedback && Date.now() < this.feedback.until ? this.feedback.message : '',
    };
    const adventure = this.activeAdventure();
    if (adventure) {
      state.adventure = adventure.status();
      const flower = adventure.nearbyFlower(this.simulation.player);
      if (flower)
        state.nearby = {
          id: flower.id,
          label: flower.kind === 'healing' ? 'healing herb' : 'moonblossom',
          action: 'Gather',
        };
    }
    if (state.nearby && state.nearby.id === this.simulation.sample.demo?.portal.id)
      state.nearby.action = 'Enter';
    const key = JSON.stringify(state);
    if (key !== this.lastUi) {
      this.lastUi = key;
      this.callbacks.onUi(state);
    }
  }

  private location(): RpgLocation {
    return {
      ...this.simulation.player,
      direction: this.simulation.direction,
      action: this.simulation.action,
      scene: sampleSceneId(this.simulation.sample),
    };
  }

  private publishMove(immediate = false): void {
    // Admission restores the authoritative spawn before any local state may be published.
    if (
      this.disposed ||
      this.failed ||
      !this.positionReady ||
      !this.callbacks.onMove ||
      (!immediate && this.elapsed - this.lastMoveTime < 100)
    )
      return;
    const location = this.location();
    const key = JSON.stringify(location);
    const via = this.simulation.takeMovementPath();
    if (key === this.lastMove && via.length === 0) return;
    this.lastMove = key;
    this.lastMoveTime = this.elapsed;
    this.callbacks.onMove({
      ...location,
      revision: this.simulation.movementRevision,
      ...(via.length ? { via } : {}),
    });
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.repeat ||
      event.isComposing ||
      event.defaultPrevented ||
      this.inputBlocked ||
      worldInputBlocked(event.target)
    )
      return;
    if (event.code === 'KeyE') {
      event.preventDefault();
      this.interact();
    }
    if (this.activeAdventure() && event.code === 'KeyJ') {
      event.preventDefault();
      this.attack();
    }
    if (this.activeAdventure() && event.code === 'KeyH') {
      event.preventDefault();
      this.heal();
    }
    if (this.activeAdventure() && (event.code === 'Digit1' || event.code === 'Digit2')) {
      event.preventDefault();
      this.selectSpell(event.code === 'Digit1' ? 'fire' : 'water');
    }
    if (this.activeAdventure() && event.code === 'Digit3') {
      event.preventDefault();
      this.selectMelee();
    }
    if (event.code === 'Equal' || event.code === 'NumpadAdd') {
      event.preventDefault();
      this.zoomBy(2);
    }
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
      event.preventDefault();
      this.zoomBy(0.5);
    }
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (
      (!event.isPrimary && event.pointerType !== 'touch') ||
      this.inputBlocked ||
      worldInputBlocked()
    )
      return;
    if (this.pointerDrag) return;
    if (event.button !== 0 && event.button !== 1) return;
    const canvas = this.game.canvas;
    canvas.focus({ preventScroll: true });
    if (this.activeAdventure() && event.button === 0 && event.pointerType !== 'touch') {
      event.preventDefault();
      this.previousTap = null;
      this.attack(this.pointerWorldPoint(event));
      return;
    }
    if (event.button === 1) event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    this.pointerDrag = { id: event.pointerId, start: point, last: point, dragging: false };
    canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.pointerDrag;
    if (!drag || drag.id !== event.pointerId) return;
    if (this.inputBlocked || worldInputBlocked()) {
      this.cancelPointer();
      return;
    }
    const point = { x: event.clientX, y: event.clientY };
    if (!drag.dragging && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < 6) return;
    event.preventDefault();
    drag.dragging = true;
    this.following = false;
    this.previousTap = null;
    this.game.canvas.dataset.rpgPanning = 'true';
    const camera = this.cameras.main;
    const rect = this.game.canvas.getBoundingClientRect();
    camera.setScroll(
      camera.clampX(
        camera.scrollX - ((point.x - drag.last.x) * this.width) / (rect.width * camera.zoom),
      ),
      camera.clampY(
        camera.scrollY - ((point.y - drag.last.y) * this.height) / (rect.height * camera.zoom),
      ),
    );
    drag.last = point;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.pointerDrag;
    if (!drag || drag.id !== event.pointerId) return;
    this.cancelPointer();
    if (
      drag.dragging ||
      this.inputBlocked ||
      worldInputBlocked() ||
      Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) >= 6
    ) {
      this.previousTap = null;
      return;
    }
    if (this.activeAdventure()) {
      this.previousTap = null;
      if (event.pointerType === 'touch') this.attack(this.pointerWorldPoint(event));
      return;
    }
    if (event.button !== 0) return;
    const now = performance.now();
    const point = { x: event.clientX, y: event.clientY };
    if (
      this.previousTap &&
      now - this.previousTap.time < 350 &&
      Math.hypot(point.x - this.previousTap.point.x, point.y - this.previousTap.point.y) < 24
    ) {
      const rect = this.game.canvas.getBoundingClientRect();
      const worldPoint = this.cameras.main.getWorldPoint(
        ((point.x - rect.left) * this.width) / rect.width,
        ((point.y - rect.top) * this.height) / rect.height,
      );
      this.simulation.navigate(worldPoint);
      this.following = true;
      this.marker
        ?.clear()
        .lineStyle(1, 0xffe7a5, 0.9)
        .strokeEllipse(worldPoint.x, worldPoint.y, 16, 8)
        .setVisible(true);
      this.previousTap = null;
    } else this.previousTap = { point, time: now };
  };

  private pointerWorldPoint(event: PointerEvent): Point {
    const rect = this.game.canvas.getBoundingClientRect();
    const point = this.cameras.main.getWorldPoint(
      ((event.clientX - rect.left) * this.width) / rect.width,
      ((event.clientY - rect.top) * this.height) / rect.height,
    );
    return combatTargetAtPointer(point, this.activeAdventure()?.combatMode ?? 'melee');
  }

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.pointerDrag?.id !== event.pointerId) return;
    this.previousTap = null;
    this.cancelPointer();
  };

  private cancelPointer(): void {
    const drag = this.pointerDrag;
    this.pointerDrag = null;
    const canvas = this.game?.canvas;
    if (canvas) {
      delete canvas.dataset.rpgPanning;
      if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    }
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (this.inputBlocked || worldInputBlocked() || event.deltaY === 0) return;
    // Trackpads emit many events per gesture; let each zoom level render before advancing.
    const now = performance.now();
    if (now - this.lastWheelTime < 120) return;
    this.lastWheelTime = now;
    this.zoomBy(event.deltaY < 0 ? 2 : 0.5);
  };
  private readonly onBlur = (): void => {
    this.demoFocused = false;
    this.previousFrameTime = null;
    this.simulation.stop();
    this.previousTap = null;
    this.cancelPointer();
    // A hidden tab may receive no further animation frames to publish its final idle state.
    this.publishMove(true);
  };
  private readonly onFocus = (): void => {
    this.demoFocused = true;
    this.previousFrameTime = null;
  };
  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.onBlur();
    else if (document.hasFocus()) this.onFocus();
  };
  private readonly onLoadError = (): void => {
    this.fail();
  };
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.fail();
  };
  private fail(): void {
    if (this.failed || this.disposed) return;
    this.failed = true;
    this.simulation.stop();
    this.movement?.destroy();
    this.movement = null;
    if (this.game?.canvas) delete this.game.canvas.dataset.rpgReady;
    this.callbacks.onError();
  }
}
