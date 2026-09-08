import type { RpgSample } from '../types';
import {
  at,
  block,
  cell,
  COLS,
  ground,
  makeSample,
  object,
  paint,
  ROWS,
  signpost,
  type TileArea,
  type TilePoint,
} from './builder';
import { norseProp, NORSE_TEXTURES } from './norse-props';

function pine(sample: RpgSample, x: number, y: number) {
  sample.stamps.push({
    texture: 'lpc-trees',
    frame: 'pine',
    ...at(x - 1.5, y - 3.5),
    depth: y * 32,
    tint: 0xb8c8b8,
  });
  block(sample, x - 0.3, y - 0.3, 0.6, 0.4);
}

function rock(sample: RpgSample, x: number, y: number, large = false) {
  sample.stamps.push({
    texture: 'lpc-rocks',
    frame: large ? 'large' : 'medium',
    ...at(x, y - (large ? 2 : 0)),
    depth: (y + 0.8) * 32,
    tint: 0xb7c4c9,
  });
  block(sample, x + 0.2, y + 0.2, 1.5, 0.6);
}

function shoreRow(x: number): number {
  return x < 7 ? 31 : x < 14 ? 30 : x < 22 ? 31 : x < 29 ? 30 : x < 36 ? 27 : x < 41 ? 25 : 23;
}

