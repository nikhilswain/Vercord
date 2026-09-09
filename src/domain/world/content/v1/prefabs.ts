import { at, block, ground, makeSample, object, signpost } from './builder';
import { norseProp, NORSE_TEXTURES } from './norse-props';
import type { Point, RpgLandmark, RpgSample } from './types';
import type { WorldPrefabId } from '../../catalog/prefabs';

export type SettlementPrefab = WorldPrefabId;
export interface AuthoredPrefab {
  key: SettlementPrefab;
  scene: RpgSample;
  /** Authored local paths terminate at the southern plot frontage. */
  approaches: Point[][];
}

export function addTree(
  sample: RpgSample,
  x: number,
  y: number,
  norse: boolean,
  variant = 'oak',
): void {
  const frame = norse ? 'pine' : variant;
  const height = frame === 'pine' ? 3.5 : frame === 'tallOak' ? 4 : 3;
  object(sample, 'lpc-trees', frame, x - 1.5, y - height, y);
  if (norse) sample.stamps[sample.stamps.length - 1]!.tint = 0xb8c8b8;
  block(sample, x - 0.32, y - 0.35, 0.64, 0.45);
}

function addLandmark(
  sample: RpgSample,
  id: string,
  name: string,
  point: Point,
  description: string,
  kind: RpgLandmark['kind'] = 'view',
): Point {
  sample.landmarks.push({
    id,
    name,
    ...point,
    description,
    radius: 64,
    kind,
    ...(kind === 'portal' ? { destination: 'dungeon' as const } : {}),
  });
  return point;
}

