import { at, cell, ground, makeSample, paint, signpost } from './content/v1/builder';
import { buildDungeon } from './content/v1/dungeon';
import { addTree, createPrefab, type SettlementPrefab } from './content/v1/prefabs';
import { norseProp, NORSE_TEXTURES } from './content/v1/norse-props';
import type { Point, Rect, RpgSample } from './content/v1/types';
import {
  parseWorldDocument,
  type WorldDocument,
  type WorldScene,
  type WorldThemeId,
} from './document';
import { overlaps, sceneIsReachable } from './geometry';
import { seededRandom, shuffled } from './random';

const TILE = 32;
const COLUMNS = 52;
const ROWS = 42;
const PREFABS: Record<WorldThemeId, SettlementPrefab[]> = {
  village: ['hall', 'brick', 'paneled', 'grove', 'garden', 'vault'],
  norse: ['longhouse', 'cottage', 'smithy', 'runes', 'landing', 'vault'],
};

function identify(sample: RpgSample, scene: 'overworld' | 'dungeon'): WorldScene {
  return {
    ...sample,
    stamps: sample.stamps.map((stamp, index) => ({ id: `${scene}:stamp:${index}`, ...stamp })),
    colliders: sample.colliders.map((box, index) => ({ id: `${scene}:collider:${index}`, ...box })),
    lights: sample.lights.map((light, index) => ({ id: `${scene}:light:${index}`, ...light })),
  };
}

function drawLane(paths: Set<string>, points: Point[]): void {
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const minX = Math.floor(Math.min(from.x, to.x) / TILE);
    const minY = Math.floor(Math.min(from.y, to.y) / TILE);
    const maxX = Math.floor(Math.max(from.x, to.x) / TILE);
    const maxY = Math.floor(Math.max(from.y, to.y) / TILE);
    paint(paths, minX - 1, minY - 1, maxX - minX + 3, maxY - minY + 3);
  }
}

