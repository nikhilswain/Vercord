import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Triple = [number, number, number];

/** Static meshes are merged by surface, keeping draw calls independent of map size. */
export class ModelBatch {
  private readonly surfaces = new Map<string, THREE.MeshStandardMaterial>();
  private readonly parts = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();

  material(color: string, glow = false, groundLayer = 0): THREE.MeshStandardMaterial {
    const key = `${color}:${glow}:${groundLayer}`;
    let material = this.surfaces.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: 0.88,
        emissive: glow ? color : '#000000',
        emissiveIntensity: glow ? 0.65 : 0,
        // Thin ground overlays need a depth bias when the camera frames a whole village.
        // Keep these materials separate from upright props sharing the same color.
        polygonOffset: groundLayer > 0,
        polygonOffsetFactor: -groundLayer,
        polygonOffsetUnits: -groundLayer,
      });
      this.surfaces.set(key, material);
    }
    return material;
  }

  add(
    geometry: THREE.BufferGeometry,
    color: string,
    position: Triple,
    scale: Triple = [1, 1, 1],
    rotation: Triple = [0, 0, 0],
    glow = false,
    groundLayer = 0,
  ): void {
    const material = this.material(color, glow, groundLayer);
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    if (part !== geometry) geometry.dispose();
    for (const attribute of Object.keys(part.attributes)) {
      if (attribute !== 'position' && attribute !== 'normal') part.deleteAttribute(attribute);
    }
    part.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
      ),
    );
    const entries = this.parts.get(material) ?? [];
    entries.push(part);
    this.parts.set(material, entries);
  }

  box(
    color: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
  ): void {
    this.add(new THREE.BoxGeometry(width, height, depth), color, [x, y, z]);
  }

  cylinder(
    color: string,
    x: number,
    y: number,
    z: number,
    top: number,
    bottom: number,
    height: number,
    segments = 8,
  ): void {
    this.add(new THREE.CylinderGeometry(top, bottom, height, segments), color, [x, y, z]);
  }

  foliage(
    color: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
  ): void {
    this.add(new THREE.IcosahedronGeometry(1, 1), color, [x, y, z], [width, height, depth]);
  }

  ground(color: string, x: number, z: number, width: number, depth: number, elevation = 0.1): void {
    this.add(
      new THREE.PlaneGeometry(width, depth),
      color,
      [x, elevation, z],
      [1, 1, 1],
      [-Math.PI / 2, 0, 0],
      false,
      Math.round(elevation * 100) + 1,
    );
  }

  finish(): THREE.Group {
    const group = new THREE.Group();
    for (const [material, parts] of this.parts) {
      const geometry = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      if (!geometry) throw new Error('Unable to merge procedural scenery geometry.');
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = !material.polygonOffset;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

export function modelDisposer(group: THREE.Group): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  };
}

/** Gable ridge runs along Z, with the triangular facade facing the doorway. */
export function roofGeometry(width: number, depth: number, rise: number): THREE.BufferGeometry {
  const w = width / 2;
  const d = depth / 2;
  const a: Triple = [-w, 0, d];
  const b: Triple = [w, 0, d];
  const c: Triple = [0, rise, d];
  const e: Triple = [-w, 0, -d];
  const f: Triple = [w, 0, -d];
  const g: Triple = [0, rise, -d];
  const points = [a, b, c, f, e, g, e, a, c, e, c, g, b, f, g, b, g, c, a, e, f, a, f, b];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}
