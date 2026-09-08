// @ts-expect-error Vitest reads the checked-in GLBs through Node.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAnimatedCharacter,
  type AnimatedCharacterModel,
} from '../../../src/features/world/three/animated-character';

const characters: AnimatedCharacterModel[] = [];

function character(avatarId: 'avatar-01' | 'avatar-02' | 'avatar-03', local = false) {
  const model = createAnimatedCharacter(avatarId, local);
  characters.push(model);
  return model;
}

function assetResponse(url: string): Response {
  return new Response(new Uint8Array(readFileSync(`public${url}`)), {
    headers: { 'Content-Type': 'model/gltf-binary' },
  });
}

function skins(model: AnimatedCharacterModel): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  model.group.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) meshes.push(object);
  });
  return meshes;
}

function pose(model: AnimatedCharacterModel): number[] {
  const values: number[] = [];
  model.group.traverse((object) => {
    if (object instanceof THREE.Bone) {
      values.push(...object.position.toArray(), ...object.quaternion.toArray());
    }
  });
  return values;
}

async function ready(model: AnimatedCharacterModel) {
  await vi.waitFor(() => expect(skins(model).length).toBeGreaterThan(0));
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => assetResponse(url)),
  );
});

afterEach(() => {
  for (const model of characters.splice(0)) model.dispose();
  vi.unstubAllGlobals();
});

describe('self-hosted animated characters', () => {
  it.each(['avatar-01', 'avatar-02'] as const)(
    'replaces the immediate fallback for %s with a grounded, consistently sized rig',
    async (avatarId) => {
      const model = character(avatarId, true);
      expect(new THREE.Box3().setFromObject(model.group).max.y).toBeGreaterThan(30);
      expect(skins(model)).toHaveLength(0);
      const marker = model.group.children.find(
        (object) => object instanceof THREE.Mesh && object.geometry instanceof THREE.RingGeometry,
      );
      expect(marker).toBeDefined();

      await ready(model);
      model.group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model.group);
      expect(bounds.min.y).toBeCloseTo(0, 4);
      expect(bounds.max.y).toBeCloseTo(48, 4);
      expect(model.group.children).toContain(marker);
      expect(model.group.position.toArray()).toEqual([0, 0, 0]);
    },
  );

  it('plays idle, walking, and running independently while reduced motion freezes neutral idle', async () => {
    const first = character('avatar-01');
    const second = character('avatar-03');
    await Promise.all([ready(first), ready(second)]);
    expect(skins(first)[0]!.skeleton).not.toBe(skins(second)[0]!.skeleton);
    const secondResting = pose(second);

    first.animate(0, false, false);
    first.animate(0.1, false, false);
    expect(pose(first)).not.toEqual(secondResting);
    first.animate(0.2, true, false);
    first.animate(0.3, true, false);
    first.animate(0.4, true, false);
    const walking = pose(first);
    first.animate(0.5, true, false, true);
    first.animate(0.6, true, false, true);
    first.animate(0.7, true, false, true);
    expect(pose(first)).not.toEqual(walking);
    expect(pose(second)).toEqual(secondResting);

    first.animate(0.8, true, true, true);
    const reducedPose = pose(first);
    expect(reducedPose).toEqual(secondResting);
    first.animate(2, false, true);
    first.animate(20, true, true);
    expect(pose(first)).toEqual(reducedPose);
    first.animate(20.1, true, false);
    first.animate(20.2, true, false);
    expect(pose(first)).not.toEqual(reducedPose);
  });

  it('keeps shared GPU resources alive until the last character releases the template', async () => {
    const first = character('avatar-01');
    const second = character('avatar-03');
    await Promise.all([ready(first), ready(second)]);
    const mesh = skins(first)[0]!;
    expect(mesh.geometry).toBe(skins(second)[0]!.geometry);
    let disposals = 0;
    mesh.geometry.addEventListener('dispose', () => disposals++);

    first.dispose();
    first.dispose();
    expect(disposals).toBe(0);
    second.animate(0, true, false);
    second.animate(0.1, true, false);
    expect(pose(second).every(Number.isFinite)).toBe(true);
    second.dispose();
    second.dispose();
    expect(disposals).toBe(1);
  });

  it('aborts the final pending request and never attaches a model after disposal', async () => {
    let resolveRequest!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options: RequestInit) => {
        signal = options.signal ?? undefined;
        return new Promise<Response>((resolve) => (resolveRequest = resolve));
      }),
    );
    const first = character('avatar-01');
    const second = character('avatar-03');
    first.dispose();
    expect(signal?.aborted).toBe(false);
    second.dispose();
    expect(signal?.aborted).toBe(true);
    resolveRequest(assetResponse('/game-assets/three-characters/animated-woman.glb'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(first.group.children).toHaveLength(0);
    expect(second.group.children).toHaveLength(0);
  });

  it('leaves the fallback usable after a network failure and allows the next character to retry', async () => {
    const fetchAsset = vi.fn(async (url: string) => assetResponse(url));
    fetchAsset.mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchAsset);
    const first = character('avatar-01');
    await new Promise((resolve) => setTimeout(resolve, 0));
    first.animate(0.2, true, false);
    expect(new THREE.Box3().setFromObject(first.group).max.y).toBeGreaterThan(30);
    expect(skins(first)).toHaveLength(0);

    const second = character('avatar-03');
    await ready(second);
    expect(skins(first)).toHaveLength(0);
  });
});
