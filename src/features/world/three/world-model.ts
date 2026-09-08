import * as THREE from 'three';
import type {
  Rect,
  WorldDefinition,
  WorldPortal,
  WorldProp,
  WorldTileStamp,
} from '../engine/types';
import { ModelBatch, modelDisposer, roofGeometry } from './model-utils';

export interface WorldModel {
  group: THREE.Group;
  labels: Array<{
    position: THREE.Vector3;
    text: string;
    kind: 'area' | 'room';
    color: string;
    roomKey?: string;
  }>;
  dispose(): void;
}

const COLOR = {
  grass: '#7c9765',
  grassLight: '#849e6b',
  grassDark: '#718e60',
  earth: '#53694d',
  path: '#c8b795',
  stone: '#b8b8a2',
  stoneEdge: '#929e8c',
  plaster: '#ecdfbd',
  timber: '#78634a',
  timberDark: '#4e5143',
  trim: '#f1e6c9',
  roof: '#ae6b54',
  leaves: '#47765a',
  leavesLight: '#638965',
  leavesDark: '#355f51',
  glow: '#ffda8d',
  glass: '#7caeb1',
  iron: '#4c5a54',
  floor: '#bba27c',
  floorLight: '#c4ae8a',
};

function footprint(item: WorldProp | WorldTileStamp): Rect {
  const width =
    'width' in item
      ? item.width
      : Math.max(1, ...item.tiles.map((row) => row.length)) * item.tileSize;
  const height = 'height' in item ? item.height : item.tiles.length * item.tileSize;
  return {
    x: item.x + (item.hitbox?.x ?? 0),
    y: item.y + (item.hitbox?.y ?? 0),
    width: item.hitbox?.width ?? width,
    height: item.hitbox?.height ?? height,
  };
}

function muted(accent: string): string {
  return `#${new THREE.Color(accent).lerp(new THREE.Color('#9c9b7c'), 0.42).getHexString()}`;
}

function tree(batch: ModelBatch, bounds: Rect, variant: number): void {
  const x = bounds.x + bounds.width / 2;
  const z = bounds.y + bounds.height / 2;
  const radius = Math.max(14, Math.min(25, bounds.width * 1.25));
  // The root plinth makes the complete 2D collision footprint visible at ground level.
  batch.box(COLOR.earth, x, 3, z, bounds.width, 6, bounds.height);
  batch.cylinder(COLOR.timber, x, 23, z, 4.5, 7, 46, 6);
  if (variant % 3 === 0) {
    batch.cylinder(COLOR.leavesDark, x, 51, z, 0, radius, 47, 7);
    batch.cylinder(COLOR.leaves, x, 68, z, 0, radius * 0.7, 38, 7);
  } else {
    batch.foliage(
      variant % 3 === 1 ? COLOR.leaves : COLOR.leavesLight,
      x,
      59,
      z,
      radius,
      28,
      radius * 0.92,
    );
    batch.foliage(COLOR.leavesLight, x - radius * 0.48, 57, z + 3, radius * 0.55, 16, radius * 0.6);
  }
}

function lantern(batch: ModelBatch, x: number, z: number, baseHeight = 0): void {
  batch.cylinder(COLOR.iron, x, baseHeight + 20, z, 1.5, 2, 40, 6);
  batch.box(COLOR.iron, x, baseHeight + 41, z, 9, 2, 9);
  batch.add(
    new THREE.BoxGeometry(6, 8, 6),
    COLOR.glow,
    [x, baseHeight + 46, z],
    [1, 1, 1],
    [0, 0, 0],
    true,
  );
  batch.cylinder(COLOR.iron, x, baseHeight + 52, z, 0, 7, 5, 4);
}

