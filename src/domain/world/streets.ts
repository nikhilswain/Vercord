import { at, cell, ground, makeSample, paint, signpost, TILE } from './content/v1/builder';
import { norseProp, NORSE_TEXTURES } from './content/v1/norse-props';
import { addTree, createPrefab, type SettlementPrefab } from './content/v1/prefabs';
import type { Point, Rect, RpgSample } from './content/v1/types';
import {
  parseWorldDocument,
  type WorldDocument,
  type WorldScene,
  type WorldThemeId,
} from './document';
import { overlaps, sceneIsReachable } from './geometry';
import { seededRandom, shuffled } from './random';
import { getWorldTheme } from './catalog/themes';

export const STREET_HOUSE_COUNT = 6;
const COLUMNS = 48;
const ROWS = 38;

function lane(paths: Set<string>, points: Point[]): void {
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const x = Math.floor(Math.min(from.x, to.x) / TILE);
    const y = Math.floor(Math.min(from.y, to.y) / TILE);
    paint(
      paths,
      x - 1,
      y - 1,
      Math.floor(Math.max(from.x, to.x) / TILE) - x + 3,
      Math.floor(Math.max(from.y, to.y) / TILE) - y + 3,
    );
  }
}

function placePrefab(sample: RpgSample, key: SettlementPrefab, origin: Point, id: string): Point {
  const prefab = createPrefab(key, getWorldTheme(sample.id).generation.style === 'norse-timber');
  const shift = <T extends Point>(point: T): T => ({
    ...point,
    x: point.x + origin.x,
    y: point.y + origin.y,
  });
  sample.stamps.push(
    ...prefab.scene.stamps.map((stamp, index) => ({
      ...shift(stamp),
      depth: stamp.depth === undefined || stamp.depth < 0 ? stamp.depth : stamp.depth + origin.y,
      id: `overworld:${id}:stamp:${index}`,
    })),
  );
  sample.colliders.push(
    ...prefab.scene.colliders.map((box, index) => ({
      ...shift(box),
      id: `overworld:${id}:collider:${index}`,
    })),
  );
  sample.lights.push(
    ...prefab.scene.lights.map((light, index) => ({
      ...shift(light),
      id: `overworld:${id}:light:${index}`,
    })),
  );
  const entrance = { ...shift(prefab.scene.landmarks[0]!), id };
  sample.landmarks.push(entrance);
  return entrance;
}

function paintTerrain(sample: RpgSample, paths: Set<string>): void {
  const { terrain } = getWorldTheme(sample.id).generation;
  // Clip after all scenery is placed: no road tile may overlap a solid base.
  for (const key of paths) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    const box = { ...at(x, y), width: TILE, height: TILE };
    if (
      x < 0 ||
      y < 0 ||
      x >= COLUMNS ||
      y >= ROWS ||
      sample.colliders.some((collider) => overlaps(box, collider))
    )
      paths.delete(key);
  }
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLUMNS; x++) {
      const onPath = paths.has(cell(x, y));
      if (terrain.style === 'cardinal-mask') {
        const mask =
          (paths.has(cell(x, y - 1)) ? 1 : 0) |
          (paths.has(cell(x + 1, y)) ? 2 : 0) |
          (paths.has(cell(x, y + 1)) ? 4 : 0) |
          (paths.has(cell(x - 1, y)) ? 8 : 0);
        ground(sample, terrain.texture, onPath ? mask : 16 + ((x * 17 + y * 31) % 4), x, y);
      } else {
        const edgeX = paths.has(cell(x - 1, y)) ? 0 : paths.has(cell(x + 1, y)) ? 2 : 1;
        const edgeY = paths.has(cell(x, y - 1)) ? 0 : paths.has(cell(x, y + 1)) ? 2 : 1;
        if (onPath || edgeX !== 1 || edgeY !== 1)
          ground(sample, terrain.texture, terrain.roadFrame, x, y);
        if (!onPath)
          ground(
            sample,
            terrain.texture,
            edgeX !== 1 || edgeY !== 1 ? edgeY * 16 + edgeX : (x * 13 + y * 7) % 9 === 0 ? 35 : 17,
            x,
            y,
            -90,
          );
      }
      if (onPath)
        Object.assign(sample.stamps[sample.stamps.length - 1]!, {
          id: `overworld:road:${x}:${y}`,
        });
    }
}

