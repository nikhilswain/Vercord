import type { MapRoomType } from '../../../map/snapshot';
import { getWorldTheme, type WorldThemeId } from '../../catalog/themes';
import { isHouseSceneId } from '../../catalog/scenes';
import { seededRandom, shuffled } from '../../random';
import type { Rect } from '../v1/types';
import { HOUSE_TEXTURE } from '../house-v1/assets';
import { HOUSE_V2_ASSETS, HOUSE_V2_TEXTURES } from './assets';
import {
  HOUSE_RECIPES,
  parseHouseInteriorV2,
  type HouseInteriorV2,
  type HouseInteraction,
} from './schema';

export interface HouseGenerationInput {
  worldId: string;
  seed: string;
  themeId: WorldThemeId;
  landmarkId: string;
  roomType: MapRoomType;
}

/** Authored arrangements shuffled in groups of five; names and channel order never reroll a home. */
export function generateHouseInteriorV2(input: HouseGenerationInput): HouseInteriorV2 {
  if (!isHouseSceneId(input.landmarkId)) throw new Error('Invalid house identity');
  const number = Number(input.landmarkId.slice(6));
  const recipe = shuffled(
    HOUSE_RECIPES,
    seededRandom(`${input.worldId}:${input.seed}:house-v2:${Math.floor(number / 5)}`),
  )[number % 5]!;
  const random = seededRandom(`${input.worldId}:${input.seed}:${input.landmarkId}:house-v2`);
  const palette = getWorldTheme(input.themeId).interior;
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const width =
    recipe === 'lodge' || recipe === 'workshop' ? 704 : recipe === 'library' ? 672 : 640;
  const height = recipe === 'lodge' ? 608 : 576;
  const mid = width / 2;
  const names = {
    library: 'The reading room',
    herbalist: 'The herb keeper’s room',
    lodge: 'The wayfarer’s lodge',
    workshop: 'The thread & timber workshop',
    tearoom: 'The fireside tea room',
  };
  const descriptions = {
    library: 'Old journals, lamplight, and a ticking clock',
    herbalist: 'Hanging herbs and a gently simmering pot',
    lodge: 'A warm bed at the end of a long trail',
    workshop: 'Spun flax and the scent of fresh-cut timber',
    tearoom: 'A pot of tea, a quiet hearth, and good company',
  };
  const house: HouseInteriorV2 = {
    schemaVersion: 2,
    generatorVersion: 2,
    contentVersion: 'house-v2',
    worldId: input.worldId,
    landmarkId: input.landmarkId,
    themeId: input.themeId,
    recipe,
    scene: {
      id: input.themeId,
      name: names[recipe],
      subtitle: descriptions[recipe],
      bounds: { x: 0, y: 0, width, height },
      spawn: { x: mid, y: height - 112 },
      textures: [],
      stamps: [],
      colliders: [],
      npcs: [],
      landmarks: [
        {
          id: 'house-exit',
          name: 'Back to town',
          description: 'The doorway leads back to the same house in town.',
          x: mid,
          y: height - 48,
          radius: 40,
          kind: 'portal',
          destination: 'return',
        },
      ],
      lights: [],
      background: palette.background,
    },
    animations: [],
    interactions: [],
  };
  const { scene } = house;
  const key = (name: string) => (name === 'original' ? HOUSE_TEXTURE.key : `house-v2-${name}`);
  const stamp = (
    asset: string,
    frame: string,
    x: number,
    y: number,
    depth?: number,
    extra: Partial<HouseInteriorV2['scene']['stamps'][number]> = {},
  ) => {
    const source = HOUSE_V2_ASSETS.get(key(asset))!.frames![frame]!;
    scene.stamps.push({
      id: `furniture:${scene.stamps.length}`,
      texture: key(asset),
      frame,
      x,
      y,
      depth: depth ?? y + source.height,
      ...extra,
    });
  };
  const block = (x: number, y: number, width: number, height: number) =>
    scene.colliders.push({ id: `solid:${scene.colliders.length}`, x, y, width, height });
  const item = (asset: string, frame: string, x: number, y: number, foot?: Rect) => {
    const source = HOUSE_V2_ASSETS.get(key(asset))!.frames![frame]!;
    const feet = foot ?? { x: 4, y: source.height - 24, width: source.width - 8, height: 20 };
    stamp(asset, frame, x, y, y + feet.y + feet.height);
    block(x + feet.x, y + feet.y, feet.width, feet.height);
  };
  const animate = (
    asset: string,
    frames: string[],
    x: number,
    y: number,
    durationMs: number,
    extra: Partial<HouseInteriorV2['animations'][number]> = {},
  ) => {
    house.animations.push({
      id: `animation:${house.animations.length}`,
      texture: key(asset),
      frames,
      x,
      y,
      depth: y + HOUSE_V2_ASSETS.get(key(asset))!.frames![frames[0]!]!.height,
      durationMs,
      phaseMs: Math.floor(random() * 1000),
      ...extra,
    });
  };
  const interact = (
    id: string,
    name: string,
    x: number,
    y: number,
    lines: string[],
    effect?: HouseInteraction['effect'],
  ) => {
    scene.landmarks.push({
      id,
      name,
      description: lines[0]!,
      x,
      y,
      radius: 44,
      kind: effect ? 'view' : 'sign',
    });
    house.interactions.push({
      id,
      action: effect ? 'Use' : 'Read',
      lines,
      ...(effect ? { effect } : {}),
    });
  };
  const rugTint = pick(palette.rugTints);
  const rug = (x: number, y: number, w = 192, h = 128) =>
    stamp('original', 'rug', x, y, -80, { width: w, height: h, tint: rugTint });
  const chairColor = pick(['moss', 'amber', 'blue']);
  const chair = (x: number, y: number) =>
    item('chair', chairColor, x, y, { x: 4, y: 16, width: 24, height: 16 });
  const floor = input.themeId === 'norse' ? 'ash' : pick(['oak', 'walnut']);
  for (let y = 96; y < height - 32; y += 32)
    for (let x = 32; x < width - 32; x += 32) stamp('floor', floor, x, y, -100);
  for (let x = 32; x < width - 32; x += 32)
    stamp('original', 'wall', x, 32, -90, { tint: palette.wallTint });
  block(0, 0, width, 96);
  block(0, 96, 48, height - 96);
  block(width - 48, 96, 48, height - 96);
  block(48, height - 32, width - 96, 32);
  for (let y = 96; y < height - 32; y += 32) {
    stamp('floor', floor, 32, y, -70, { width: 16, tint: 0x746456 });
    stamp('floor', floor, width - 48, y, -70, { width: 16, tint: 0x746456 });
  }
  for (let x = 32; x < width - 32; x += 32)
    if (x < mid - 48 || x >= mid + 48)
      stamp('original', 'floor', x, height - 32, height - 8, {
        height: 16,
        tint: palette.wallTint,
      });
  stamp('original', 'threshold', mid - 48, height - 64, -75);
  stamp('original', 'window', 112, 32, -75);
  stamp('original', 'window', width - 176, 32, -75);
  item('fireplace', pick(['stone', 'carved', 'brick']), mid - 48, 64, {
    x: 8,
    y: 48,
    width: 80,
    height: 40,
  });
  animate('fire', ['fire0', 'fire1', 'fire2'], mid - 24, 94, 720, {
    width: 48,
    height: 54,
    depth: 153,
  });
  scene.lights.push({ id: 'light:hearth', x: mid, y: 150, radius: 112, color: 0xf6c77e });
  interact(
    'interior:hearth',
    'Warm hearth',
    mid,
    184,
    ['You feed a fallen twig into the fire. Warmth gathers around your hands.'],
    'warmth',
  );
  animate('clock', ['clock0', 'clock1', 'clock2', 'clock1'], width - 112, 104, 1800);
  block(width - 108, 168, 24, 28);
  interact(
    'interior:clock',
    'Pendulum clock',
    width - 96,
    220,
    ['The little brass key turns. The clock settles into its patient, familiar rhythm.'],
    'clock',
  );
  const plant = (frame: string, x: number, y: number) => item('plants', frame, x, y);
  plant('fern', 64, height - 144);
  plant('palm', width - 96, height - 144);
  const table = (x: number, y: number) =>
    item('table', 'oak', x, y, { x: 8, y: 24, width: 80, height: 32 });
  const desk = (x: number, y: number) =>
    item('desk', 'dark', x, y, { x: 4, y: 24, width: 88, height: 24 });
  const shelf = (x: number, y: number) =>
    item('original', 'shelf', x, y, { x: 3, y: 50, width: 90, height: 28 });
  const candle = (x: number, y: number) => {
    stamp('candles', 'candle', x, y + 24, y + 80);
    scene.lights.push({
      id: `light:candle:${scene.lights.length}`,
      x: x + 16,
      y: y + 40,
      radius: 48,
      color: 0xf9dda1,
    });
  };
  if (recipe === 'library') {
    shelf(64, 104);
    shelf(176, 104);
    shelf(64, 224);
    rug(96, 304);
    desk(128, 320);
    chair(160, 388);
    candle(184, 300);
    stamp('paper', 'notes', 144, 324, 378);
    interact('interior:journal', 'Trail keeper’s journal', 224, 392, [
      'The oldest entry describes a bell beneath the forest. The writer heard it most clearly after rain.',
      'A margin note reads: “Some doors are meant to be listened to before they are opened.”',
    ]);
    rug(width - 240, 288, 160, 128);
    table(width - 224, 304);
    chair(width - 192, 372);
    stamp('clutter', 'tea', width - 192, 320, 368);
    plant('tree', width - 256, 200);
    stamp('paper', 'notes', width - 224, 324, 368);
    interact('interior:atlas', 'Weathered field notes', width - 128, 392, [
      'Sketches of pools, fallen arches, and moonlit flowers fill the pages. Different hands have added their own routes.',
      'One traveler has circled a simple rule: leave a mark, so someone else can find the way home.',
    ]);
  } else if (recipe === 'herbalist') {
    desk(80, 136);
    stamp('clutter', 'herbs', 96, 132, 188);
    stamp('clutter', 'bottles', 136, 128, 188);
    plant('tree', 64, 236);
    plant('flowers', 128, 236);
    plant('vase', 192, 252);
    rug(width - 240, 264, 160, 128);
    animate('cauldron', ['pot1', 'pot2', 'pot3', 'pot4'], width - 184, 280, 840, {
      width: 64,
      height: 64,
      depth: 340,
    });
    block(width - 178, 304, 52, 32);
    interact(
      'interior:cauldron',
      'Herb cauldron',
      width - 152,
      368,
      [
        'You stir the fragrant broth. Mint and pine steam curl into the rafters.',
        'A tag on the handle says: “For scent, not supper.”',
      ],
      'brew',
    );
    desk(104, 364);
    candle(160, 344);
    stamp('paper', 'notes', 120, 368, 418);
    interact('interior:herbarium', 'Pressed-flower herbarium', 152, 436, [
      'Moonblossoms open in still places. The keeper has pressed a pale petal beside a drawing of an old stone basin.',
      'A warning underneath: bright colors do not always mean a plant is safe to eat.',
    ]);
  } else if (recipe === 'lodge') {
    const bedColor = pick(['moss', 'amber', 'blue']);
    item('bed', bedColor, 80, 120, { x: 4, y: 16, width: 56, height: 76 });
    item('bed', bedColor, 176, 120, { x: 4, y: 16, width: 56, height: 76 });
    rug(72, 224, 192, 96);
    stamp('clutter', 'basket', 248, 168, 216);
    desk(width - 240, 256);
    candle(width - 192, 236);
    stamp('paper', 'notes', width - 232, 260, 310);
    interact('interior:guestbook', 'Travelers’ guestbook', width - 192, 328, [
      '“Arrived with wet boots. Left with dry socks and a new friend.” The next page is crowded with sketches of forest creatures.',
      'Someone has written: “If the trail feels too long, come back. The light stays on.”',
    ]);
    rug(112, 352);
    table(160, 364);
    chair(192, 432);
    stamp('clutter', 'tea', 192, 380, 426);
    shelf(width - 240, 112);
  } else if (recipe === 'workshop') {
    item('workbench', 'bench', 80, 128);
    item('workbench', 'bench', 80, 260);
    rug(width - 256, 272, 160, 128);
    stamp('wheel', 'base', width - 216, 288, 352);
    animate('wheel', ['wheel1', 'wheel2', 'wheel3', 'wheel4'], width - 216, 288, 600, {
      trigger: 'interior:wheel',
    });
    block(width - 208, 324, 48, 28);
    interact(
      'interior:wheel',
      'Spinning wheel',
      width - 184,
      384,
      ['You turn the wheel. The bobbin hums softly as a loose strand of flax winds around it.'],
      'spin',
    );
    shelf(192, 112);
    stamp('clutter', 'basket', width - 136, 316, 364);
    desk(112, 384);
    candle(176, 364);
    stamp('paper', 'notes', 128, 388, 438);
    interact('interior:patterns', 'Apprentice’s pattern book', 160, 456, [
      'A border pattern repeats a leaf, a bell, and a broken ring. The same marks appear in an old rubbing tucked between the pages.',
      'The apprentice has written: “Not everything broken needs to be made new. Sometimes it needs to be remembered.”',
    ]);
  } else {
    item('original', 'counter', 64, 128, { x: 4, y: 26, width: 120, height: 32 });
    stamp('clutter', 'tea', 80, 124, 192);
    stamp('clutter', 'bottles', 144, 120, 192);
    rug(80, 288, 192, 128);
    table(128, 300);
    chair(160, 368);
    candle(192, 280);
    stamp('paper', 'notes', 144, 316, 360);
    interact('interior:tea', 'Tea keeper’s recipe', 224, 392, [
      'Three mint leaves, a little honey, and enough patience to let the steam settle.',
      'A second hand has added: “Best shared after a difficult walk.”',
    ]);
    rug(width - 240, 304, 160, 128);
    table(width - 224, 320);
    chair(width - 192, 388);
    stamp('clutter', 'tea', width - 192, 336, 384);
    plant('flowers', width - 240, 168);
    stamp('paper', 'letters', width - 224, 324, 380);
    interact('interior:letters', 'Letters by the window', width - 128, 408, [
      'A bundle of letters waits under a smooth river stone. Each begins with the same words: “I found another way through.”',
      'You leave the ribbon tied. Some stories belong to the people who wrote them.',
    ]);
  }
  const used = new Set([...scene.stamps, ...house.animations].map((s) => s.texture));
  scene.textures = structuredClone(
    HOUSE_V2_TEXTURES.filter((t) => used.has(t.key)),
  ) as HouseInteriorV2['scene']['textures'];
  return parseHouseInteriorV2(house);
}