function building(
  batch: ModelBatch,
  world: WorldDefinition,
  portal: WorldPortal,
  labels: WorldModel['labels'],
): void {
  const styles = world.theme.exterior?.buildings ?? [];
  const styleIndex = (portal.buildingStyle ?? 0) % Math.max(1, styles.length);
  const style = styles[styleIndex];
  const tile = world.theme.worldTileSize;
  const width = Math.max(1, ...(style?.tiles.map((row) => row.length) ?? [3])) * tile;
  const depth = (style?.tiles.length ?? 4) * tile;
  const x = portal.x - ((style?.doorColumn ?? 1) + 0.5) * tile + 5;
  const z = portal.y - depth + 5;
  const w = width - 10;
  const d = depth - 29;
  const cx = x + w / 2;
  const cz = z + d / 2;
  const front = z + d;
  const height = styleIndex > 1 ? 60 : 54;
  const accent = muted(portal.accent);
  const roofColor = styleIndex % 2 === 0 ? '#596f77' : COLOR.roof;
  batch.box(COLOR.stoneEdge, cx, 4, cz, w, 8, d);
  batch.box(COLOR.plaster, cx, height / 2 + 4, cz, w, height - 8, d);
  batch.box(COLOR.trim, cx, height - 3, cz, w + 2, 6, d + 2);
  for (const side of [-1, 1]) {
    batch.box(COLOR.timber, cx + side * (w / 2 - 4), height / 2, front + 0.5, 6, height, 3);
  }
  batch.add(roofGeometry(w + 14, d + 14, 35), roofColor, [cx, height, cz]);
  batch.box(roofColor, cx, height + 35, cz, 5, 3, d + 18);
  batch.box(COLOR.stone, cx + w * 0.28, height + 27, cz - d * 0.22, 16, 32, 18);
  batch.box(COLOR.trim, cx + w * 0.28, height + 44, cz - d * 0.22, 20, 4, 22);
  batch.box(COLOR.timberDark, portal.x, 20, front + 1, 28, 38, 3);
  batch.box(COLOR.timber, portal.x, 19, front + 3, 23, 34, 2);
  batch.box(accent, portal.x, 28, front + 4.2, 17, 9, 0.8);
  batch.cylinder(COLOR.glow, portal.x + 7, 18, front + 5, 1.3, 1.3, 2, 6);
  batch.add(roofGeometry(42, 23, 10), accent, [portal.x, 40, front + 7]);
  for (const wx of [portal.x - 39, portal.x + 39]) {
    if (wx < x + 18 || wx > x + w - 18) continue;
    batch.box(COLOR.trim, wx, 30, front + 1.5, 23, 25, 3);
    batch.box(COLOR.glass, wx, 30, front + 3.2, 17, 19, 0.8);
    batch.box(COLOR.trim, wx, 30, front + 4, 2, 20, 1.5);
    batch.box(COLOR.trim, wx, 30, front + 4, 18, 2, 1.5);
    batch.box(accent, wx, 16.5, front + 4, 27, 5, 7);
    batch.box(COLOR.leaves, wx, 19, front + 4, 24, 3, 6);
  }
  // A low, traversable threshold leads to the existing portal point.
  batch.ground(COLOR.stone, portal.x, front + 12, 39, 25, 0.35);
  lantern(batch, x + w - 7, front - 5);
  labels.push({
    position: new THREE.Vector3(cx, height + 50, cz),
    text: portal.room.label,
    kind: 'room',
    color: portal.accent,
    roomKey: portal.room.key,
  });
}

function fountain(batch: ModelBatch, bounds: Rect): void {
  const x = bounds.x + bounds.width / 2;
  const z = bounds.y + bounds.height / 2;
  batch.box(COLOR.stoneEdge, x, 5, z, bounds.width, 10, bounds.height);
  batch.box(COLOR.stone, x, 12, z, bounds.width * 0.95, 5, bounds.height * 0.95);
  batch.box(COLOR.glass, x, 15, z, bounds.width * 0.73, 1, bounds.height * 0.68);
  batch.cylinder(COLOR.stone, x, 23, z, 2, 4, 20, 8);
  batch.cylinder(COLOR.stone, x, 32, z, 7, 3, 4, 8);
}

