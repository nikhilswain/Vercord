import type { WorldThemeId } from '../../catalog/themes';
import type { RpgSample, RpgStamp, RpgTexture, Rect } from '../v1/types';
import { HOUSE_V2_TEXTURES } from '../house-v2/assets';
import { RPG_TEXTURES } from '../v1/assets';
import { TOWN_HALL_TEXTURES } from '../v1/town-hall-assets';
import type { WorldScene } from '../../document';

export const HALL_BOARDS = {
  'hall:expeditions': { name: 'Expedition board', subtitle: 'Clues, routes & preparations' },
  'hall:travelers': { name: 'Traveler register', subtitle: 'Company for the road ahead' },
  'hall:chronicle': { name: 'Town chronicle', subtitle: 'A record of your journey' },
  'hall:requests': { name: 'Request board', subtitle: 'Commissions from the townsfolk' },
} as const;
export type HallBoardId = keyof typeof HALL_BOARDS;
export const isHallBoardId = (id: string): id is HallBoardId => Object.hasOwn(HALL_BOARDS, id);

const castle: RpgTexture = {
  key: 'hall-v1-castle',
  url: '/game-assets/town-hall/castle.png',
  frames: {
    wall: { x: 0, y: 48, width: 96, height: 80 },
    column: { x: 224, y: 96, width: 32, height: 96 },
    rugNW: { x: 0, y: 128, width: 32, height: 32 },
    rugN: { x: 32, y: 128, width: 32, height: 32 },
    rugNE: { x: 64, y: 128, width: 32, height: 32 },
    rugW: { x: 0, y: 160, width: 32, height: 32 },
    rug: { x: 32, y: 160, width: 32, height: 32 },
    rugE: { x: 64, y: 160, width: 32, height: 32 },
    rugSW: { x: 0, y: 192, width: 32, height: 32 },
    rugS: { x: 32, y: 192, width: 32, height: 32 },
    rugSE: { x: 64, y: 192, width: 32, height: 32 },
    window: { x: 128, y: 480, width: 32, height: 64 },
    candle: { x: 172, y: 544, width: 12, height: 24 },
  },
};
const furniture: RpgTexture = {
  key: 'hall-v1-furniture',
  url: '/game-assets/town-hall/furniture.png',
  frames: {
    counterL: { x: 0, y: 0, width: 32, height: 64 },
    counter: { x: 32, y: 0, width: 32, height: 64 },
    counterR: { x: 64, y: 0, width: 32, height: 64 },
    bench: { x: 0, y: 800, width: 96, height: 32 },
    shelf: { x: 352, y: 128, width: 32, height: 64 },
    post: { x: 8, y: 64, width: 16, height: 32 },
    ledger: { x: 352, y: 32, width: 32, height: 32 },
    table: { x: 136, y: 176, width: 88, height: 72 },
  },
};
const boards: RpgTexture = {
  key: 'hall-v1-board',
  url: '/game-assets/town-hall/noticeboard.png',
  frames: { board: { x: 0, y: 0, width: 96, height: 64 } },
};
const notices: RpgTexture = {
  key: 'hall-v1-notices',
  url: '/game-assets/town-hall/notices.png',
  frames: {
    letter: { x: 0, y: 0, width: 32, height: 32 },
    parchment: { x: 160, y: 0, width: 32, height: 32 },
    note: { x: 0, y: 32, width: 32, height: 32 },
    feather: { x: 64, y: 32, width: 32, height: 32 },
  },
};

export interface TownHallLayout {
  scene: WorldScene;
  animations: Array<RpgStamp & { frames: string[]; durationMs: number; phaseMs?: number }>;
}

/** Version-pinned civic geometry shared by the renderer and authenticated presence.
 * This is a public building, never a Discord channel house or a randomly rolled room. */
