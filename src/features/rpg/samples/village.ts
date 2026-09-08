import type { RpgSample } from '../types';
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
  type TilePoint,
} from './builder';

function tree(sample: RpgSample, x: number, y: number, variant = 'oak') {
  const footOffset = variant === 'tallOak' ? 4 : variant === 'pine' ? 3.5 : 3;
  object(sample, 'lpc-trees', variant, x - 1.5, y - footOffset, y);
  block(sample, x - 0.32, y - 0.35, 0.64, 0.45);
}

function flowers(sample: RpgSample, positions: TilePoint[], frame: number) {
  for (const [x, y] of positions) ground(sample, 'lpc-flowers', frame, x, y, -30);
}

export function buildVillage(): RpgSample {
  const sample = makeSample(
    'village',
    'Willowmere',
    'A quiet village at the forest edge',
    at(24, 19),
  );
  const paths = new Set<string>();
  // The broad arrival lane branches to the hall, cottage, garden, grove, and vault.
  for (const [x, y, width, height] of [
    [19, 15, 8, 8],
    [21, 22, 3, 10],
    [8, 18, 14, 3],
    [25, 17, 13, 3],
    [17, 13, 3, 6],
    [30, 14, 3, 5],
    [11, 20, 3, 7],
    [8, 11, 3, 8],
    [25, 24, 13, 3],
    [24, 21, 3, 6],
    [35, 24, 3, 7],
    [7, 10, 6, 3],
  ] as const)
    paint(paths, x, y, width, height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const onPath = paths.has(cell(x, y));
      const edgeX = paths.has(cell(x - 1, y)) ? 0 : paths.has(cell(x + 1, y)) ? 2 : 1;
      const edgeY = paths.has(cell(x, y - 1)) ? 0 : paths.has(cell(x, y + 1)) ? 2 : 1;
      if (onPath || edgeX !== 1 || edgeY !== 1) {
        ground(sample, 'lpc-terrain', 4 * 16 + 4, x, y);
      }
      if (!onPath) {
        const frame =
          edgeX !== 1 || edgeY !== 1 ? edgeY * 16 + edgeX : (x * 13 + y * 7) % 9 === 0 ? 35 : 17;
        ground(sample, 'lpc-terrain', frame, x, y, -90);
      }
    }
  }

  // A water garden with a two-tile walking deck across its middle.
  for (let y = 15; y <= 23; y++) {
    for (let x = 36; x <= 42; x++) {
      const col = x === 36 ? 0 : x === 42 ? 2 : 1;
      const row = y === 15 ? 10 : y === 23 ? 12 : 11;
      ground(sample, 'lpc-terrain', row * 16 + col, x, y, -70);
      if (y < 18 || y > 19) block(sample, x, y, 1, 1);
    }
  }
  for (let x = 35; x <= 43; x++) {
    ground(sample, 'lpc-bridge', x === 35 ? 'left' : x === 43 ? 'right' : 'deck', x, 17.5, -20);
  }
  // Rails have narrow physical bases; the deck remains a continuous 64px passage.
  block(sample, 35, 17.6, 9, 0.18);
  block(sample, 35, 19.75, 9, 0.18);

  object(sample, 'lpc-house-hall', undefined, 15, 9, 15.2);
  object(sample, 'lpc-door-small', 'closed', 17, 13, 15.21);
  block(sample, 16, 11.5, 4, 3.2);
  block(sample, 20, 10.5, 2, 3.4);
  object(sample, 'lpc-house-brick', undefined, 29, 9, 15);
  object(sample, 'lpc-door-tall', 'closed', 32, 13, 15.01);
  block(sample, 30, 12, 4, 3);
  object(sample, 'lpc-house-paneled', undefined, 8, 22, 27);
  object(sample, 'lpc-door-small', 'closed', 11.5, 24.5, 27.01);
  block(sample, 8, 24, 5, 3);

  // Boundary trees enclose the composition; individual trunks, not canopies, collide.
  const boundary: TilePoint[] = [
    [2, 4],
    [5, 3],
    [8, 4],
    [11, 3],
    [14, 4],
    [17, 3],
    [20, 4],
    [23, 3],
    [26, 4],
    [29, 3],
    [32, 4],
    [35, 3],
    [38, 4],
    [41, 3],
    [44, 4],
    [2, 8],
    [3, 12],
    [2, 16],
    [3, 20],
    [2, 24],
    [3, 28],
    [2, 32],
    [44, 8],
    [43, 12],
    [45, 16],
    [45, 24],
    [43, 28],
    [44, 32],
    [6, 33],
    [10, 32],
    [14, 33],
    [18, 32],
    [27, 33],
    [31, 32],
    [39, 33],
  ];
  boundary.forEach(([x, y], index) => tree(sample, x, y, index % 4 === 0 ? 'pine' : 'oak'));
  const grove: TilePoint[] = [
    [6, 8],
    [9, 7],
    [12, 8],
    [6, 12],
    [13, 13],
    [6, 16],
    [14, 17],
    [7, 21],
  ];
  grove.forEach(([x, y], index) => tree(sample, x, y, index === 1 ? 'oldOak' : 'tallOak'));
  (
    [
      [25, 10],
      [27, 14],
      [37, 10],
      [40, 12],
      [30, 22],
      [17, 26],
      [16, 30],
      [29, 30],
      [40, 30],
    ] as const
  ).forEach(([x, y]) => tree(sample, x, y));

  flowers(
    sample,
    [
      [15, 15],
      [16, 15],
      [20, 15],
      [21, 15],
      [29, 15],
      [33, 15],
      [34, 15],
    ],
    1,
  );
  flowers(
    sample,
    [
      [8, 27],
      [9, 27],
      [10, 27],
      [13, 26],
      [13, 25],
      [14, 25],
    ],
    5,
  );
  flowers(
    sample,
    [
      [34, 15],
      [35, 15],
      [34, 16],
      [43, 16],
      [43, 21],
      [42, 24],
      [41, 24],
      [39, 24],
      [36, 24],
    ],
    3,
  );
  flowers(
    sample,
    [
      [6, 10],
      [11, 10],
      [12, 10],
      [7, 13],
      [12, 14],
      [8, 15],
      [10, 15],
    ],
    7,
  );
  flowers(
    sample,
    [
      [17, 22],
      [18, 23],
      [19, 24],
      [27, 21],
      [28, 21],
      [30, 27],
      [31, 28],
    ],
    25,
  );

  for (const [x, y, frame] of [
    [5, 26, 'large'],
    [39, 7, 'large'],
    [6, 17, 'medium'],
    [40, 26, 'medium'],
    [28, 29, 'small'],
  ] as const) {
    object(sample, 'lpc-rocks', frame, x, y - (frame === 'large' ? 2 : 0), y + 0.8);
    block(sample, x + 0.2, y + 0.2, frame === 'small' ? 0.6 : 1.5, 0.6);
  }

  // The old stone entrance is dressed with the same masonry used below ground.
  for (const x of [34, 35, 38, 39]) {
    for (let y = 0; y < 3; y++) object(sample, 'lpc-walls', (y + 3) * 6 + 1, x, 23 + y, 26);
    block(sample, x, 25, 1, 1);
  }
  for (let x = 36; x < 38; x++) {
    for (let y = 24; y < 27; y++) ground(sample, 'lpc-stairs', 'down', x, y, -15);
  }
  object(sample, 'lpc-arch', 'stone', 34.5, 23, 26);
  object(sample, 'lpc-dungeon-details', 'ivy', 34, 23.6, 26.1);
  object(sample, 'lpc-sign', 'oak', 25.6, 20.1, 21);
  object(sample, 'lpc-sign', 'oak', 34, 27, 28);

  sample.npcs.push({
    id: 'mira',
    name: 'Mira',
    role: 'Village keeper',
    appearance: 'ash',
    direction: 'right',
    ...at(22.5, 19),
    lines: [
      'Welcome to Willowmere. The kettle is warm, and there is always room for one more traveler.',
      'The red-roofed cottage belongs to our gardener. Follow the eastern path to her water garden; the bridge is the best place to watch the afternoon drift by.',
      'Those old steps to the southeast lead to the Lantern Vault. Oren keeps the lamps lit down there. Tell him I have not forgotten his tea.',
    ],
  });
  sample.landmarks.push(
    {
      id: 'willowmere-sign',
      name: 'Willowmere crossroads',
      ...at(25.8, 21.1),
      radius: 64,
      kind: 'sign',
      description:
        'Willowmere • West: the listening grove. East: the water garden. Southeast: the Lantern Vault. Please leave the gate as you found it.',
    },
    {
      id: 'village-hall',
      name: 'The gathering hall',
      ...at(17.5, 15.8),
      radius: 68,
      kind: 'view',
      description:
        'A hand-lettered notice reads: Soup at sundown. Bring a bowl, a story, or simply yourself. The hall windows glow with the last of the afternoon sun.',
    },
    {
      id: 'listening-grove',
      name: 'The listening grove',
      ...at(9.5, 12),
      radius: 72,
      kind: 'view',
      description:
        'The old oaks lean together around a small clearing. Someone has tucked blue flowers between their roots. For a moment, the whole village sounds very far away.',
    },
    {
      id: 'water-garden',
      name: 'The water garden',
      ...at(39, 18.8),
      radius: 72,
      kind: 'view',
      description:
        'The bridge boards are smooth from years of footsteps. Beneath them, clear water threads through the flower beds. Mira says the first lily always opens here.',
    },
    {
      id: 'vault-entrance',
      name: 'The Lantern Vault',
      ...at(37, 27),
      radius: 76,
      kind: 'portal',
      destination: 'dungeon',
      description:
        'Warm light rises from the old stone stairs. Follow them down into the Lantern Vault.',
    },
  );
  return sample;
}
