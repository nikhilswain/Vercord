import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { AvatarId } from '../../../domain/avatar/identity';
import type { PresencePlayer } from '../../../domain/presence/protocol';
import { WorldInput, worldInputBlocked } from '../engine/input';
import type { WorldDefinition, WorldUiState } from '../engine/types';
import type { WorldCallbacks, WorldRuntime } from '../engine/world-runtime';
import { createAnimatedCharacter, type AnimatedCharacterModel } from './animated-character';
import { createWorldModel, type WorldModel } from './world-model';
import { WorldSimulation } from './world-simulation';

const DEFAULT_DISTANCE = 900;
const FACING = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

interface MapLabel {
  element: HTMLSpanElement;
  position: THREE.Vector3;
  kind: 'area' | 'room';
}

/** Experimental visual adapter. Network positions and collisions remain on the X/Z ground plane. */
export class ThreeWorldEngine implements WorldRuntime {
  private readonly simulation: WorldSimulation;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 10, 30_000);
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly sun = new THREE.DirectionalLight(0xffedd3, 3);
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private input: WorldInput | null = null;
  private model: WorldModel | null = null;
  private avatar: AnimatedCharacterModel | null = null;
  private avatarId: AvatarId = 'avatar-01';
  private readonly remotes = new Map<
    string,
    { model: AnimatedCharacterModel; avatarId: AvatarId; label: HTMLSpanElement }
  >();
  private remotePlayers: readonly PresencePlayer[] = [];
  private labels: MapLabel[] = [];
  private labelRoot: HTMLDivElement | null = null;
  private playerLabel: HTMLSpanElement | null = null;
  private viewport = { width: 1, height: 1 };
  private previousUi = '';
  private frame = 0;
  private previousTime = 0;
  private elapsed = 0;
  private lastLabelTime = 0;
  private revision = -1;
  private following = true;
  private destroyed = false;
  private failed = false;
  private pointerStart: { x: number; y: number; id: number; touch: boolean } | null = null;
  private lastTap: { x: number; y: number; time: number } | null = null;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    world: WorldDefinition,
    private readonly callbacks: WorldCallbacks,
  ) {
    this.simulation = new WorldSimulation(world, callbacks);
  }

  public start(): void {
    if (this.renderer || this.destroyed) return;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;
      this.scene.background = new THREE.Color('#b9ccd0');
      this.scene.add(new THREE.HemisphereLight(0xe5f3ff, 0x667357, 2.1));
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 1.2;
      this.sun.shadow.camera.near = 1;
      this.sun.shadow.camera.far = 4500;
      this.scene.add(this.sun, this.sun.target);
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = !this.reduceMotion.matches;
      this.controls.dampingFactor = 0.12;
      this.controls.minPolarAngle = 0.15;
      this.controls.maxPolarAngle = Math.PI / 2.5;
      this.controls.minDistance = 160;
      this.controls.maxDistance = 6500;
      this.controls.addEventListener('start', this.onOrbitStart);
      this.input = new WorldInput();
      this.labelRoot = document.createElement('div');
      this.labelRoot.className = 'world-three-labels';
      this.labelRoot.setAttribute('aria-hidden', 'true');
      this.canvas.parentElement?.append(this.labelRoot);
      this.playerLabel = this.makeLabel('You', 'world-three-label world-three-label--player');
      this.labelRoot.append(this.playerLabel);
      this.avatar = createAnimatedCharacter(this.avatarId, true);
      this.scene.add(this.avatar.group);
      this.rebuild();
      this.resize(this.viewport.width, this.viewport.height);
      this.resetView();
      this.canvas.addEventListener('webglcontextlost', this.onContextLost);
      this.canvas.addEventListener('pointerdown', this.onPointerDown);
      this.canvas.addEventListener('pointerup', this.onPointerUp);
      this.canvas.addEventListener('pointercancel', this.onPointerCancel);
      this.canvas.addEventListener('dblclick', this.onDoubleClick);
      window.addEventListener('keydown', this.onKeyDown);
      this.reduceMotion.addEventListener('change', this.onMotionChange);
      this.canvas.dataset.worldReady = 'true';
      this.render(performance.now());
      if (!this.failed) this.callbacks.onReady();
    } catch {
      this.fail();
    }
  }

  public resize(width: number, height: number): void {
    this.viewport = { width: Math.max(1, width), height: Math.max(1, height) };
    this.camera.aspect = this.viewport.width / this.viewport.height;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(this.viewport.width, this.viewport.height, false);
  }

  public updateWorld(world: WorldDefinition): void {
    this.simulation.updateWorld(world);
  }

  public zoomIn(): void {
    this.zoomBy(1 / 1.2);
  }
  public zoomOut(): void {
    this.zoomBy(1.2);
  }

  public resetView(): void {
    const controls = this.controls;
    if (!controls) return;
    const { player, world } = this.simulation;
    const interior = world.environment === 'interior';
    const target = interior
      ? new THREE.Vector3(world.bounds.width / 2, 0, world.bounds.height / 2)
      : new THREE.Vector3(player.x, 0, player.y - 90);
    const distance = interior ? 610 * Math.max(1, 1.3 / this.camera.aspect) : DEFAULT_DISTANCE;
    const offset = new THREE.Vector3(interior ? 0.16 : 0.28, 0.76, 0.78)
      .normalize()
      .multiplyScalar(distance);
    controls.target.copy(target);
    this.camera.position.copy(target).add(offset);
    controls.update();
    this.following = !interior;
  }

  public overview(): void {
    const controls = this.controls;
    if (!controls) return;
    const bounds = this.simulation.world.bounds;
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const radius = Math.hypot(bounds.width, bounds.height) / 2;
    const distance =
      (radius / Math.sin(Math.atan(Math.tan(halfFov) * Math.min(1, this.camera.aspect)))) * 1.08;
    controls.maxDistance = Math.max(6500, distance * 1.5);
    controls.target.set(bounds.x + bounds.width / 2, 0, bounds.y + bounds.height / 2);
    this.camera.far = Math.max(30_000, distance * 3);
    this.camera.updateProjectionMatrix();
    this.camera.position
      .copy(controls.target)
      .add(new THREE.Vector3(0.2, 1.2, 0.95).normalize().multiplyScalar(distance));
    controls.update();
    this.following = false;
  }

  public rotateView(radians: number): void {
    const controls = this.controls;
    if (!controls) return;
    const offset = this.camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
    this.camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  public setVirtualAxis(x: number, y: number, sprinting = false): void {
    this.input?.setVirtualAxis(x, y, sprinting);
  }
  public interact(): void {
    if (!this.failed) this.simulation.interact();
  }
  public enterRoomByKey(roomKey: string): boolean {
    return !this.failed && this.renderer !== null && this.simulation.enterRoomByKey(roomKey);
  }
  public setRemotePlayers(players: readonly PresencePlayer[]): void {
    this.remotePlayers = players;
  }

  public setPlayerAvatar(avatarId: AvatarId): void {
    if (this.avatarId === avatarId) return;
    this.avatarId = avatarId;
    if (!this.avatar) return;
    this.scene.remove(this.avatar.group);
    this.avatar.dispose();
    this.avatar = createAnimatedCharacter(avatarId, true);
    this.scene.add(this.avatar.group);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('keydown', this.onKeyDown);
    this.reduceMotion.removeEventListener('change', this.onMotionChange);
    this.input?.destroy();
    this.controls?.removeEventListener('start', this.onOrbitStart);
    this.controls?.dispose();
    this.model?.dispose();
    this.avatar?.dispose();
    for (const remote of this.remotes.values()) remote.model.dispose();
    this.remotes.clear();
    this.sun.shadow.dispose();
    this.scene.clear();
    this.renderer?.dispose();
    this.labelRoot?.remove();
    delete this.canvas.dataset.worldReady;
  }

  private rebuild(): void {
    if (this.model) {
      this.scene.remove(this.model.group);
      this.model.dispose();
    }
    this.model = createWorldModel(this.simulation.world);
    this.scene.add(this.model.group);
    this.labels.forEach((label) => label.element.remove());
    this.labels = this.model.labels.map((label) => {
      const element = this.makeLabel(
        label.text,
        `world-three-label world-three-label--${label.kind}`,
      );
      this.labelRoot?.append(element);
      return { element, position: label.position, kind: label.kind };
    });
    const interior = this.simulation.world.environment === 'interior';
    const span = interior ? 420 : 1200;
    Object.assign(this.sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.revision = this.simulation.revision;
  }

  private readonly render = (time: number): void => {
    if (this.destroyed || this.failed || !this.renderer || !this.controls || !this.avatar) return;
    const delta = this.previousTime
      ? Math.min(0.05, Math.max(0, (time - this.previousTime) / 1000))
      : 0;
    this.previousTime = time;
    try {
      if (!document.hidden) {
        this.elapsed += delta;
        const input = this.input?.getMovement() ?? { x: 0, y: 0, moving: false, sprinting: false };
        const angle = this.controls.getAzimuthalAngle();
        const x = input.x * Math.cos(angle) + input.y * Math.sin(angle);
        const y = -input.x * Math.sin(angle) + input.y * Math.cos(angle);
        const before = { x: this.simulation.player.x, y: this.simulation.player.y };
        this.simulation.tick(delta, { ...input, x, y }, worldInputBlocked());
        if (this.revision !== this.simulation.revision) {
          this.rebuild();
          this.resetView();
        }
        const player = this.simulation.player;
        this.avatar.group.position.set(player.x, 0, player.y);
        if (player.moving) {
          this.avatar.group.rotation.y = Math.atan2(player.x - before.x, player.y - before.y);
          if (input.moving && this.simulation.world.environment === 'exterior')
            this.following = true;
        }
        this.avatar.animate(
          this.elapsed,
          player.moving,
          this.reduceMotion.matches,
          input.sprinting,
        );
        if (this.following) {
          const desired = new THREE.Vector3(player.x, 0, player.y - 90);
          const shift = desired
            .sub(this.controls.target)
            .multiplyScalar(this.reduceMotion.matches ? 1 : 1 - Math.exp(-9 * delta));
          this.controls.target.add(shift);
          this.camera.position.add(shift);
        }
        this.controls.update();
        this.sun.position.copy(this.controls.target).add(new THREE.Vector3(-650, 1400, 450));
        this.sun.target.position.copy(this.controls.target);
        this.updateRemotes(delta);
        const zoom = Math.round(
          (DEFAULT_DISTANCE / this.camera.position.distanceTo(this.controls.target)) * 100,
        );
        const ui = this.simulation.ui(zoom);
        this.publishUi(ui);
        this.callbacks.onPresenceMove?.({ ...player, scene: this.simulation.scene });
        this.renderer.render(this.scene, this.camera);
        if (time - this.lastLabelTime > 50) {
          this.updateLabels();
          this.lastLabelTime = time;
        }
      }
      this.frame = requestAnimationFrame(this.render);
    } catch {
      this.fail();
    }
  };

  private updateRemotes(delta: number): void {
    const visible = this.remotePlayers.filter((player) => player.scene === this.simulation.scene);
    const ids = new Set(visible.map((player) => player.id));
    for (const [id, remote] of this.remotes) {
      if (ids.has(id)) continue;
      this.scene.remove(remote.model.group);
      remote.model.dispose();
      remote.label.remove();
      this.remotes.delete(id);
    }
    for (const player of visible) {
      let remote = this.remotes.get(player.id);
      if (remote && remote.avatarId !== player.avatarId) {
        this.scene.remove(remote.model.group);
        remote.model.dispose();
        remote.label.remove();
        this.remotes.delete(player.id);
        remote = undefined;
      }
      if (!remote) {
        const model = createAnimatedCharacter(player.avatarId);
        model.group.position.set(player.x, 0, player.y);
        const label = this.makeLabel(
          player.displayName,
          'world-three-label world-three-label--player',
        );
        this.labelRoot?.append(label);
        remote = { model, avatarId: player.avatarId, label };
        this.remotes.set(player.id, remote);
        this.scene.add(model.group);
      }
      remote.label.textContent = player.displayName;
      remote.model.group.position.lerp(
        new THREE.Vector3(player.x, 0, player.y),
        this.reduceMotion.matches ? 1 : 1 - Math.exp(-12 * delta),
      );
      remote.model.group.rotation.y = FACING[player.direction];
      remote.model.animate(this.elapsed, player.moving, this.reduceMotion.matches);
    }
  }

  private updateLabels(): void {
    const distance = this.controls ? this.camera.position.distanceTo(this.controls.target) : 900;
    const occupied: Array<{ x: number; y: number }> = [];
    for (const label of this.labels) {
      const screen = label.position.clone().project(this.camera);
      const x = (screen.x * 0.5 + 0.5) * this.viewport.width;
      const y = (-screen.y * 0.5 + 0.5) * this.viewport.height;
      const hidden =
        screen.z > 1 ||
        screen.z < -1 ||
        x < 30 ||
        x > this.viewport.width - 30 ||
        y < 80 ||
        y > this.viewport.height - 50 ||
        (distance > 2500 && label.kind === 'room') ||
        occupied.some((point) => Math.abs(point.x - x) < 135 && Math.abs(point.y - y) < 30);
      label.element.hidden = hidden;
      if (!hidden) {
        label.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        occupied.push({ x, y });
      }
    }
    if (this.playerLabel && this.avatar)
      this.projectLabel(
        this.playerLabel,
        this.avatar.group.position.clone().add(new THREE.Vector3(0, 62, 0)),
      );
    for (const remote of this.remotes.values())
      this.projectLabel(
        remote.label,
        remote.model.group.position.clone().add(new THREE.Vector3(0, 62, 0)),
      );
  }

  private projectLabel(element: HTMLElement, position: THREE.Vector3): void {
    const point = position.project(this.camera);
    element.hidden = point.z > 1 || point.z < -1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
    element.style.transform = `translate(${(point.x * 0.5 + 0.5) * this.viewport.width}px, ${(-point.y * 0.5 + 0.5) * this.viewport.height}px) translate(-50%, -100%)`;
  }

  private publishUi(ui: WorldUiState): void {
    const key = `${this.revision}:${ui.area?.key}:${ui.nearbyPortal?.key}:${ui.zoom}`;
    if (this.previousUi === key) return;
    this.previousUi = key;
    this.callbacks.onUiChange(ui);
  }

  private zoomBy(factor: number): void {
    if (!this.controls) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = THREE.MathUtils.clamp(
      offset.length() * factor,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    this.camera.position.copy(this.controls.target).add(offset.setLength(distance));
    this.controls.update();
  }

  private makeLabel(text: string, className: string): HTMLSpanElement {
    const label = document.createElement('span');
    label.className = className;
    label.textContent = text;
    return label;
  }

  private navigate(clientX: number, clientY: number): void {
    if (worldInputBlocked()) return;
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        (-(clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const point = this.raycaster.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
    if (!point) return;
    this.simulation.navigate({ x: point.x, y: point.z });
    this.following = this.simulation.world.environment === 'exterior';
  }

  private fail(): void {
    if (this.failed || this.destroyed) return;
    this.failed = true;
    cancelAnimationFrame(this.frame);
    this.input?.destroy();
    if (this.controls) this.controls.enabled = false;
    delete this.canvas.dataset.worldReady;
    this.callbacks.onAssetError();
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.fail();
  };
  private readonly onMotionChange = (): void => {
    if (this.controls) this.controls.enableDamping = !this.reduceMotion.matches;
  };
  private readonly onOrbitStart = (): void => {
    this.following = false;
    this.simulation.stopNavigation();
  };
  private readonly onDoubleClick = (event: MouseEvent): void => {
    this.navigate(event.clientX, event.clientY);
  };
  private readonly onPointerCancel = (): void => {
    this.pointerStart = null;
    this.lastTap = null;
  };
  private readonly onPointerDown = (event: PointerEvent): void => {
    this.canvas.focus({ preventScroll: true });
    if (!event.isPrimary) {
      this.onPointerCancel();
      return;
    }
    this.pointerStart = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      touch: event.pointerType === 'touch',
    };
  };
  private readonly onPointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (
      !start?.touch ||
      start.id !== event.pointerId ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12
    ) {
      this.lastTap = null;
      return;
    }
    if (
      this.lastTap &&
      event.timeStamp - this.lastTap.time < 350 &&
      Math.hypot(event.clientX - this.lastTap.x, event.clientY - this.lastTap.y) < 32
    ) {
      this.navigate(event.clientX, event.clientY);
      this.lastTap = null;
    } else this.lastTap = { x: event.clientX, y: event.clientY, time: event.timeStamp };
  };
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing || worldInputBlocked(event.target)) return;
    if (event.code === 'KeyE' && !event.repeat) this.interact();
    else if (event.code === 'Escape' || event.code === 'Digit0') {
      this.simulation.stopNavigation();
      this.resetView();
    } else if (event.code === 'KeyQ') this.rotateView(-Math.PI / 4);
    else if (event.code === 'KeyR') this.rotateView(Math.PI / 4);
    else if (event.code === 'Equal' || event.code === 'NumpadAdd') this.zoomIn();
    else if (event.code === 'Minus' || event.code === 'NumpadSubtract') this.zoomOut();
    else return;
    event.preventDefault();
  };
}
