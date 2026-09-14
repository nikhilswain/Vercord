import {
  at,
  block,
  cell,
  ground,
  makeSample,
  object,
  paint,
  signpost,
} from '../../../domain/world/content/v1/builder';
import { addTree } from '../../../domain/world/content/v1/prefabs';
import type { Point, Rect } from '../../world/engine/types';
import { containsPoint } from '../../world/engine/collision';
import type { RpgSample } from '../types';
import type { AdventureDefinition } from '../adventure/types';
import type { DemoArea } from './types';
import { addTempleScenery } from '../adventure/temple-scenery';

type Patch = readonly [number, number, number, number];

/** Ground is built once with the sample; the existing renderer caches it independently of combat. */
function forestGround(sample: RpgSample, paths: Set<string>, water: readonly Rect[]): void {
  for (let y = 0; y < sample.bounds.height / 32; y++)
    for (let x = 0; x < sample.bounds.width / 32; x++) {
      const onPath = paths.has(cell(x, y));
      const edgeX = paths.has(cell(x - 1, y)) ? 0 : paths.has(cell(x + 1, y)) ? 2 : 1;
      const edgeY = paths.has(cell(x, y - 1)) ? 0 : paths.has(cell(x, y + 1)) ? 2 : 1;
      const edge = edgeX !== 1 || edgeY !== 1;
      if (onPath || edge) ground(sample, 'lpc-terrain', 68, x, y);
      if (!onPath)
        ground(
          sample,
          'lpc-terrain',
          edge ? edgeY * 16 + edgeX : (x * 13 + y * 7) % 7 === 0 ? 35 : 17,
          x,
          y,
          -90,
        );
    }
  for (const pool of water) {
    const left = pool.x / 32,
      top = pool.y / 32,
      right = (pool.x + pool.width) / 32,
      bottom = (pool.y + pool.height) / 32;
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++)
        ground(
          sample,
          'lpc-terrain',
          (y === top ? 10 : y === bottom - 1 ? 12 : 11) * 16 +
            (x === left ? 0 : x === right - 1 ? 2 : 1),
          x,
          y,
          -60,
        );
  }
  sample.colliders.push(...water);
}

function canopy(sample: RpgSample, paths: Set<string>, clear: readonly Point[]): void {
  for (let y = 3; y < sample.bounds.height / 32; y += 2.4)
    for (let x = 1; x < sample.bounds.width / 32; x += 2.5) {
      const tx = x + Math.sin(y * 9 + x) * 0.65;
      const ty = y + Math.cos(x * 3) * 0.5;
      const point = at(tx, ty);
      if (clear.some((p) => Math.hypot(point.x - p.x, point.y - p.y) < 110)) continue;
      if (
        sample.colliders.some((r) =>
          containsPoint(
            { x: r.x - 48, y: r.y - 24, width: r.width + 96, height: r.height + 120 },
            point.x,
            point.y,
          ),
        )
      )
        continue;
      if (
        [-1, 0, 1].some((dx) =>
          [-2, -1, 0, 1].some((dy) => paths.has(cell(Math.floor(tx) + dx, Math.floor(ty) + dy))),
        )
      )
        continue;
      addTree(sample, tx, ty, false, Math.floor(x + y) % 3 === 0 ? 'tallOak' : 'oldOak');
    }
}

function portal(
  sample: RpgSample,
  id: string,
  target: DemoArea,
  name: string,
  x: number,
  y: number,
): void {
  sample.demo!.portals.push({ id, target });
  sample.landmarks.push({
    id,
    name,
    ...at(x, y),
    radius: 65,
    kind: 'portal',
    description: `Follow the trail to ${name}.`,
  });
  signpost(sample, x + 1.8, y - 0.3);
  sample.signage ??= [];
  sample.signage.push({
    ...at(x, y - 2.7),
    text: name,
    detail: 'E to follow the trail',
    kind: 'place',
    maxWidth: 210,
  });
}

function base(
  area: DemoArea,
  name: string,
  subtitle: string,
  width: number,
  height: number,
  spawn: Point,
  content: AdventureDefinition,
  patches: readonly Patch[],
): { sample: RpgSample; paths: Set<string> } {
  const sample: RpgSample = makeSample('village', name, subtitle, spawn);
  sample.bounds = { x: 0, y: 0, width: width * 32, height: height * 32 };
  sample.background = '#4b8035';
  sample.demo = { area, portals: [], jungle: content };
  const paths = new Set<string>();
  patches.forEach(([x, y, w, h]) => paint(paths, x, y, w, h));
  forestGround(sample, paths, content.water);
  return { sample, paths };
}