/** A fixed art-calibration map. Saved per-server generation belongs to the following phase. */
export function buildNorse(): RpgSample {
  const sample = makeSample(
    'norse',
    'Frosthavn',
    'Timber halls above a cold northern inlet',
    at(23, 17.6),
  );
  sample.background = '#304f59';
  sample.textures = [...sample.textures, ...NORSE_TEXTURES];
  const paths = new Set<string>();
  for (const area of [
    [19, 15, 9, 5], // Broad hearth square, beside the longhouse apron.
    [22, 12, 3, 14], // Spine from the hall to the harbor road.
    [9, 16, 14, 3], // West cottage lane.
    [12, 24, 12, 3], // Smithy lane.
    [25, 16, 13, 3], // Eastern cottages and vault approach.
    [32, 13, 3, 5],
    [36, 9, 3, 9],
    [36, 8, 4, 3],
    [13, 8, 3, 10], // A side trail loops around the western home.
    [8, 7, 8, 3],
    [23, 24, 7, 3],
    [27, 25, 3, 6],
  ] satisfies TileArea[])
    paint(paths, ...area);
  // Clip the square corners so paths do not read as a rectangular paved field.
  for (const [x, y] of [
    [19, 15],
    [27, 15],
    [19, 19],
    [27, 19],
  ] as const)
    paths.delete(cell(x, y));

  const water = (x: number, y: number) => y >= shoreRow(x);
  const dock = (x: number, y: number) => x >= 27 && x < 30 && y >= 28 && y < 33;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const variation = (x * 17 + y * 31) % 4;
      if (water(x, y)) {
        ground(sample, 'norse-terrain', 20 + variation, x, y);
        if (!dock(x, y)) block(sample, x, y, 1, 1);
        for (const [dx, dy, frame] of [
          [0, -1, 24],
          [1, 0, 25],
          [0, 1, 26],
          [-1, 0, 27],
        ] as const) {
          if (!water(x + dx, y + dy)) ground(sample, 'norse-terrain', frame, x, y, -60);
        }
      } else if (paths.has(cell(x, y))) {
        const mask =
          (paths.has(cell(x, y - 1)) ? 1 : 0) |
          (paths.has(cell(x + 1, y)) ? 2 : 0) |
          (paths.has(cell(x, y + 1)) ? 4 : 0) |
          (paths.has(cell(x - 1, y)) ? 8 : 0);
        ground(sample, 'norse-terrain', mask, x, y);
      } else ground(sample, 'norse-terrain', 16 + variation, x, y);
      if (dock(x, y)) ground(sample, 'norse-terrain', 28, x, y, -30);
    }
  }
  // Pier edges protect the water, while a three-tile deck stays traversable.
  block(sample, 27, 29, 0.15, 4);
  block(sample, 29.85, 29, 0.15, 4);
  block(sample, 27, 32.85, 3, 0.15);
  object(sample, 'norse-longboat', undefined, 30.2, 29.1, 31.35);

  const hall = norseProp(sample, 'longhouse', 19, 7);
  const westHome = norseProp(sample, 'cottage', 7, 11);
  norseProp(sample, 'cottage', 31, 9);
  const smithy = norseProp(sample, 'smithy', 9, 20);
  norseProp(sample, 'supplies', 15.2, 23.5);
  norseProp(sample, 'supplies', 25.1, 28);
  norseProp(sample, 'banner', 18, 10.4);
  norseProp(sample, 'banner', 27.4, 10.4);
  norseProp(sample, 'banner', 35.8, 6);
  const hearth = norseProp(sample, 'hearth', 22, 18.8);
  sample.lights.push({ ...at(23, 19.5), radius: 95, color: 0xe9a453 });
  sample.lights.push({ ...at(13.5, 24), radius: 76, color: 0xeeb267 });
  const rune = norseProp(sample, 'runestone', 8.2, 5.2);
  signpost(sample, 29.9, 19.8);

  // Northern pines and granite close the landscape; trunks leave paths and aprons clear.
  const trees: TilePoint[] = [
    [2, 5],
    [5, 4],
    [8, 3],
    [11, 4],
    [14, 3],
    [17, 4],
    [20, 3],
    [23, 4],
    [26, 3],
    [29, 4],
    [32, 3],
    [35, 4],
    [39, 3],
    [43, 4],
    [45, 7],
    [2, 9],
    [3, 13],
    [2, 17],
    [3, 21],
    [2, 25],
    [4, 29],
    [43, 11],
    [44, 15],
    [43, 20],
    [40, 22],
    [6, 7],
    [11, 6],
    [17, 8],
    [29, 8],
    [6, 20],
    [17, 22],
    [6, 27],
    [19, 28],
    [32, 23],
    [40, 17],
  ];
  trees.forEach(([x, y]) => pine(sample, x, y));
  for (const [x, y] of [
    [1, 7],
    [4, 6],
    [13, 5],
    [27, 5],
    [33, 5],
    [41, 6],
    [42, 9],
    [1, 23],
  ] as const)
    rock(sample, x, y, true);
  for (const [x, y] of [
    [5, 10],
    [10, 7],
    [7, 8],
    [4, 24],
    [15, 29],
    [34, 25],
    [40, 23],
    [41, 18],
  ] as const)
    rock(sample, x, y);

  // The vault is an optional location, reached from an outdoor stone stairway.
  for (const x of [35, 36, 39, 40]) {
    for (let level = 0; level < 3; level++)
      object(sample, 'lpc-walls', (level + 3) * 6 + 1, x, 5 + level, 8);
    block(sample, x, 7, 1, 1);
  }
  object(sample, 'lpc-arch', 'stone', 35.5, 5, 8);
  for (let x = 37; x < 39; x++)
    for (let y = 6; y < 9; y++) ground(sample, 'lpc-stairs', 'down', x, y, -25);

  sample.npcs.push({
    id: 'sigrid',
    name: 'Sigrid',
    role: 'Keeper of the hearth',
    appearance: 'sigrid',
    direction: 'right',
    ...at(21.5, 17.6),
    lines: [
      'Welcome to Frosthavn. Come closer to the hearth; the wind off the inlet can find every gap in a good coat.',
      'Our longhouse stands north of the square. Follow the stone lane west for the cottages and smithy, or south to the landing. The old boat has weathered more winters than I have.',
      'The carved stones in the pine grove remember our first crossing. Beyond the eastern homes, another stair leads down into the Lantern Vault. The lamps are still burning.',
    ],
  });
  sample.landmarks.push(
    {
      id: 'frosthavn-hearth',
      name: 'Hearth square',
      ...hearth,
      radius: 72,
      kind: 'view',
      description:
        'Smoke curls between the timber halls. A ring of worn stones holds the village fire, banked every night and coaxed back to life before dawn.',
    },
    {
      id: 'frosthavn-longhouse',
      name: 'The timber longhouse',
      ...hall,
      radius: 68,
      kind: 'view',
      description:
        'Carved gables guard a steep shingle roof. Round shields hang beside the door; inside, someone is setting places at a very long table.',
    },
    {
      id: 'frosthavn-cottage',
      name: 'The turf-roofed home',
      ...westHome,
      radius: 64,
      kind: 'view',
      description:
        'Moss grows thick above the rafters. A warm window, stacked firewood, and a pair of boots by the door say everything about the people who live here.',
    },
    {
      id: 'frosthavn-smithy',
      name: 'The shore smithy',
      ...smithy,
      radius: 68,
      kind: 'view',
      description:
        'The forge glows beneath a soot-dark chimney. Boat nails, hinges, and half-mended tools line the workbench. Every journey begins with something made here.',
    },
    {
      id: 'frosthavn-runes',
      name: 'The rune grove',
      ...rune,
      radius: 64,
      kind: 'sign',
      description:
        'Weather has softened the carved stone, but the marks remain. Sigrid says they tell of a crossing, a winter, and the promise to keep a fire for the next traveler.',
    },
    {
      id: 'frosthavn-landing',
      name: 'The longboat landing',
      ...at(28.5, 31.5),
      radius: 68,
      kind: 'view',
      description:
        'Cold water taps against the piles. The longboat rests alongside, shields dull with salt and its sail bound tight. For now, the far shore can wait.',
    },
    {
      id: 'frosthavn-vault',
      name: 'The Lantern Vault',
      ...at(38, 9),
      radius: 72,
      kind: 'portal',
      destination: 'dungeon',
      description:
        'A sheltered stone stair descends beneath the headland. Follow the warm lamps into the Lantern Vault.',
    },
  );
  return sample;
}