function scenery(batch: ModelBatch, stamp: WorldTileStamp, index: number): void {
  const bounds = footprint(stamp);
  const x = bounds.x + bounds.width / 2;
  const z = bounds.y + bounds.height / 2;
  const tile = stamp.tiles[0]?.[0];
  if (tile === 3 || tile === 4 || tile === 5) {
    tree(batch, bounds, tile - 3);
  } else if (tile === 104) {
    fountain(batch, bounds);
  } else if (tile === 80) {
    for (let dx = -bounds.width / 2 + 5; dx < bounds.width / 2; dx += 27) {
      batch.box(COLOR.timber, x + dx, 11, z, 5, 22, 5);
    }
    batch.box(COLOR.timber, x, 8, z, bounds.width, 4, 4);
    batch.box(COLOR.timber, x, 17, z, bounds.width, 4, 4);
  } else if (tile === 83 || tile === 128 || tile === 95) {
    batch.box(COLOR.timber, x, 14, z, 4, 28, 4);
    batch.box(tile === 128 ? COLOR.roof : COLOR.timberDark, x, 27, z, 24, 16, 7);
    batch.box(COLOR.trim, x, 27, z + 4, 14, 2, 1);
  } else if (tile === 29) {
    batch.cylinder(COLOR.trim, x, 3.5, z, 1.7, 2.5, 7, 6);
    batch.foliage(COLOR.roof, x, 7, z, 6, 3, 6);
  } else if (tile === 92 || tile === 106) {
    batch.cylinder(COLOR.timber, x, 7, z, 10, 13, 14, 7);
    batch.cylinder(COLOR.floorLight, x, 14.2, z, 8, 8, 0.5, 7);
  } else if (tile === 94 || tile === 130 || tile === 131) {
    const color = tile === 94 ? '#baaa66' : COLOR.timber;
    batch.box(color, x, 10, z, 26, 20, 23);
    batch.box(COLOR.timberDark, x, 10, z + 12, 3, 21, 1.5);
    batch.box(COLOR.timberDark, x, 10, z - 12, 3, 21, 1.5);
  } else if (stamp.solid) {
    batch.foliage(
      index % 2 ? COLOR.stone : COLOR.stoneEdge,
      x,
      10,
      z,
      bounds.width / 2,
      14,
      bounds.height / 2,
    );
  }
}

