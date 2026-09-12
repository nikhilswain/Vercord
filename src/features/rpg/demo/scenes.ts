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
import { buildVillage } from '../../../domain/world/content/v1/village';
import { containsPoint } from '../../world/engine/collision';
import type { RpgSample } from '../types';
import type { JungleDefinition } from './types';

export function buildComparisonVillage(): RpgSample {
  const sample: RpgSample = buildVillage();
  sample.demo = { area: 'village', portal: { id: 'demo-jungle-entry', target: 'jungle' } };
  sample.subtitle = 'Meet the travelers · Follow the northwest path to the jungle';
  sample.landmarks = sample.landmarks.filter((place) => place.id !== 'listening-grove');
  sample.landmarks.push({
    id: 'demo-jungle-entry',
    name: 'Mosswild Jungle',
    ...at(9.5, 11.8),
    radius: 76,
    kind: 'portal',
    description: 'A trail beneath the old trees leads into Mosswild Jungle.',
  });
  signpost(sample, 11.3, 11.8);
  sample.signage = [
    {
      ...at(9.5, 9.5),
      text: 'Mosswild Jungle',
      detail: 'Approach · E to enter',
      kind: 'place',
      maxWidth: 200,
    },
  ];
  sample.npcs.push({
    id: 'demo-naturalist',
    name: 'Juniper',
    role: 'Forest naturalist',
    appearance: 'juniper',
    direction: 'down',
    ...at(11.5, 14),
    lines: [
      'Moonblossoms grow in the forest clearings. Golden herbs can heal you. Gather either with E.',
      'Your first spell is Ember. Press Space to cast toward a nearby creature, or in the direction you face. Gathering and combat teach you Tide at level 2.',
      'Watch the ground before a creature lunges. Return to this village to rest; your discoveries will stay with you during this visit.',
    ],
  });
  sample.npcs[0]!.lines = [
    'Choose your traveler in Look. Your appearance stays with you as you explore and learn magic.',
    'The northwest grove opens into Mosswild Jungle. Slimes, wild animals and collectible flowers wait along the trail. Press E by the jungle sign to enter.',
  ];
  return sample;
}