function assembleStreet(theme: WorldThemeId, seed: string): WorldScene {
  const random = seededRandom(seed);
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const { generation } = getWorldTheme(theme);
  const norse = generation.style === 'norse-timber';
  const upperRoad = integer(13, 14);
  const lowerRoad = integer(33, 34);
  const crossLane = integer(16, 17);
  const otherLane = integer(32, 33);
  const sample = makeSample(
    theme,
    generation.streetName,
    generation.streetSubtitle,
    at(9, upperRoad),
  );
  sample.bounds = { x: 0, y: 0, width: COLUMNS * TILE, height: ROWS * TILE };
  sample.background = generation.background;
  if (norse) sample.textures = [...sample.textures, ...NORSE_TEXTURES];
  const paths = new Set<string>();
  const clearances: Rect[] = [];
  lane(paths, [at(3, upperRoad), at(45, upperRoad)]);
  lane(paths, [at(3, lowerRoad), at(45, lowerRoad)]);
  for (const x of [crossLane, otherLane]) lane(paths, [at(x, upperRoad), at(x, lowerRoad)]);

  const houses = Array.from(
    { length: STREET_HOUSE_COUNT },
    (_, index) => generation.housePrefabs[index % generation.housePrefabs.length]!,
  );
  shuffled(houses, random).forEach((key, index) => {
    const x = [2, 18, 34][index % 3]! + integer(0, 1);
    const y = index < 3 ? integer(2, 3) : integer(20, 22);
    const entrance = placePrefab(sample, key, at(x, y), `house:${index}`);
    lane(paths, [entrance, { x: entrance.x, y: (index < 3 ? upperRoad : lowerRoad) * TILE }]);
    clearances.push({ ...at(x - 1, y - 1), width: 12 * TILE, height: 12 * TILE });
    // Side gardens stay beyond each roof and outside the north/south connectors.
    addTree(sample, x + 11, y + integer(6, 7), norse, random() < 0.3 ? 'tallOak' : 'oak');
    if (norse) {
      if (random() < 0.7) norseProp(sample, 'supplies', x + 9, y + 9);
    } else {
      for (const offset of [2, 8])
        ground(sample, 'lpc-flowers', integer(0, 3) * 2 + 1, x + offset, y + 9, -30);
    }
  });

  const square = signpost(sample, 9, 17);
  sample.landmarks.push({
    id: 'town-square',
    name: 'Town square',
    ...square,
    radius: 64,
    kind: 'sign',
    description: 'The old town square is a short walk from here. A wooden sign points the way.',
  });
  lane(paths, [at(9, upperRoad), at(9, 18)]);
  clearances.push({ ...at(6, 14), width: 8 * TILE, height: 6 * TILE });
  if (norse) {
    norseProp(sample, 'hearth', 11, 16);
    sample.lights.push({ ...at(12, 17), radius: 84, color: 0xe9a453 });
  } else {
    for (const y of [16, 18]) ground(sample, 'lpc-flowers', 7, 11, y, -30);
  }

  const vault = placePrefab(sample, 'vault', at(21, 13), 'street-vault');
  // The separate vault frontage joins the cross lane without entering a house plot.
  lane(paths, [vault, { x: crossLane * TILE, y: vault.y }]);
  clearances.push({ ...at(20, 13), width: 11 * TILE, height: 8 * TILE });

  for (let y = 5; y < ROWS - 1; y += 3)
    for (let x = 2; x < COLUMNS - 1; x += 3) {
      if (random() > 0.65) continue;
      const canopy = { x: x * TILE - 48, y: y * TILE - 128, width: 96, height: 144 };
      if (clearances.some((area) => overlaps(canopy, area))) continue;
      let onLane = false;
      for (let row = y - 4; row <= y + 1; row++)
        for (let col = x - 2; col <= x + 1; col++) if (paths.has(cell(col, row))) onLane = true;
      if (!onLane) addTree(sample, x, y, norse, random() < 0.3 ? 'pine' : 'oak');
    }
  paintTerrain(sample, paths);
  return {
    ...sample,
    stamps: sample.stamps.map((stamp, index) => ({ id: `overworld:stamp:${index}`, ...stamp })),
    colliders: sample.colliders.map((box, index) => ({
      id: `overworld:collider:${index}`,
      ...box,
    })),
    lights: sample.lights.map((light, index) => ({ id: `overworld:light:${index}`, ...light })),
  };
}

/** Additive, version-pinned street creation. Persist this complete output on the first visit. */
export function generateStreetDocument(base: WorldDocument, streetSeed: string): WorldDocument {
  for (let attempt = 0; attempt < 4; attempt++) {
    const overworld = assembleStreet(
      base.themeId,
      `${base.seed}:street-v1:${streetSeed}:${attempt}`,
    );
    if (!sceneIsReachable(overworld)) continue;
    // Parsing owns the returned data, including the unchanged saved dungeon; the original is never mutated.
    return parseWorldDocument({ ...base, scenes: { overworld, dungeon: base.scenes.dungeon } });
  }
  throw new Error('Unable to generate a reachable street within the attempt limit');
}