export function buildFernHollow(): RpgSample {
  const content: AdventureDefinition = {
    safeAreas: [
      { ...at(0, 27), width: 8 * 32, height: 9 * 32 },
      { ...at(43, 5), width: 9 * 32, height: 10 * 32 },
    ],
    enemies: [
      { id: 'hollow-venus-west', kind: 'venus-trap', ...at(13, 29) },
      { id: 'hollow-slime-pond', kind: 'slime', variant: 'green', ...at(17, 23) },
      { id: 'hollow-blue-fern', kind: 'blue-death', ...at(12, 15) },
      { id: 'hollow-venus-grove', kind: 'venus-trap', ...at(26, 17) },
      { id: 'hollow-blue-ruins', kind: 'blue-death', ...at(37, 17) },
      { id: 'hollow-slime-blue', kind: 'slime', ...at(34, 29) },
      { id: 'hollow-snake', kind: 'snake', ...at(40, 25) },
    ],
    flowers: [
      { id: 'hollow-herb-arrival', kind: 'healing', ...at(6, 32) },
      { id: 'hollow-herb-fern', kind: 'healing', ...at(15, 12) },
      { id: 'hollow-herb-ruins', kind: 'healing', ...at(41, 12) },
      { id: 'hollow-bloom-pond', kind: 'collection', ...at(28, 30) },
      { id: 'hollow-bloom-nook', kind: 'collection', ...at(10, 11) },
      { id: 'hollow-bloom-roots', kind: 'collection', ...at(29, 19) },
    ],
    water: [
      { ...at(20, 26), width: 7 * 32, height: 7 * 32 },
      { ...at(31, 4), width: 8 * 32, height: 7 * 32 },
    ],
    traps: [
      { id: 'hollow-plate', ...at(31, 17), offset: 0 },
      { id: 'hollow-plate-east', ...at(38, 23), offset: 0 },
    ],
  };
  const { sample, paths } = base(
    'fern-hollow',
    'Fern Hollow',
    'Beyond Mosswild · Follow the northeast trail to the temple',
    52,
    40,
    at(5, 30),
    content,
    [
      [1, 29, 16, 4],
      [11, 22, 8, 9],
      [12, 15, 4, 11],
      [8, 10, 11, 8],
      [15, 15, 25, 5],
      [34, 14, 8, 14],
      [28, 27, 12, 5],
      [27, 22, 4, 10],
      [16, 22, 22, 3],
      [39, 8, 10, 4],
      [39, 10, 4, 8],
    ],
  );
  portal(sample, 'hollow-return', 'jungle', 'Mosswild Jungle', 3, 31);
  portal(sample, 'temple-entry', 'temple', 'Rootbound Temple', 47, 9);
  canopy(sample, paths, [
    sample.spawn,
    ...sample.landmarks,
    ...content.enemies,
    ...content.flowers,
  ]);
  for (const [x, y] of [
    [18, 27],
    [28, 34],
    [30, 12],
    [10, 20],
    [42, 18],
  ] as const) {
    object(sample, 'lpc-rocks', 'medium', x, y, y + 0.8);
    block(sample, x + 0.2, y + 0.3, 1.5, 0.6);
  }
  sample.signage!.push(
    {
      ...at(12, 8),
      text: 'The hungry grove',
      detail: 'Watch the flowers',
      kind: 'place',
      maxWidth: 190,
    },
    { ...at(24, 24), text: 'Moonwater pool', kind: 'place', maxWidth: 190 },
  );
  addTempleScenery(sample, false);
  return sample;
}

export function buildTempleDemo(): RpgSample {
  const content: AdventureDefinition = {
    safeAreas: [{ ...at(17, 34), width: 12 * 32, height: 8 * 32 }],
    enemies: [
      { id: 'temple-venus-west', kind: 'venus-trap', ...at(15, 29) },
      { id: 'temple-blue-east', kind: 'blue-death', ...at(30, 28) },
      { id: 'temple-root-beast', kind: 'root-beast', elite: true, ...at(22, 15) },
    ],
    flowers: [
      { id: 'temple-herb-camp', kind: 'healing', ...at(25, 36) },
      { id: 'temple-herb-west', kind: 'healing', ...at(12, 24) },
      { id: 'temple-bloom-altar', kind: 'collection', ...at(22, 10.5) },
      { id: 'temple-bloom-east', kind: 'collection', ...at(35.5, 18) },
    ],
    water: [],
    traps: [
      { id: 'temple-plate-west', ...at(17, 24), offset: 0 },
      { id: 'temple-plate-east', ...at(27, 24), offset: 0 },
    ],
  };
  const { sample, paths } = base(
    'temple',
    'Rootbound Temple',
    'The Root Beast guards the overgrown sanctuary',
    44,
    42,
    at(22, 37),
    content,
    [
      [19, 31, 8, 10],
      [10, 25, 26, 8],
      [19, 21, 8, 8],
      [10, 9, 26, 14],
      [18, 5, 10, 8],
    ],
  );
  portal(sample, 'temple-return', 'fern-hollow', 'Fern Hollow', 22, 39);
  canopy(sample, paths, [
    sample.spawn,
    ...sample.landmarks,
    ...content.enemies,
    ...content.flowers,
  ]);
  addTempleScenery(sample, true);
  return sample;
}