function propModel(batch: ModelBatch, prop: WorldProp, accent: string, wallFront: number): void {
  const bounds = footprint(prop);
  const x = bounds.x + bounds.width / 2;
  const z = bounds.y + bounds.height / 2;
  const w = bounds.width;
  const d = bounds.height;
  const fabric = prop.tint ?? accent;
  const legHeight = 17;
  switch (prop.kind) {
    case 'rug':
    case 'blueRug':
      batch.ground(fabric, x, z, w, d, 0.18);
      batch.ground(COLOR.trim, x, z, w - 6, d - 6, 0.19);
      batch.ground(fabric, x, z, w - 9, d - 9, 0.2);
      break;
    case 'desk':
    case 'table':
      batch.box(COLOR.timber, x, legHeight + 2, z, w, 4, d);
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          batch.box(
            COLOR.timberDark,
            x + side * (w / 2 - 3),
            legHeight / 2,
            z + end * (d / 2 - 3),
            3,
            legHeight,
            3,
          );
        }
      }
      if (prop.kind === 'desk') {
        batch.box(COLOR.trim, x, 21.5, z, w * 0.4, 1, d * 0.55);
        batch.box(accent, x - w * 0.25, 23, z - d * 0.18, 4, 4, 4);
      } else {
        batch.cylinder(COLOR.roof, x, 23, z, 2.5, 2, 4, 7);
        batch.foliage(COLOR.leaves, x, 28, z, 4, 5, 3);
      }
      break;
    case 'armchair':
    case 'chair':
    case 'sofa':
    case 'bench': {
      const cushion = prop.kind === 'chair' || prop.kind === 'bench' ? COLOR.timber : fabric;
      batch.box(COLOR.timberDark, x, 5, z, w * 0.83, 10, d * 0.8);
      batch.box(cushion, x, 12, z, w, 5, d);
      batch.box(cushion, x, 20, z - d / 2 + 2, w, 15, 4);
      if (prop.kind === 'armchair' || prop.kind === 'sofa') {
        batch.box(cushion, x - w / 2 + 2, 16, z, 4, 9, d);
        batch.box(cushion, x + w / 2 - 2, 16, z, 4, 9, d);
      }
      break;
    }
    case 'bookshelf':
      batch.box(COLOR.timberDark, x, 22, z, w, 44, d);
      for (const level of [6, 19, 32]) {
        batch.box(COLOR.floorLight, x, level, z + 1, w - 2, 2, d);
        for (let book = 0; book < 5; book += 1) {
          batch.box(
            [accent, COLOR.roof, COLOR.glass, COLOR.trim, COLOR.leaves][book]!,
            x - w / 2 + 4 + (book * (w - 7)) / 5,
            level + 6,
            z + d / 2 + 0.5,
            (w - 8) / 6,
            8 + (book % 3),
            2,
          );
        }
      }
      batch.box(COLOR.timber, x, 45, z, w + 1, 3, d + 1);
      break;
    case 'planter':
      batch.box(COLOR.roof, x, 6, z, w, 12, d);
      batch.box(COLOR.earth, x, 12.3, z, w * 0.8, 1, d * 0.8);
      batch.cylinder(COLOR.timber, x, 19, z, 1.5, 2, 17, 6);
      batch.foliage(COLOR.leaves, x, 29, z, Math.min(12, w * 0.65), 15, Math.min(11, d * 0.7));
      batch.foliage(COLOR.leavesLight, x - 5, 28, z, 7, 9, 7);
      break;
    case 'window':
      batch.box(COLOR.timber, x, 41, wallFront + 1, 30, 33, 3);
      batch.box(COLOR.glass, x, 41, wallFront + 3, 24, 27, 1);
      batch.box(COLOR.trim, x, 41, wallFront + 4, 2, 28, 1);
      batch.box(COLOR.trim, x, 41, wallFront + 4, 25, 2, 1);
      batch.box(COLOR.trim, x, 24, wallFront + 3, 35, 3, 7);
      break;
    case 'curtain':
      batch.box(COLOR.timberDark, x, 60, wallFront + 3, 29, 2, 3);
      batch.box(fabric, x, 42, wallFront + 3, 23, 34, 2);
      batch.box(COLOR.trim, x, 31, wallFront + 4.5, 24, 2, 1);
      break;
    case 'art':
      batch.box(COLOR.timber, x, 43, wallFront + 1, 24, 27, 3);
      batch.box(COLOR.trim, x, 43, wallFront + 3, 19, 22, 1);
      batch.box(accent, x - 3, 42, wallFront + 4, 6, 13, 0.8);
      batch.box(COLOR.leaves, x + 4, 39, wallFront + 4, 6, 7, 0.8);
      break;
    case 'screen':
      batch.box(COLOR.timberDark, x, 39, wallFront + 2, w, 44, 3);
      batch.box('#314d57', x, 39, wallFront + 4, w - 7, 37, 1);
      batch.box(fabric, x - w * 0.25, 42, wallFront + 5, w * 0.24, 2, 0.5);
      batch.box(COLOR.glass, x - w * 0.15, 36, wallFront + 5, w * 0.44, 2, 0.5);
      break;
    case 'tree':
      tree(batch, bounds, 1);
      break;
    case 'fountain':
      fountain(batch, bounds);
      break;
    case 'building':
      batch.box(COLOR.plaster, x, 24, z, w, 48, d);
      batch.add(roofGeometry(w + 8, d + 8, 23), COLOR.roof, [x, 48, z]);
      break;
  }
}