function assembleOverworld(theme: WorldThemeId, seed: string): RpgSample {
  const random = seededRandom(seed);
  const integer = (minimum: number, maximum: number) =>
    minimum + Math.floor(random() * (maximum - minimum + 1));
  const norse = theme === 'norse';
  const center = at(integer(23, 28), 21);
  const sample = makeSample(
    theme,
    norse ? 'Frosthavn' : 'Willowmere',
    norse ? 'Timber halls beside a northern lake' : 'A quiet village at the forest edge',
    center,
  );
  sample.bounds = { x: 0, y: 0, width: COLUMNS * TILE, height: ROWS * TILE };
  sample.background = norse ? '#304f59' : '#4b8035';
  if (norse) sample.textures = [...sample.textures, ...NORSE_TEXTURES];
  const paths = new Set<string>();
  const clearances: Rect[] = [];
  const roadY = integer(18, 19);
  const lowerRoadY = integer(37, 38);
  const crossLaneX = random() < 0.5 ? 17 : 33;
  drawLane(paths, [
    at(2, roadY),
    at(50, roadY),
    at(50, lowerRoadY),
    at(2, lowerRoadY),
    at(2, roadY),
  ]);
  drawLane(paths, [at(crossLaneX, roadY), at(crossLaneX, lowerRoadY)]);
  paint(paths, center.x / TILE - 4, 18, 9, 6);
  clearances.push({ x: center.x - 6 * TILE, y: 17 * TILE, width: 12 * TILE, height: 8 * TILE });

  const modules = shuffled(PREFABS[theme], random);
  modules.forEach((key, index) => {
    const origin = at(
      [4, 20, 36][index % 3]! + integer(0, 1),
      (index < 3 ? 4 : 24) + integer(-1, 1),
    );
    const prefab = createPrefab(key, norse);
    const shift = <T extends Point>(point: T) => ({
      ...point,
      x: point.x + origin.x,
      y: point.y + origin.y,
    });
    sample.stamps.push(
      ...prefab.scene.stamps.map((stamp, part) => ({
        ...shift(stamp),
        depth: stamp.depth === undefined || stamp.depth < 0 ? stamp.depth : stamp.depth + origin.y,
        id: `overworld:${key}:stamp:${part}`,
      })),
    );
    sample.colliders.push(
      ...prefab.scene.colliders.map((box, part) => ({
        ...shift(box),
        id: `overworld:${key}:collider:${part}`,
      })),
    );
    sample.landmarks.push(...prefab.scene.landmarks.map(shift));
    sample.lights.push(
      ...prefab.scene.lights.map((light, part) => ({
        ...shift(light),
        id: `overworld:${key}:light:${part}`,
      })),
    );
    clearances.push({
      x: origin.x - 2 * TILE,
      y: origin.y - TILE,
      width: 15 * TILE,
      height: 13 * TILE,
    });
    for (const approach of prefab.approaches) {
      const shifted = approach.map(shift);
      drawLane(paths, shifted);
      // Both ends that reach the frontage join the settlement road independently.
      for (const endpoint of [shifted[0]!, shifted[shifted.length - 1]!]) {
        if (endpoint.y !== origin.y + 11 * TILE) continue;
        drawLane(paths, [endpoint, { x: endpoint.x, y: (index < 3 ? roadY : lowerRoadY) * TILE }]);
      }
    }
  });

  sample.npcs.push({
    id: norse ? 'sigrid' : 'mira',
    name: norse ? 'Sigrid' : 'Mira',
    role: norse ? 'Keeper of the hearth' : 'Village keeper',
    appearance: norse ? 'sigrid' : 'ash',
    direction: 'right',
    x: center.x - 64,
    y: center.y,
    lines: norse
      ? [
          'Welcome to Frosthavn. Come closer to the hearth; the wind off the lake can find every gap in a good coat.',
          'The stone lanes connect our longhouse, homes and smithy. Follow the loop to find the landing and the carved stones beneath the pines.',
          'A sheltered stair leads down into the Lantern Vault. The lamps are still burning.',
        ]
      : [
          'Welcome to Willowmere. The kettle is warm, and there is always room for one more traveler.',
          'Our lanes wind past the gathering hall, the cottages and the listening grove. The bridge in the water garden is the best place to watch the afternoon drift by.',
          'The old stone stairs lead to the Lantern Vault. Oren keeps the lamps lit down there. Tell him I have not forgotten his tea.',
        ],
  });
  const square = norse
    ? norseProp(sample, 'hearth', center.x / TILE + 2, 21)
    : signpost(sample, center.x / TILE + 3, 22);
  sample.landmarks.push({
    id: norse ? 'frosthavn-hearth' : 'willowmere-sign',
    name: norse ? 'Hearth square' : 'Willowmere crossroads',
    ...square,
    radius: 64,
    kind: norse ? 'view' : 'sign',
    description: norse
      ? 'A ring of worn stones holds the village fire, banked every night and coaxed back to life before dawn.'
      : 'Willowmere welcomes travelers. Follow the lanes to the hall, listening grove, water garden, and the Lantern Vault. Please leave the gate as you found it.',
  });
  if (norse) sample.lights.push({ ...at(center.x / TILE + 3, 21.8), radius: 95, color: 0xe9a453 });

  // Full prefab clearances protect roofs, doors, bridge entrances and scenery bases.
  for (let y = 4; y < ROWS; y += 3)
    for (let x = 2; x < COLUMNS - 1; x += 3) {
      if (random() > 0.72) continue;
      const trunk = at(x, y);
      const canopy = { x: trunk.x - 48, y: trunk.y - 128, width: 96, height: 144 };
      if (clearances.some((area) => overlaps(canopy, area))) continue;
      let onLane = false;
      for (let row = y - 1; row <= y + 1; row++)
        for (let col = x - 1; col <= x + 1; col++) if (paths.has(cell(col, row))) onLane = true;
      if (!onLane) addTree(sample, x, y, norse, random() < 0.2 ? 'pine' : 'oak');
    }

  // Roads stop at the actual bases of objects, including the narrow rails and tree trunks.
  for (const key of paths) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    const box = { x: x * TILE, y: y * TILE, width: TILE, height: TILE };
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
      if (norse) {
        const mask =
          (paths.has(cell(x, y - 1)) ? 1 : 0) |
          (paths.has(cell(x + 1, y)) ? 2 : 0) |
          (paths.has(cell(x, y + 1)) ? 4 : 0) |
          (paths.has(cell(x - 1, y)) ? 8 : 0);
        ground(sample, 'norse-terrain', onPath ? mask : 16 + ((x * 17 + y * 31) % 4), x, y);
      } else {
        const edgeX = paths.has(cell(x - 1, y)) ? 0 : paths.has(cell(x + 1, y)) ? 2 : 1;
        const edgeY = paths.has(cell(x, y - 1)) ? 0 : paths.has(cell(x, y + 1)) ? 2 : 1;
        if (onPath || edgeX !== 1 || edgeY !== 1) ground(sample, 'lpc-terrain', 68, x, y);
        if (!onPath)
          ground(
            sample,
            'lpc-terrain',
            edgeX !== 1 || edgeY !== 1 ? edgeY * 16 + edgeX : (x * 13 + y * 7) % 9 === 0 ? 35 : 17,
            x,
            y,
            -90,
          );
      }
      if (onPath)
        Object.assign(sample.stamps[sample.stamps.length - 1]!, { id: `overworld:road:${x}:${y}` });
    }
  return sample;
}

/** Initial creation only. Every render and subsequent visit consumes the saved document. */
export function generateWorldDocument(input: {
  worldId: string;
  themeId: WorldThemeId;
  seed: string;
}): WorldDocument {
  if (!PREFABS[input.themeId]) throw new Error('Unsupported world theme');
  const dungeon = buildDungeon();
  if (!sceneIsReachable(dungeon)) throw new Error('Invalid pinned dungeon content');
  for (let attempt = 0; attempt < 4; attempt++) {
    const overworld = assembleOverworld(input.themeId, `${input.seed}:overworld:${attempt}`);
    if (!sceneIsReachable(overworld)) continue;
    return parseWorldDocument({
      schemaVersion: 1,
      generatorVersion: 1,
      contentVersion: 'rpg-v1',
      geometryRevision: 1,
      ...input,
      scenes: {
        overworld: identify(overworld, 'overworld'),
        dungeon: identify(dungeon, 'dungeon'),
      },
    });
  }
  throw new Error('Unable to generate a reachable world within the attempt limit');
}
