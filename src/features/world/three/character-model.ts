import * as THREE from 'three';
import { AVATAR_IDS, type AvatarId } from '../../../domain/avatar/identity';
import { modelDisposer } from './model-utils';

export interface CharacterModel {
  group: THREE.Group;
  animate(elapsedSeconds: number, moving: boolean, reduceMotion: boolean): void;
  dispose(): void;
}

const OUTFITS = [
  '#bb6558',
  '#518f86',
  '#c3954f',
  '#7a75a0',
  '#6385a1',
  '#909c60',
  '#bc7f9a',
  '#519caa',
  '#ce8053',
  '#707aa4',
  '#58956b',
  '#a46771',
];
const SKIN = ['#e4b18b', '#af7658', '#f1c9a5', '#79513e'];
const HAIR = ['#3e302b', '#76503b', '#ce9a56', '#292f36'];

/** An original little explorer, facing +Z. Position and heading belong to the engine. */
export function createCharacterModel(avatarId: AvatarId, local = false): CharacterModel {
  const group = new THREE.Group();
  group.name = `explorer-${avatarId}`;
  const variant = Math.max(0, AVATAR_IDS.indexOf(avatarId));
  const outfit = OUTFITS[variant] ?? OUTFITS[0]!;
  const skin = SKIN[variant % SKIN.length]!;
  const hair = HAIR[variant % HAIR.length]!;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const round = new THREE.IcosahedronGeometry(1, 1);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  function part(
    parent: THREE.Group,
    color: string,
    position: [number, number, number],
    size: [number, number, number],
    rounded = false,
  ) {
    let material = materials.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });
      materials.set(color, material);
    }
    const mesh = new THREE.Mesh(rounded ? round : box, material);
    mesh.position.set(...position);
    mesh.scale.set(...size);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  part(group, outfit, [0, 22, 0], [13.5, 15, 9.5]);
  part(group, '#3b4952', [0, 14.5, 0], [12, 5, 8]);
  part(group, '#eed2a0', [0, 28.7, 0.5], [14, 3, 10]);
  part(group, '#eed2a0', [4, 23.5, 5.3], [3.4, 8, 1.7]);
  part(group, skin, [0, 34.4, 0.5], [7.6, 7.4, 6.6], true);
  part(group, hair, [0, 38, -1], [7.7, 4.4, 6.3], true);
  part(group, hair, [-5.5, 35.8, 3], [4.2, 5.2, 2.4], true);
  part(group, hair, [5.4, 35.9, 1.5], [2.6, 4.1, 3], true);
  part(group, '#252b2d', [-2.6, 34.7, 6.35], [1.3, 1.8, 0.8]);
  part(group, '#252b2d', [2.6, 34.7, 6.35], [1.3, 1.8, 0.8]);
  part(group, '#fff3d7', [-2.8, 35.1, 6.8], [0.4, 0.5, 0.25]);
  part(group, '#fff3d7', [2.4, 35.1, 6.8], [0.4, 0.5, 0.25]);
  part(group, skin, [0, 32.8, 6.5], [1.3, 1.6, 1.7], true);
  part(group, '#a05e49', [0, 31.3, 6.1], [1.8, 0.6, 0.5]);
  part(group, '#826849', [0, 22, -6], [11, 12, 5]);
  part(group, '#b9986b', [0, 25.7, -8.7], [11.2, 4.5, 1.2]);
  part(group, '#c8b48e', [-4.5, 22.2, 5], [1.6, 11, 1]);
  part(group, '#c8b48e', [4.5, 22.2, 5], [1.6, 11, 1]);
  part(group, '#d7bf91', [0, 21.5, -9], [2, 2.6, 0.7]);

  function limb(x: number, y: number, leg: boolean): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    group.add(pivot);
    if (leg) {
      part(pivot, '#3b4952', [0, -4.5, 0], [4.6, 9, 5.5]);
      part(pivot, '#44392f', [0, -10.3, 1.4], [5.6, 4, 8]);
    } else {
      part(pivot, outfit, [0, -3.6, 0], [4.5, 7.2, 6]);
      part(pivot, skin, [0, -8.4, 0], [2.6, 3.4, 2.8], true);
    }
    return pivot;
  }
  const leftArm = limb(-9, 26.5, false);
  const rightArm = limb(9, 26.5, false);
  const leftLeg = limb(-3.4, 12.3, true);
  const rightLeg = limb(3.4, 12.3, true);

  if (local) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(11.5, 13.4, 40),
      new THREE.MeshBasicMaterial({
        color: '#f3d28d',
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    group.add(ring);
  }

  return {
    group,
    animate(elapsedSeconds, moving, reduceMotion) {
      const swing = moving && !reduceMotion ? Math.sin(elapsedSeconds * 12) * 0.62 : 0;
      leftArm.rotation.x = swing * 0.7;
      rightArm.rotation.x = -swing * 0.7;
      leftLeg.rotation.x = -swing;
      rightLeg.rotation.x = swing;
    },
    dispose: modelDisposer(group),
  };
}