/** Unrotated modules retain the calibrated art dimensions, ground edges and doorway aprons. */
export function createPrefab(key: SettlementPrefab, norse: boolean): AuthoredPrefab {
  const scene = makeSample(norse ? 'norse' : 'village', key, key, at(0, 0));
  if (norse) scene.textures = [...scene.textures, ...NORSE_TEXTURES];
  let entrance: Point;
  let approaches: Point[][] | undefined;
  switch (key) {
    case 'hall': {
      object(scene, 'lpc-house-hall', 'main', 1, 1, 6.7);
      object(scene, 'lpc-house-hall', 'wing', 6, 1, 5.9);
      object(scene, 'lpc-door-small', 'closed', 3, 5, 6.71);
      block(scene, 2, 3.5, 4, 3.2);
      block(scene, 6, 2.5, 2, 3.4);
      entrance = addLandmark(
        scene,
        'village-hall',
        'The gathering hall',
        at(3.5, 7.8),
        'A hand-lettered notice reads: Soup at sundown. Bring a bowl, a story, or simply yourself. The hall windows glow with the last of the afternoon sun.',
      );
      break;
    }
    case 'brick': {
      object(scene, 'lpc-house-brick', undefined, 2, 1, 7);
      object(scene, 'lpc-door-tall', 'closed', 5, 5, 7.01);
      block(scene, 3, 4, 4, 3);
      entrance = addLandmark(
        scene,
        'willowmere-home',
        'The red-roofed home',
        at(5.5, 8),
        'A warm window looks onto a small garden. Stacked firewood and muddy boots wait by the door.',
      );
      break;
    }
    case 'paneled': {
      object(scene, 'lpc-house-paneled', undefined, 2, 2, 7);
      object(scene, 'lpc-door-small', 'closed', 5.5, 4.5, 7.01);
      block(scene, 2, 4, 5, 3);
      entrance = addLandmark(
        scene,
        'garden-cottage',
        'The gardener’s cottage',
        at(6, 8),
        'Small flowers crowd the cottage walls. Someone has left a watering can beside a neatly swept doorstep.',
      );
      break;
    }
    case 'longhouse':
    case 'cottage':
    case 'smithy': {
      entrance = norseProp(scene, key, key === 'longhouse' ? 1 : 2, 1);
      const names = {
        longhouse: 'The timber longhouse',
        cottage: 'The turf-roofed home',
        smithy: 'The shore smithy',
      };
      const descriptions = {
        longhouse:
          'Carved gables guard a steep shingle roof. Round shields hang beside the door; inside, someone is setting places at a very long table.',
        cottage:
          'Moss grows thick above the rafters. A warm window and a pair of boots by the door say everything about the people who live here.',
        smithy:
          'The forge glows beneath a soot-dark chimney. Boat nails, hinges, and half-mended tools line the workbench.',
      };
      addLandmark(scene, `frosthavn-${key}`, names[key], entrance, descriptions[key]);
      if (key === 'longhouse') {
        norseProp(scene, 'banner', 0, 3);
        norseProp(scene, 'banner', 9, 3);
      }
      if (key === 'smithy') scene.lights.push({ ...at(6, 5), radius: 76, color: 0xeeb267 });
      break;
    }
    case 'grove':
    case 'runes': {
      for (const [x, y] of [
        [1, 4],
        [4, 3],
        [8, 4],
        [1, 8],
        [9, 8],
      ] as const)
        addTree(scene, x, y, norse, x === 4 ? 'oldOak' : 'tallOak');
      entrance = key === 'runes' ? norseProp(scene, 'runestone', 4.2, 4) : at(4.8, 7.5);
      addLandmark(
        scene,
        key === 'runes' ? 'frosthavn-runes' : 'listening-grove',
        key === 'runes' ? 'The rune grove' : 'The listening grove',
        entrance,
        key === 'runes'
          ? 'Weather has softened the carved stone, but the marks remain: a crossing, a winter, and the promise to keep a fire for the next traveler.'
          : 'The old oaks lean together around a small clearing. Someone has tucked blue flowers between their roots. For a moment, the whole village sounds very far away.',
        key === 'runes' ? 'sign' : 'view',
      );
      if (!norse)
        for (const [x, y] of [
          [2, 5],
          [7, 5],
          [2, 8],
          [8, 8],
        ] as const)
          ground(scene, 'lpc-flowers', 7, x, y, -30);
      break;
    }
    case 'garden': {
      for (let y = 0; y <= 8; y++)
        for (let x = 2; x <= 8; x++) {
          ground(
            scene,
            'lpc-terrain',
            (y === 0 ? 10 : y === 8 ? 12 : 11) * 16 + (x === 2 ? 0 : x === 8 ? 2 : 1),
            x,
            y,
            -70,
          );
          if (y < 3 || y > 4) block(scene, x, y, 1, 1);
        }
      for (let x = 1; x <= 9; x++)
        ground(scene, 'lpc-bridge', x === 1 ? 'left' : x === 9 ? 'right' : 'deck', x, 2.5, -20);
      block(scene, 1, 2.6, 9, 0.18);
      block(scene, 1, 4.75, 9, 0.18);
      entrance = addLandmark(
        scene,
        'water-garden',
        'The water garden',
        at(5.5, 3.8),
        'The bridge boards are smooth from years of footsteps. Beneath them, clear water threads through the flower beds. Mira says the first lily always opens here.',
      );
      approaches = [
        [at(-1, 11), at(-1, 3.8), entrance],
        [entrance, at(11, 3.8), at(11, 11)],
      ];
      for (const x of [1, 3, 5, 7, 9]) ground(scene, 'lpc-flowers', 3, x, 9, -30);
      break;
    }
    case 'landing': {
      const water = (x: number, y: number) => {
        const inset = y === 3 || y === 10 ? 2 : y === 4 || y === 9 ? 1 : 0;
        return y >= 3 && y <= 10 && x >= inset && x <= 12 - (y <= 4 || y === 10 ? inset : 0);
      };
      for (let y = 3; y <= 10; y++)
        for (let x = 0; x <= 12; x++) {
          if (!water(x, y)) continue;
          ground(scene, 'norse-terrain', 20 + ((x + y) % 4), x, y, -70);
          for (const [dx, dy, frame] of [
            [0, -1, 24],
            [1, 0, 25],
            [0, 1, 26],
            [-1, 0, 27],
          ] as const)
            if (!water(x + dx, y + dy)) ground(scene, 'norse-terrain', frame, x, y, -60);
          if (x >= 4 && x <= 6 && y < 10) ground(scene, 'norse-terrain', 28, x, y, -30);
          else block(scene, x, y, 1, 1);
        }
      block(scene, 4, 4, 0.15, 6);
      block(scene, 6.85, 4, 0.15, 6);
      block(scene, 4, 9.85, 3, 0.15);
      object(scene, 'norse-longboat', undefined, 7.2, 6.1, 8.35);
      entrance = addLandmark(
        scene,
        'frosthavn-landing',
        'The longboat landing',
        at(5.5, 8.5),
        'Cold lake water taps against the piles. The longboat rests alongside, its weathered shields hung above the ripples and its sail bound tight. For now, the far shore can wait.',
      );
      approaches = [[entrance, at(5.5, 1.5), at(-2, 1.5), at(-2, 11)]];
      break;
    }
    case 'vault': {
      for (const x of [2, 3, 6, 7]) {
        for (let y = 0; y < 3; y++) object(scene, 'lpc-walls', (y + 3) * 6 + 1, x, 2 + y, 5);
        block(scene, x, 4, 1, 1);
      }
      for (let x = 4; x < 6; x++)
        for (let y = 3; y < 6; y++) ground(scene, 'lpc-stairs', 'down', x, y, -25);
      object(scene, 'lpc-arch', 'stone', 2.5, 2, 5);
      if (!norse) object(scene, 'lpc-dungeon-details', 'ivy', 2, 2.6, 5.1);
      entrance = addLandmark(
        scene,
        norse ? 'frosthavn-vault' : 'vault-entrance',
        'The Lantern Vault',
        at(5, 6),
        'Warm light rises from the sheltered stone stairs. Follow them down into the Lantern Vault.',
        'portal',
      );
      signpost(scene, 8.5, 7);
      break;
    }
    default: {
      const unsupported: never = key;
      throw new Error(`Unsupported settlement prefab: ${unsupported}`);
    }
  }
  if (['hall', 'brick', 'paneled'].includes(key))
    for (const [x, y] of [
      [2, 7],
      [7, 7],
      [8, 6],
    ] as const)
      ground(scene, 'lpc-flowers', key === 'paneled' ? 5 : 1, x, y, -30);
  return { key, scene, approaches: approaches ?? [[entrance, at(entrance.x / 32, 11)]] };
}
