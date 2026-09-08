import * as Phaser from 'phaser';
import { WorldInput, worldInputBlocked } from '../world/engine/input';
import type { Point } from '../world/engine/types';
import { preloadRpgCharacters, RpgCharacter } from './character';
import { preloadRpgWorlds, registerRpgFrames, RpgSampleRenderer } from './sample-renderer';
import { directionToward, RpgSimulation } from './simulation';
import type { RpgCallbacks, RpgSample, RpgUiState } from './types';

export class RpgScene extends Phaser.Scene {
  private readonly simulation: RpgSimulation;
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private movement: WorldInput | null = null;
  private scenery: RpgSampleRenderer | null = null;
  private avatar: RpgCharacter | null = null;
  private npcs: RpgCharacter[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private marker: Phaser.GameObjects.Graphics | null = null;
  private playerMarker: Phaser.GameObjects.Ellipse | null = null;
  private appearance = 'rowan';
  private created = false;
  private failed = false;
  private disposed = false;
  private inputBlocked = false;
  private width = 1;
  private height = 1;
  private lastUi = '';
  private lastUiTime = 0;
  private elapsed = 0;
  private previousTap: { point: Point; time: number } | null = null;
  private pointerStart: Point | null = null;

  public constructor(
    sample: RpgSample,
    private readonly callbacks: RpgCallbacks,
    private readonly samples: readonly RpgSample[],
    sceneKey: string,
    positions: Map<string, Point>,
  ) {
    super({ key: 'rpg-sample' });
    this.simulation = new RpgSimulation(sample, sceneKey, positions);
  }

  public preload(): void {
    this.load.on('loaderror', this.onLoadError);
    preloadRpgWorlds(this, this.samples);
    preloadRpgCharacters(this);
  }

  public create(): void {
    if (this.disposed || this.failed) return;
    registerRpgFrames(this, this.samples);
    this.movement = new WorldInput();
    this.created = true;
    this.renderSample();
    this.game.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.game.canvas.addEventListener('pointerup', this.onPointerUp);
    this.game.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.game.canvas.addEventListener('webglcontextlost', this.onContextLost);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('blur', this.onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.dispose, this);
    this.game.canvas.dataset.rpgReady = 'true';
    this.callbacks.onReady();
  }

  public update(_time: number, delta: number): void {
    if (!this.created || this.failed || this.disposed || document.hidden || !this.avatar) return;
    const dt = Math.min(50, delta);
    this.elapsed += dt;
    this.simulation.blocked = this.inputBlocked || worldInputBlocked();
    const input = this.movement?.getMovement() ?? { x: 0, y: 0, moving: false, sprinting: false };
    this.simulation.tick(dt / 1000, input);
    const { player, direction, action } = this.simulation;
    this.avatar.update(player.x, player.y, direction, action, this.elapsed, this.motion.matches);
    this.playerMarker?.setPosition(player.x, player.y - 1).setDepth(player.y - 0.1);
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
      this.labels[index]?.setVisible(nearby?.target.id === npc.id);
    });
    this.scenery?.update(this.elapsed, this.motion.matches);
    const camera = this.cameras.main;
    // Phaser applies zoom around the camera origin; scroll stays in unscaled world units.
    const targetX = player.x - camera.width / 2;
    const targetY = player.y - 18 - camera.height / 2;
    const follow = this.motion.matches ? 1 : 1 - Math.exp((-10 * dt) / 1000);
    camera.setScroll(
      camera.scrollX + (targetX - camera.scrollX) * follow,
      camera.scrollY + (targetY - camera.scrollY) * follow,
    );
    if (action !== 'idle') this.marker?.setVisible(false);
    if (this.elapsed - this.lastUiTime >= 100) this.publishUi();
  }

  public resize(width: number, height: number): void {
    const previousCompact = this.width < 700;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (!this.created) return;
    this.cameras.main.setSize(this.width, this.height);
    if (previousCompact !== this.width < 700) this.cameras.main.setZoom(this.width < 700 ? 1 : 2);
    this.center();
  }

  public setScene(sample: RpgSample, sceneKey: string): void {
    if (this.simulation.sample === sample) return;
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

  public setInputBlocked(blocked: boolean): void {
    this.inputBlocked = blocked;
    this.simulation.blocked = blocked;
    if (blocked) this.simulation.stop();
  }

  public setVirtualAxis(x: number, y: number, sprinting = false): void {
    this.movement?.setVirtualAxis(x, y, sprinting);
  }

  public interact(): void {
    if (!this.created || this.failed || this.disposed || this.inputBlocked || worldInputBlocked())
      return;
    const nearby = this.simulation.nearby();
    if (!nearby) return;
    this.simulation.stop();
    const target = nearby.target;
    if ('lines' in target) {
      this.callbacks.onDialogue({
        name: target.name,
        role: target.role,
        lines: target.lines,
        appearance: target.appearance,
      });
    } else if (target.destination) this.callbacks.onTravel(target.destination);
    else
      this.callbacks.onDialogue({
        name: target.name,
        role: this.simulation.sample.name,
        lines: [target.description],
      });
  }

  public zoomBy(factor: number): void {
    if (!this.created) return;
    const steps = this.width < 700 ? [1, 2, 3] : [1, 2, 3, 4];
    const current = this.cameras.main.zoom;
    const next =
      factor > 1
        ? steps.find((step) => step > current)
        : [...steps].reverse().find((step) => step < current);
    this.cameras.main.setZoom(next ?? current);
    this.center();
  }

  public center(): void {
    if (!this.created) return;
    this.cameras.main.centerOn(this.simulation.player.x, this.simulation.player.y - 18);
    this.publishUi();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.simulation.rememberPosition();
    this.movement?.destroy();
    this.movement = null;
    this.clearVisuals();
    this.load?.off('loaderror', this.onLoadError);
    const canvas = this.game?.canvas;
    canvas?.removeEventListener('pointerdown', this.onPointerDown);
    canvas?.removeEventListener('pointerup', this.onPointerUp);
    canvas?.removeEventListener('wheel', this.onWheel);
    canvas?.removeEventListener('webglcontextlost', this.onContextLost);
    if (canvas) delete canvas.dataset.rpgReady;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('blur', this.onBlur);
  }

  private renderSample(): void {
    this.clearVisuals();
    const sample = this.simulation.sample;
    this.scenery = new RpgSampleRenderer(this, sample);
    const player = this.simulation.player;
    this.playerMarker = this.add
      .ellipse(player.x, player.y - 1, 27, 11)
      .setStrokeStyle(1, 0xffdfa4, 0.8)
      .setDepth(player.y - 0.1);
    this.avatar = new RpgCharacter(this, this.appearance, player.x, player.y);
    this.npcs = sample.npcs.map((npc) => new RpgCharacter(this, npc.appearance, npc.x, npc.y));
    this.labels = sample.npcs.map((npc) =>
      this.add
        .text(npc.x, npc.y - 64, npc.name, {
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
    this.cameras.main
      .setBounds(sample.bounds.x, sample.bounds.y, sample.bounds.width, sample.bounds.height)
      .setSize(this.width, this.height)
      .setZoom(this.width < 700 ? 1 : 2)
      .setRoundPixels(true);
    this.lastUi = '';
    this.center();
  }

  private clearVisuals(): void {
    this.scenery?.destroy();
    this.scenery = null;
    this.avatar?.destroy();
    this.avatar = null;
    this.npcs.forEach((npc) => npc.destroy());
    this.npcs = [];
    this.labels.forEach((label) => label.destroy());
    this.labels = [];
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
      nearby: this.simulation.nearby()?.ui ?? null,
      position: {
        x: Math.round(this.simulation.player.x),
        y: Math.round(this.simulation.player.y),
      },
      zoom: this.cameras.main.zoom,
    };
    const key = JSON.stringify(state);
    if (key !== this.lastUi) {
      this.lastUi = key;
      this.callbacks.onUi(state);
    }
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
    if (event.button !== 0 || this.inputBlocked) return;
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.game.canvas.focus({ preventScroll: true });
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (
      !start ||
      this.inputBlocked ||
      worldInputBlocked() ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12
    )
      return;
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
      this.marker
        ?.clear()
        .lineStyle(1, 0xffe7a5, 0.9)
        .strokeEllipse(worldPoint.x, worldPoint.y, 16, 8)
        .setVisible(true);
      this.previousTap = null;
    } else this.previousTap = { point, time: now };
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (this.inputBlocked || worldInputBlocked()) return;
    this.zoomBy(event.deltaY < 0 ? 2 : 0.5);
  };
  private readonly onBlur = (): void => {
    this.simulation.stop();
    this.previousTap = null;
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