export function buildTownHall(theme: WorldThemeId): TownHallLayout {
  const width = 1024,
    height = 864;
  const scene: RpgSample = {
    id: theme,
    name: 'Town Hall',
    subtitle: 'A hearth for every traveler',
    bounds: { x: 0, y: 0, width, height },
    spawn: { x: 512, y: 748 },
    textures: [],
    stamps: [],
    colliders: [],
    lights: [],
    background: '#171b18',
    npcs: [
      {
        id: 'hall:mara',
        name: 'Mara',
        role: 'Hall keeper',
        appearance: 'ash',
        direction: 'left',
        x: 704,
        y: 320,
        lines: [
          'Welcome to Town Hall. Before you head into Mosswild, take a look at the expedition board on the left.',
          'The register shows travelers you can meet or message. Your discoveries belong in the chronicle on the right.',
          'No commissions are posted yet. When the townsfolk need help, their requests will appear on the lower-left board.',
          'The door behind the eastern columns leads down to the Lantern Vault. The forest waygate is outside in town.',
        ],
      },
      {
        id: 'hall:ellin',
        name: 'Ellin',
        role: 'Town archivist',
        appearance: 'rowan',
        direction: 'down',
        x: 816,
        y: 656,
        lines: [
          'A chronicle remembers more than battles. New trails, old clues, and people helped all deserve a place here.',
          'The records on the lectern follow your own journey. Bring back a story worth remembering.',
        ],
      },
    ],
    landmarks: [
      {
        id: 'hall:exit',
        name: 'Town square',
        description: 'Return through the front doors to Town Hall’s porch.',
        kind: 'portal',
        destination: 'return',
        x: 512,
        y: 812,
        radius: 38,
      },
      {
        id: 'hall:cellar',
        name: 'Lantern Vault',
        description: 'The enclosed cellar stair leads into the old vault.',
        kind: 'portal',
        destination: 'dungeon',
        x: 912,
        y: 216,
        radius: 38,
        labelAnchor: { x: 912, y: 106 },
      },
      {
        id: 'hall:charter',
        name: 'The Willowmere charter',
        description:
          'Leave the trail kinder than you found it. Share your knowledge. Make room at the hearth for the next traveler.',
        kind: 'sign',
        x: 512,
        y: 336,
        radius: 40,
      },
    ],
  };
  const animations: TownHallLayout['animations'] = [];
  const source = [
    ...HOUSE_V2_TEXTURES,
    ...RPG_TEXTURES,
    ...TOWN_HALL_TEXTURES,
    castle,
    furniture,
    boards,
    notices,
  ];
  const stamp = (
    texture: string,
    frame: string | number,
    x: number,
    y: number,
    depth?: number,
    extra: Partial<RpgStamp> = {},
  ) => {
    const sheet = source.find((t) => t.key === texture)!;
    const h = typeof frame === 'string' ? (sheet.frames?.[frame]?.height ?? 32) : 32;
    scene.stamps.push({ texture, frame, x, y, depth: depth ?? y + h, ...extra });
  };
  const block = (x: number, y: number, w: number, h: number) =>
    scene.colliders.push({ x, y, width: w, height: h });
  const prop = (texture: string, frame: string, x: number, y: number, feet: Rect) => {
    stamp(texture, frame, x, y, y + feet.y + feet.height);
    block(x + feet.x, y + feet.y, feet.width, feet.height);
  };
  for (let y = 112; y < height - 32; y += 32)
    for (let x = 32; x < width - 32; x += 32) stamp('house-v2-floor', 'walnut', x, y, -100);
  for (let x = 32; x < width - 32; x += 96) stamp(castle.key, 'wall', x, 32, -90);
  block(0, 0, width, 112);
  block(0, 112, 48, height - 112);
  block(width - 48, 112, 48, height - 112);
  block(48, height - 24, width - 96, 24);
  // Continuous cutaway wall bases and a broad threshold; no arrow tile or black floor gap.
  for (let y = 112; y < height - 32; y += 32) {
    for (const x of [32, width - 48])
      stamp('house-v2-floor', 'walnut', x, y, -65, { width: 16, tint: 0x766653 });
  }
  for (let x = 32; x < width - 32; x += 32)
    if (x < 448 || x >= 576)
      stamp('house-v2-floor', 'walnut', x, 832, 850, { height: 16, tint: 0x665548 });

  const carpet = (x: number, y: number, columns: number, rows: number) => {
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < columns; col++) {
        const edge = `${row === 0 ? 'N' : row === rows - 1 ? 'S' : ''}${col === 0 ? 'W' : col === columns - 1 ? 'E' : ''}`;
        stamp(castle.key, `rug${edge}`, x + col * 32, y + row * 32, -80);
      }
  };
  carpet(416, 304, 6, 16);
  carpet(352, 144, 10, 5);
  // The columned nave makes this read as a public hall at the first step through the door.
  for (const x of [288, 704])
    for (const y of [144, 384, 624])
      prop(castle.key, 'column', x, y, { x: 3, y: 72, width: 26, height: 24 });
  for (const x of [112, 240, 752, 880]) stamp(castle.key, 'window', x, 48, -60);
  for (const x of [368, 624]) stamp('town-hall-details', 'banner', x, 48, 145);
  // Reception counter, ledger, flickering hearth and a real passage behind the desk.
  for (let i = 0; i < 10; i++)
    stamp(
      furniture.key,
      i === 0 ? 'counterL' : i === 9 ? 'counterR' : 'counter',
      352 + i * 32,
      240,
      291,
    );
  block(356, 272, 312, 24);
  stamp('house-v2-paper', 'notes', 496, 246, 293);
  stamp(furniture.key, 'ledger', 560, 228, 294);
  stamp(notices.key, 'feather', 532, 228, 295);
  prop('house-v2-fireplace', 'carved', 464, 64, { x: 8, y: 48, width: 80, height: 36 });
  animations.push({
    texture: 'house-v2-fire',
    frames: ['fire0', 'fire1', 'fire2'],
    x: 488,
    y: 96,
    depth: 156,
    durationMs: 720,
  });
  scene.lights.push({ x: 512, y: 134, radius: 128, color: 0xf1c678 });
  animations.push({
    texture: 'house-v2-clock',
    frames: ['clock0', 'clock1', 'clock2', 'clock1'],
    x: 64,
    y: 116,
    depth: 212,
    durationMs: 1800,
  });
  block(68, 188, 24, 24);

  const board = (id: HallBoardId, x: number, y: number, papers: boolean) => {
    stamp(furniture.key, 'post', x + 8, y + 48, y + 80);
    stamp(furniture.key, 'post', x + 72, y + 48, y + 80);
    stamp(boards.key, 'board', x, y, y + 81);
    if (papers) {
      stamp(notices.key, 'parchment', x + 10, y + 10, y + 82);
      stamp(notices.key, 'letter', x + 51, y + 14, y + 83);
      stamp(notices.key, 'note', x + 34, y + 28, y + 84);
    } else stamp(notices.key, 'parchment', x + 32, y + 15, y + 82);
    block(x, y + 64, 96, 16);
    scene.landmarks.push({
      id,
      name: HALL_BOARDS[id].name,
      description: HALL_BOARDS[id].subtitle,
      kind: 'sign',
      x: x + 48,
      y: y + 98,
      radius: 42,
      labelAnchor: { x: x + 48, y: y - 8 },
    });
  };
  board('hall:expeditions', 128, 256, true);
  board('hall:requests', 128, 480, false);
  board('hall:chronicle', 800, 352, true);
  // A staffed register desk, distinct from the wall-mounted boards.
  prop('house-v2-desk', 'dark', 800, 536, { x: 4, y: 24, width: 88, height: 24 });
  stamp('house-v2-paper', 'notes', 824, 536, 595);
  scene.landmarks.push({
    id: 'hall:travelers',
    name: HALL_BOARDS['hall:travelers'].name,
    description: HALL_BOARDS['hall:travelers'].subtitle,
    kind: 'sign',
    x: 848,
    y: 616,
    radius: 42,
    labelAnchor: { x: 848, y: 528 },
  });
  for (const x of [800, 832, 864])
    prop(furniture.key, 'shelf', x, 112, { x: 2, y: 48, width: 28, height: 16 });
  // The old exterior stair now belongs to a stone-lined alcove inside the east wing.
  stamp('lpc-stairs', 'down', 896, 144, -50);
  stamp('lpc-stairs', 'down', 896, 176, -50);
  for (const x of [880, 936])
    prop(castle.key, 'column', x, 96, { x: 3, y: 72, width: 26, height: 24 });
  for (const y of [656, 736])
    for (const x of [144, 624])
      prop(furniture.key, 'bench', x, y, { x: 4, y: 10, width: 88, height: 20 });
  for (const [x, y] of [
    [64, 752],
    [928, 752],
    [64, 336],
    [928, 384],
  ])
    prop('house-v2-plants', 'fern', x!, y!, { x: 8, y: 44, width: 16, height: 16 });
  for (const [x, y] of [
    [256, 268],
    [736, 268],
    [256, 580],
    [736, 580],
  ]) {
    stamp(castle.key, 'candle', x!, y!, y! + 26);
    scene.lights.push({ x: x! + 6, y: y! + 8, radius: 72, color: 0xf3d68e });
  }
  const used = new Set([...scene.stamps, ...animations].map((s) => s.texture));
  scene.textures = source.filter(
    (asset, i) => used.has(asset.key) && source.findIndex((a) => a.key === asset.key) === i,
  );
  return {
    scene: {
      ...scene,
      stamps: scene.stamps.map((s, i) => ({ ...s, id: `hall-v1:stamp:${i}` })),
      colliders: scene.colliders.map((s, i) => ({ ...s, id: `hall-v1:solid:${i}` })),
      lights: scene.lights.map((s, i) => ({ ...s, id: `hall-v1:light:${i}` })),
    },
    animations,
  };
}