export function buildJungleDemo(): RpgSample {
  const sample: RpgSample = makeSample(
    'village',
    'Mosswild Jungle',
    'A trail beyond Willowmere',
    at(23, 33),
  );
  sample.bounds = { x: 0, y: 0, width: 46 * 32, height: 38 * 32 };
  sample.background = '#4d8231';
  const jungle: JungleDefinition = {
    enemies: [
      { id: 'slime-south', kind: 'slime', ...at(23, 28) },
      { id: 'slime-west', kind: 'slime', variant: 'green', ...at(18, 23) },
      { id: 'slime-east', kind: 'slime', ...at(28, 23) },
      { id: 'snake-fern', kind: 'snake', ...at(12, 20) },
      { id: 'bear-hollow', kind: 'bear', ...at(36, 23) },
      { id: 'bloom-guardian', kind: 'guardian', elite: true, ...at(23, 14.5) },
      { id: 'fern-brute', kind: 'forest-brute', elite: true, ...at(12, 13) },
      { id: 'pool-skirmisher', kind: 'forest-skirmisher', elite: true, ...at(28, 12) },
    ],
    flowers: [
      { id: 'herb-camp', kind: 'healing', ...at(20.5, 32.5) },
      { id: 'herb-west', kind: 'healing', ...at(16, 24) },
      { id: 'herb-north', kind: 'healing', ...at(24, 14) },
      { id: 'herb-east', kind: 'healing', ...at(33, 26) },
      { id: 'bloom-fern', kind: 'collection', ...at(11, 11) },
      { id: 'bloom-pool', kind: 'collection', ...at(29, 10) },
      { id: 'bloom-hollow', kind: 'collection', ...at(39, 22) },
    ],
    water: [{ x: 31 * 32, y: 7 * 32, width: 8 * 32, height: 9 * 32 }],
    traps: [
      { id: 'fern-spikes', offset: 0, ...at(16.5, 20) },
      { id: 'pool-spikes', offset: 1.5, ...at(28.5, 18) },
    ],
  };
  sample.demo = { area: 'jungle', portal: { id: 'demo-jungle-return', target: 'village' }, jungle };
  const paths = new Set<string>();
  for (const [x, y, w, h] of [
    [20, 30, 7, 6],
    [22, 25, 3, 8],
    [15, 22, 24, 3],
    [15, 16, 3, 8],
    [10, 12, 8, 5],
    [17, 14, 12, 3],
    [27, 11, 3, 13],
    [35, 20, 6, 7],
    [9, 10, 6, 5],
  ] as const)
    paint(paths, x, y, w, h);
  for (let y = 0; y < 38; y++)
    for (let x = 0; x < 46; x++) {
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
      // Keep the existing grass bright while the licensed ELV forest art is pending.
      if (onPath) sample.stamps[sample.stamps.length - 1]!.tint = 0xeff2d5;
    }
  for (let y = 7; y < 16; y++)
    for (let x = 31; x < 39; x++) {
      ground(
        sample,
        'lpc-terrain',
        (y === 7 ? 10 : y === 15 ? 12 : 11) * 16 + (x === 31 ? 0 : x === 38 ? 2 : 1),
        x,
        y,
        -60,
      );
    }
  sample.colliders.push(...jungle.water);
  // Dense canopy outside generous trail clearings. Deterministic authored layout,
  // cached by the existing static renderer; no trees regenerate during camera movement.
  const clear = [sample.spawn, at(23, 35), ...jungle.enemies, ...jungle.flowers];
  for (let y = 4; y < 38; y += 2.3)
    for (let x = 1.5; x < 46; x += 2.4) {
      const tx = x + Math.sin(y * 9 + x) * 0.65;
      const ty = y + Math.cos(x * 3) * 0.5;
      const point = at(tx, ty);
      if (clear.some((p) => Math.hypot(point.x - p.x, point.y - p.y) < 115)) continue;
      if (
        jungle.water.some((rect) =>
          containsPoint(
            { x: rect.x - 32, y: rect.y - 8, width: rect.width + 64, height: rect.height + 100 },
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
      if (Math.floor(x) % 3 === 0) sample.stamps[sample.stamps.length - 1]!.tint = 0xe3edbb;
    }
  for (const [x, y] of [
    [18, 30],
    [27, 31],
    [14, 21],
    [31, 24],
    [8, 15],
    [25, 12],
    [39, 18],
  ] as const) {
    object(sample, 'lpc-rocks', 'medium', x, y, y + 0.8);
    block(sample, x + 0.2, y + 0.3, 1.5, 0.6);
    ground(sample, 'lpc-flowers', 25, x + 1.8, y + 1, -25);
  }
  signpost(sample, 24.8, 34.8);
  sample.landmarks.push({
    id: 'demo-jungle-return',
    name: 'Willowmere',
    ...at(23, 35),
    radius: 65,
    kind: 'portal',
    description: 'Return to the village with your gathered flowers.',
  });
  sample.signage = [
    { ...at(23, 36.5), text: 'Willowmere ↓', detail: 'E to return', kind: 'place', maxWidth: 170 },
    {
      ...at(23, 30),
      text: 'The Mosswild trail',
      detail: 'Slimes ahead',
      kind: 'place',
      maxWidth: 190,
    },
    { ...at(12, 9), text: 'Fern clearing', kind: 'place', maxWidth: 170 },
    {
      ...at(23, 11.5),
      text: 'Thornbloom grove',
      detail: 'Guardian ahead',
      kind: 'place',
      maxWidth: 190,
    },
    { ...at(35, 5.5), text: 'Stillwater pool', kind: 'place', maxWidth: 170 },
    { ...at(36, 18.5), text: 'Bear hollow', kind: 'place', maxWidth: 170 },
  ];
  return sample;
}
