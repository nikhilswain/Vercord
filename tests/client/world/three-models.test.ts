import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { AVATAR_IDS } from '../../../src/domain/avatar/identity';
import { createRoomWorld } from '../../../src/features/world/engine/room-world';
import { createVillageWorld } from '../../../src/features/world/engine/village-world';
import type { WorldDefinition } from '../../../src/features/world/engine/types';
import { createCharacterModel } from '../../../src/features/world/three/character-model';
import { createWorldModel } from '../../../src/features/world/three/world-model';
import { createLayoutSnapshotFixture } from '../../fixtures/map/map-snapshots';

function meshes(group: THREE.Group): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) result.push(object);
  });
  return result;
}

function expectVisibleObstacles(world: WorldDefinition, group: THREE.Group) {
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const bounds of world.colliders) {
    ray.set(
      new THREE.Vector3(bounds.x + bounds.width / 2, 500, bounds.y + bounds.height / 2),
      new THREE.Vector3(0, -1, 0),
    );
    const hits = ray.intersectObject(group, true);
    expect(
      hits.some((hit) => hit.point.y > 4),
      JSON.stringify(bounds),
    ).toBe(true);
  }
}

function expectFiniteGeometry(group: THREE.Group) {
  for (const mesh of meshes(group)) {
    const positions = mesh.geometry.getAttribute('position');
    expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
  }
}

describe('procedural 3D worlds', () => {
  it('puts visible scenery over every exterior collision footprint without WebGL', () => {
    const world = createVillageWorld(createLayoutSnapshotFixture([7, 0, 3]));
    const model = createWorldModel(world);
    expectVisibleObstacles(world, model.group);
    expectFiniteGeometry(model.group);
    expect(
      model.labels.filter((label) => label.kind === 'room').map((label) => label.roomKey),
    ).toEqual(world.portals.map((portal) => portal.room.key));
    model.dispose();
  });

  it('represents collision footprints in each room layout and leaves the exit clear', () => {
    const village = createVillageWorld(createLayoutSnapshotFixture([7]));
    for (const portal of village.portals) {
      const world = createRoomWorld(portal, village.theme);
      const model = createWorldModel(world);
      expectVisibleObstacles(world, model.group);
      expectFiniteGeometry(model.group);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(256, 500, 344),
        new THREE.Vector3(0, -1, 0),
      );
      expect(ray.intersectObject(model.group, true).every((hit) => hit.point.y < 4)).toBe(true);
      model.dispose();
    }
  });

  it('batches a large village and disposes each owned GPU resource only once', () => {
    const world = createVillageWorld(createLayoutSnapshotFixture([25, 25, 25, 25]));
    const model = createWorldModel(world);
    expect(meshes(model.group).length).toBeLessThan(150);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const mesh of meshes(model.group)) {
      resources.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        resources.add(material);
      }
    }
    expect(resources.size).toBeGreaterThan(0);
    const disposed = new Map<object, number>();
    for (const resource of resources) {
      resource.addEventListener('dispose', () =>
        disposed.set(resource, (disposed.get(resource) ?? 0) + 1),
      );
    }
    model.dispose();
    model.dispose();
    expect([...resources].every((resource) => disposed.get(resource) === 1)).toBe(true);
  });
});

describe('procedural explorers', () => {
  it('builds every avatar at a consistent scale and animates only walking limbs', () => {
    for (const avatarId of AVATAR_IDS) {
      const model = createCharacterModel(avatarId, true);
      model.group.updateMatrixWorld(true);
      const height = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3()).y;
      expect(height).toBeGreaterThan(38);
      expect(height).toBeLessThan(48);
      expectFiniteGeometry(model.group);
      const pose = () => {
        const rotations: number[] = [];
        model.group.traverse((object) =>
          rotations.push(object.rotation.x, object.rotation.y, object.rotation.z),
        );
        return rotations;
      };
      model.animate(0, false, false);
      const resting = pose();
      model.animate(0.2, true, false);
      expect(pose()).not.toEqual(resting);
      model.animate(0.4, true, true);
      expect(pose()).toEqual(resting);
      model.animate(10, false, false);
      expect(pose()).toEqual(resting);
      expect(model.group.position.toArray()).toEqual([0, 0, 0]);
      model.dispose();
      model.dispose();
    }
  });
});