function exterior(batch: ModelBatch, world: WorldDefinition, labels: WorldModel['labels']): void {
  const bounds = world.bounds;
  batch.box(
    COLOR.earth,
    bounds.x + bounds.width / 2,
    -8,
    bounds.y + bounds.height / 2,
    bounds.width + 8,
    16,
    bounds.height + 8,
  );
  batch.ground(
    COLOR.grass,
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
    bounds.width,
    bounds.height,
    0.02,
  );
  for (const layer of world.tileLayers) {
    const b = layer.bounds;
    const x = b.x + b.width / 2;
    const z = b.y + b.height / 2;
    if (layer.tileIndex === 1 || layer.tileIndex === 2) {
      batch.add(
        new THREE.CircleGeometry(1, 7),
        layer.tileIndex === 1 ? COLOR.grassLight : COLOR.grassDark,
        [x, 0.07, z],
        [b.width * 0.68, b.height * 0.58, 1],
        [-Math.PI / 2, 0, 0],
        false,
        7 + layer.tileIndex,
      );
    } else if (layer.tileIndex === 43) {
      batch.ground(COLOR.stoneEdge, x, z, b.width, b.height, 0.12);
      batch.ground(COLOR.stone, x, z, b.width - 2, b.height - 2, 0.15);
    } else {
      batch.ground(COLOR.path, x, z, b.width, b.height, 0.1);
    }
  }
  world.tileStamps.forEach((stamp, index) => scenery(batch, stamp, index));
  for (const portal of world.portals) building(batch, world, portal, labels);
  for (const area of world.areas) {
    labels.push({
      position: new THREE.Vector3(area.bounds.x + area.bounds.width / 2, 5, area.bounds.y + 38),
      text: area.label,
      kind: 'area',
      color: area.accent,
    });
  }
  for (const prop of world.props) propModel(batch, prop, COLOR.roof, 0);
}

function interior(batch: ModelBatch, world: WorldDefinition, labels: WorldModel['labels']): void {
  const bounds = world.bounds;
  const accent = muted(world.areas[0]?.accent ?? '#9284f7');
  const backWall = world.colliders[0];
  const wallFront = backWall ? backWall.y + backWall.height : 64;
  batch.box(
    COLOR.timberDark,
    bounds.x + bounds.width / 2,
    -6,
    bounds.y + bounds.height / 2,
    bounds.width,
    12,
    bounds.height,
  );
  const plankWidth = 24;
  for (let x = bounds.x; x < bounds.x + bounds.width; x += plankWidth) {
    const width = Math.min(plankWidth, bounds.x + bounds.width - x);
    batch.ground(
      Math.round(x / plankWidth) % 3 ? COLOR.floor : COLOR.floorLight,
      x + width / 2,
      bounds.y + bounds.height / 2,
      width - 0.7,
      bounds.height,
      0.03,
    );
  }
  // Preserve the five shell collider footprints; cut front and side walls down for visibility.
  world.colliders.slice(0, 5).forEach((wall, index) => {
    const height = index === 0 ? 65 : index < 3 ? 14 : 9;
    const x = wall.x + wall.width / 2;
    const z = wall.y + wall.height / 2;
    batch.box(COLOR.plaster, x, height / 2, z, wall.width, height, wall.height);
    batch.box(COLOR.timber, x, height + 1, z, wall.width, 2, wall.height);
    batch.box(accent, x, 3, z, wall.width, 6, wall.height);
  });
  for (const prop of world.props) propModel(batch, prop, accent, wallFront);
  lantern(batch, 35, wallFront - 4, 18);
  lantern(batch, bounds.width - 35, wallFront - 4, 18);
  const exit = world.portals[0];
  if (exit) {
    batch.ground(accent, exit.x, bounds.y + bounds.height - 16, 58, 30, 0.2);
    batch.ground(COLOR.trim, exit.x, bounds.y + bounds.height - 24, 20, 2, 0.25);
    batch.ground(COLOR.trim, exit.x, bounds.y + bounds.height - 17, 20, 2, 0.25);
  }
  labels.push({
    position: new THREE.Vector3(bounds.x + bounds.width / 2, 83, wallFront - 10),
    text: world.name,
    kind: 'area',
    color: world.areas[0]?.accent ?? '#d6a15f',
  });
}

export function createWorldModel(world: WorldDefinition): WorldModel {
  const batch = new ModelBatch();
  const labels: WorldModel['labels'] = [];
  if (world.environment === 'interior') interior(batch, world, labels);
  else exterior(batch, world, labels);
  const group = batch.finish();
  group.name = `${world.environment}-model`;
  return { group, labels, dispose: modelDisposer(group) };
}
