import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

import { AVATAR_IDS, type AvatarId } from '../../../domain/avatar/identity';
import { createCharacterModel, type CharacterModel } from './character-model';

export interface AnimatedCharacterModel extends CharacterModel {
  animate(
    elapsedSeconds: number,
    moving: boolean,
    reduceMotion: boolean,
    sprinting?: boolean,
  ): void;
}

const ASSETS = [
  '/game-assets/three-characters/animated-woman.glb',
  '/game-assets/three-characters/hoodie-character.glb',
] as const;

interface TemplateEntry {
  users: number;
  controller: AbortController;
  promise: Promise<GLTF>;
  template?: GLTF;
}

const templates = new Map<string, TemplateEntry>();

function disposeSkeletons(root: THREE.Object3D): void {
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
}

/** Geometry and materials belong to the template; each clone owns its skeletons. */
function disposeTemplate(template: GLTF): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  for (const scene of template.scenes) {
    disposeSkeletons(scene);
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    });
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

async function loadTemplate(url: string, signal: AbortSignal): Promise<GLTF> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Character asset request failed: ${response.status}`);
  const data = await response.arrayBuffer();
  signal.throwIfAborted();
  // Both checked-in GLBs are self-contained, with no external buffers or textures.
  return new GLTFLoader().parseAsync(data, '');
}

function acquireTemplate(url: string) {
  let entry = templates.get(url);
  if (!entry) {
    const controller = new AbortController();
    entry = { users: 0, controller, promise: loadTemplate(url, controller.signal) };
    const pending = entry;
    pending.promise = pending.promise.then(
      (template) => {
        if (pending.users === 0) disposeTemplate(template);
        else pending.template = template;
        return template;
      },
      (error: unknown) => {
        // A later character can retry even while an older character uses its fallback.
        if (templates.get(url) === pending) templates.delete(url);
        throw error;
      },
    );
    templates.set(url, entry);
  }
  const owned = entry;
  owned.users++;
  let released = false;
  return {
    ready: owned.promise,
    release() {
      if (released) return;
      released = true;
      if (--owned.users !== 0) return;
      if (templates.get(url) === owned) templates.delete(url);
      owned.controller.abort();
      if (owned.template) disposeTemplate(owned.template);
    },
  };
}

function createRig(template: GLTF) {
  const scene = clone(template.scene);
  const group = new THREE.Group();
  group.name = 'character-rig';
  group.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  const clip = (name: string) =>
    template.animations.find((animation) => animation.name.split('|').at(-1) === name);
  const idleClip = clip('Idle_Neutral') ?? clip('Idle');
  const walkClip = clip('Walk') ?? clip('Run') ?? idleClip;
  const runClip = clip('Run') ?? walkClip;
  const idle = idleClip ? mixer.clipAction(idleClip) : undefined;
  const walk = walkClip ? mixer.clipAction(walkClip) : undefined;
  const run = runClip ? mixer.clipAction(runClip) : undefined;
  let active = idle;
  let reduced = false;
  idle?.play();
  mixer.update(0);
  scene.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(scene);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height <= 0) {
    mixer.stopAllAction();
    mixer.uncacheRoot(scene);
    disposeSkeletons(scene);
    throw new Error('Character asset has no usable geometry.');
  }
  const scale = 48 / height;
  group.scale.setScalar(scale);
  group.position.y = -bounds.min.y * scale;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    // Animated limbs can extend beyond a bounding box measured in neutral idle.
    if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
  });

  return {
    group,
    animate(delta: number, moving: boolean, reduceMotion: boolean, sprinting: boolean) {
      if (reduceMotion) {
        if (!reduced) {
          mixer.stopAllAction();
          idle?.reset().play();
          mixer.update(0);
          active = idle;
        }
        reduced = true;
        return;
      }
      if (reduced) {
        mixer.stopAllAction();
        active = undefined;
        reduced = false;
      }
      const next = moving ? (sprinting ? run : walk) : idle;
      if (next !== active) {
        next?.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        if (active && next) active.crossFadeTo(next, 0.18, false);
        else active?.stop();
        active = next;
      }
      mixer.update(delta);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      disposeSkeletons(scene);
      group.clear();
    },
  };
}

/** Synchronous explorer fallback, replaced by a +Z-facing CC0 rig when ready. */
export function createAnimatedCharacter(avatarId: AvatarId, local = false): AnimatedCharacterModel {
  const group = new THREE.Group();
  group.name = `animated-${avatarId}`;
  let fallback: CharacterModel | undefined = createCharacterModel(avatarId);
  group.add(fallback.group);
  const marker = local
    ? new THREE.Mesh(
        new THREE.RingGeometry(11.5, 13.4, 40),
        new THREE.MeshBasicMaterial({
          color: '#f3d28d',
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      )
    : undefined;
  if (marker) {
    marker.name = 'local-character-marker';
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.3;
    group.add(marker);
  }

  // Alternating avatar slots are purely visual; they carry no identity information.
  const asset = ASSETS[Math.max(0, AVATAR_IDS.indexOf(avatarId)) % ASSETS.length]!;
  const lease = acquireTemplate(asset);
  let rig: ReturnType<typeof createRig> | undefined;
  let disposed = false;
  let previousElapsed: number | undefined;
  let motion = { moving: false, reduceMotion: false, sprinting: false };

  void lease.ready
    .then((template) => {
      if (disposed) return;
      rig = createRig(template);
      rig.animate(0, motion.moving, motion.reduceMotion, motion.sprinting);
      group.add(rig.group);
      if (fallback) {
        group.remove(fallback.group);
        fallback.dispose();
        fallback = undefined;
      }
    })
    .catch(() => {
      // Offline or invalid assets keep the complete procedural character usable.
      rig?.dispose();
      rig?.group.removeFromParent();
      rig = undefined;
      lease.release();
    });

  return {
    group,
    animate(elapsedSeconds, moving, reduceMotion, sprinting = false) {
      if (disposed) return;
      const delta =
        previousElapsed === undefined
          ? 0
          : Math.max(0, Math.min(0.1, elapsedSeconds - previousElapsed));
      previousElapsed = elapsedSeconds;
      motion = { moving, reduceMotion, sprinting };
      if (rig) rig.animate(delta, moving, reduceMotion, sprinting);
      else fallback?.animate(elapsedSeconds, moving, reduceMotion);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      rig?.dispose();
      fallback?.dispose();
      marker?.geometry.dispose();
      marker?.material.dispose();
      group.clear();
      lease.release();
    },
  };
}
