import type { RpgSample } from '../types';
import { addDungeonWalls } from './dungeon-walls';
import {
  COLS,
  ROWS,
  at,
  cell,
  paint,
  makeSample,
  ground,
  object,
  block,
  signpost,
  type TileArea,
} from './builder';

function torch(sample: RpgSample, x: number, y: number) {
  object(sample, 'lpc-torch', 'flame', x - 0.5, y - 1.7, y + 0.1);
  sample.lights.push({ ...at(x, y - 1), radius: 140, color: 0xffbf70 });
}

function pillar(sample: RpgSample, x: number, y: number, pale = false) {
  object(sample, 'lpc-pillar', pale ? 'pale' : 'slate', x - 0.5, y - 2.8, y + 0.2);
  block(sample, x - 0.42, y - 0.35, 0.84, 0.55);
}

export function buildDungeon(): RpgSample {
  const sample = makeSample(
    'dungeon',
    'The Lantern Vault',
    'Old stone, quiet rooms, and a light left burning',
    at(12, 25),
  );
  const floor = new Set<string>();
  const chambers: TileArea[] = [
    [5, 21, 15, 10], // Arrival chamber.
    [17, 10, 14, 16], // Lantern nave.
    [4, 6, 10, 10], // The western archive.
    [34, 6, 9, 12], // Reliquary.
    [34, 24, 9, 7], // Stores.
    [11, 11, 8, 5],
    [29, 12, 7, 6],
    [18, 22, 18, 5],
  ];
  for (const [x, y, width, height] of chambers) paint(floor, x, y, width, height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (floor.has(cell(x, y))) {
        // Cool stone surrounding a patterned processional aisle.
        ground(sample, 'lpc-stone-floor', 6, x, y);
        if (
          (x >= 21 && x <= 26 && y >= 12 && y <= 22) ||
          (x >= 36 && x <= 40 && y >= 9 && y <= 14)
        ) {
          ground(sample, 'lpc-diamond-floor', 20, x, y, -80, 0.42);
        } else if ((x * 7 + y * 11) % 29 === 0) {
          ground(sample, 'lpc-grit', 3, x, y, -80, 0.32);
        }
      }
    }
  }

  addDungeonWalls(sample, floor);

  // Paired columns establish the nave's scale and leave a generous central aisle.
  for (const [x, y] of [
    [19.5, 14],
    [28.5, 14],
    [19.5, 20],
    [28.5, 20],
    [7, 23],
    [18, 29],
    [35.5, 10],
    [41.5, 10],
  ] as const)
    pillar(sample, x, y, x > 30);
  for (const [x, y] of [
    [7, 21],
    [17, 21],
    [20, 10],
    [28, 10],
    [5, 6],
    [12, 6],
    [35, 6],
    [42, 6],
    [35, 24],
    [41, 24],
    [30, 22],
  ] as const)
    torch(sample, x, y);

  for (const [x, y] of [
    [5, 7],
    [9, 7],
    [5, 10],
  ] as const) {
    object(sample, 'lpc-shelf', 'low', x, y, y + 1);
    block(sample, x, y + 0.4, 3, 0.6);
    object(sample, 'lpc-chest', 'bronze', x + 0.3, y - 0.3, y + 1.01);
  }
  for (const [x, y] of [
    [35, 25],
    [37, 25],
    [40, 25],
    [40, 28],
    [37, 9],
  ] as const) {
    object(sample, 'lpc-chest', x > 38 ? 'iron' : 'bronze', x, y, y + 0.9);
    block(sample, x + 0.05, y + 0.35, 0.9, 0.6);
  }
  ground(sample, 'lpc-dungeon-details', 'coins', 38, 10, -30);
  ground(sample, 'lpc-dungeon-details', 'coins', 37.4, 10.5, -30);
  object(sample, 'lpc-dungeon-details', 'web', 12, 4, 6.1);
  object(sample, 'lpc-dungeon-details', 'web', 41, 22, 24.1);
  object(sample, 'lpc-dungeon-details', 'ivy', 4, 13, 16);
  const naveSign = signpost(sample, 24, 12);
  for (let x = 9; x <= 11; x++) {
    for (let y = 28; y <= 30; y++) ground(sample, 'lpc-stairs', 'down', x, y, -30);
  }
  signpost(sample, 8.5, 29);

  sample.npcs.push({
    id: 'oren',
    name: 'Oren',
    role: 'Vault archivist',
    appearance: 'ash',
    direction: 'left',
    ...at(13.5, 25),
    lines: [
      'A visitor from above? Good. I was beginning to think the lamps were my only company.',
      'This was never a prison. The village kept its records, its winter stores, and its promises here. The western room still holds a few of each.',
      'The pale columns mark the reliquary to the northeast. Walk slowly: the little things tend to tell the longest stories.',
      'Mira remembered the tea, you say? Then there is hope for the surface after all.',
    ],
  });
  sample.landmarks.push(
    {
      id: 'village-stairs',
      name: 'Stairs to Willowmere',
      ...at(10.5, 28),
      radius: 72,
      kind: 'portal',
      destination: 'village',
      description:
        'A cool breeze carries the smell of grass down these worn steps. Return to Willowmere.',
    },
    {
      id: 'western-archive',
      name: 'The western archive',
      ...at(8, 12),
      radius: 72,
      kind: 'view',
      description:
        'The little iron-bound cases are labeled with harvests, weddings, and remarkable storms. One label reads: Things we thought we had lost.',
    },
    {
      id: 'lantern-nave',
      name: 'The lantern nave',
      ...naveSign,
      radius: 72,
      kind: 'sign',
      description:
        'Keep a light for those who follow. The words on this old sign echo an inscription cut into the stone beneath it, almost worn away by passing feet.',
    },
    {
      id: 'reliquary',
      name: 'The quiet reliquary',
      ...at(38, 12),
      radius: 72,
      kind: 'view',
      description:
        'A few dull coins, a locked case, and room enough for a hundred treasures. Whatever mattered here was carried carefully, and never displayed for very long.',
    },
    {
      id: 'winter-stores',
      name: 'The winter stores',
      ...at(38, 27.5),
      radius: 72,
      kind: 'view',
      description:
        'The cases are empty now, but every hinge is oiled. Oren is quite certain that being prepared is a form of kindness.',
    },
  );
  return sample;
}
