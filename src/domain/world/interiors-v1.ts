import { z } from 'zod';
import type { MapRoomType } from '../map/snapshot';
import { getWorldTheme, WORLD_THEME_IDS, type WorldThemeId } from './catalog/themes';
import { isHouseSceneId, type HouseSceneId } from './catalog/scenes';
import { HOUSE_FRAMES, HOUSE_TEXTURE } from './content/house-v1/assets';
import type { Rect, RpgStamp } from './content/v1/types';
import type { WorldScene } from './document';
import { containsRect, sceneIsReachable } from './geometry';
import { seededRandom } from './random';

const coordinate = z.number().int().min(0).max(1280);
const point = z.strictObject({ x: coordinate, y: coordinate });
const rectangle = point.extend({ width: coordinate.positive(), height: coordinate.positive() });
const id = z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/u);
const color = z.number().int().min(0).max(0xffffff);
const text = z.string().min(1).max(200);
const textureSchema = z.strictObject({
  key: z.literal(HOUSE_TEXTURE.key),
  url: z.literal(HOUSE_TEXTURE.url),
  frames: z.record(z.string(), rectangle),
});
const sceneSchema = z.strictObject({
  id: z.enum(WORLD_THEME_IDS),
  name: text,
  subtitle: text,
  bounds: rectangle,
  spawn: point,
  textures: z.array(textureSchema).length(1),
  stamps: z
    .array(
      point.extend({
        id,
        texture: z.literal(HOUSE_TEXTURE.key),
        frame: z.enum(HOUSE_FRAMES),
        width: coordinate.positive().max(256).optional(),
        height: coordinate.positive().max(128).optional(),
        depth: z.number().finite().min(-10000).max(1280),
        tint: color.optional(),
      }),
    )
    .min(1)
    .max(1000),
  colliders: z.array(rectangle.extend({ id })).max(64),
  npcs: z.array(z.never()).max(0),
  landmarks: z
    .array(
      point.extend({
        id: z.literal('house-exit'),
        name: text,
        description: text,
        radius: z.number().int().min(24).max(64),
        kind: z.literal('portal'),
        destination: z.literal('return'),
      }),
    )
    .length(1),
  lights: z.array(point.extend({ id, radius: z.number().int().min(16).max(256), color })).max(4),
  background: z.string().regex(/^#[a-fA-F0-9]{6}$/u),
});
const interiorShape = z.strictObject({
  schemaVersion: z.literal(1),
  generatorVersion: z.literal(1),
  contentVersion: z.literal('house-v1'),
  worldId: z.uuid(),
  landmarkId: z
    .string()
    .refine(isHouseSceneId)
    .transform((value) => value as HouseSceneId),
  themeId: z.enum(WORLD_THEME_IDS),
  recipe: z.enum(['parlor', 'hall', 'library']),
  scene: sceneSchema,
});
export type HouseInterior = z.infer<typeof interiorShape>;

/** Independent versioned artifact: adding rooms never changes the saved town's checksum. */
export function parseHouseInterior(value: unknown): HouseInterior {
  const house = interiorShape.parse(value);
  const { scene } = house;
  const frames = scene.textures[0]!.frames;
  const knownFrames = HOUSE_TEXTURE.frames!;
  const objects = [...scene.stamps, ...scene.colliders, ...scene.lights, ...scene.landmarks];
  if (
    scene.id !== house.themeId ||
    scene.bounds.x !== 0 ||
    scene.bounds.y !== 0 ||
    scene.bounds.width !== 768 ||
    scene.bounds.height !== 640 ||
    Object.keys(frames).length !== HOUSE_FRAMES.length ||
    HOUSE_FRAMES.some((name) => {
      const actual = frames[name];
      const known = knownFrames[name]!;
      return (
        !actual ||
        actual.x !== known.x ||
        actual.y !== known.y ||
        actual.width !== known.width ||
        actual.height !== known.height
      );
    }) ||
    new Set(objects.map((entry) => entry.id)).size !== objects.length ||
    scene.colliders.some((box) => !containsRect(scene.bounds, box)) ||
    scene.stamps.some((stamp) => {
      const frame = knownFrames[stamp.frame]!;
      return !containsRect(scene.bounds, {
        ...stamp,
        width: stamp.width ?? frame.width,
        height: stamp.height ?? frame.height,
      });
    }) ||
    !sceneIsReachable(scene)
  )
    throw new Error('Invalid saved house interior');
  return house;
}

export const houseInteriorSchema = z.unknown().transform((value, context) => {
  try {
    return parseHouseInterior(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid saved house interior' });
    return z.NEVER;
  }
});

export function generateHouseInterior(input: {
  worldId: string;
  seed: string;
  themeId: WorldThemeId;
  landmarkId: string;
  roomType: MapRoomType;
}): HouseInterior {
  if (!isHouseSceneId(input.landmarkId)) throw new Error('Invalid house identity');
  const palette = getWorldTheme(input.themeId).interior;
  const random = seededRandom(`${input.seed}:${input.landmarkId}:house-v1`);
  const rugTint = palette.rugTints[Math.floor(random() * palette.rugTints.length)]!;
  const offset = Math.floor(random() * 3) * 16;
  const recipe =
    input.roomType === 'voice' || input.roomType === 'stage'
      ? 'hall'
      : input.roomType === 'forum' ||
          input.roomType === 'media' ||
          input.roomType === 'announcement'
        ? 'library'
        : 'parlor';
  const scene: WorldScene = {
    id: input.themeId,
    name: 'The gathering room',
    subtitle:
      recipe === 'hall'
        ? 'A place to gather around the hearth'
        : recipe === 'library'
          ? 'Books, shared stories and a quiet reading corner'
          : 'A warm room for good company',
    bounds: { x: 0, y: 0, width: 768, height: 640 },
    spawn: { x: 384, y: 528 },
    textures: [structuredClone(HOUSE_TEXTURE)],
    stamps: [],
    colliders: [],
    npcs: [],
    landmarks: [
      {
        id: 'house-exit',
        name: 'Back to town',
        description: 'The doorway leads back to the same house in town.',
        x: 384,
        y: 592,
        radius: 48,
        kind: 'portal',
        destination: 'return',
      },
    ],
    lights: [{ id: 'house:hearth-light', x: 384, y: 145, radius: 144, color: 0xf2c88e }],
    background: palette.background,
  };
  const stamp = (
    frame: (typeof HOUSE_FRAMES)[number],
    x: number,
    y: number,
    depth: number,
    extra: Partial<RpgStamp> = {},
  ) => {
    scene.stamps.push({
      id: `house:stamp:${scene.stamps.length}`,
      texture: HOUSE_TEXTURE.key,
      frame,
      x,
      y,
      depth,
      ...extra,
    });
  };
  const block = (box: Rect) =>
    scene.colliders.push({ id: `house:collider:${scene.colliders.length}`, ...box });
  const furniture = (frame: (typeof HOUSE_FRAMES)[number], x: number, y: number, feet: Rect) => {
    stamp(frame, x, y, y + feet.y + feet.height, { tint: palette.furnitureTint });
    block({ x: x + feet.x, y: y + feet.y, width: feet.width, height: feet.height });
  };
  for (let y = 96; y < 608; y += 32)
    for (let x = 32; x < 736; x += 32) stamp('floor', x, y, -100, { tint: palette.floorTint });
  for (let x = 32; x < 736; x += 32) stamp('wall', x, 32, -90, { tint: palette.wallTint });
  block({ x: 0, y: 0, width: 768, height: 96 });
  block({ x: 0, y: 96, width: 48, height: 544 });
  block({ x: 720, y: 96, width: 48, height: 544 });
  block({ x: 48, y: 608, width: 672, height: 32 });
  for (let y = 96; y < 608; y += 32) {
    stamp('floor', 32, y, -80, { width: 16, tint: 0x746456 });
    stamp('floor', 720, y, -80, { width: 16, tint: 0x746456 });
  }
  for (let x = 32; x < 736; x += 32)
    if (x < 336 || x >= 432) stamp('floor', x, 608, 625, { height: 16, tint: palette.wallTint });
  stamp('threshold', 336, 576, -80);
  stamp('window', 144, 32, -75);
  stamp('window', 560, 32, -75);
  furniture('hearth', 336, 64, { x: 8, y: 48, width: 80, height: 48 });
  furniture('shelf', 64, 112, { x: 3, y: 50, width: 90, height: 28 });
  furniture('counter', 544, 112, { x: 3, y: 26, width: 122, height: 32 });
  furniture('plant', 80, 512, { x: 7, y: 30, width: 18, height: 17 });
  furniture('plant', 656, 512, { x: 7, y: 30, width: 18, height: 17 });
  const table = (x: number, y: number) =>
    furniture('table', x, y, { x: 6, y: 18, width: 84, height: 30 });
  const chair = (x: number, y: number) =>
    furniture('chair', x, y, { x: 4, y: 22, width: 24, height: 18 });
  if (recipe === 'hall') {
    for (const x of [160, 512]) {
      stamp('rug', x - 16, 268, -85, { height: 128, tint: rugTint });
      table(x, 300);
      chair(x - 44, 306);
      chair(x + 108, 306);
      chair(x + 32, 244);
      chair(x + 32, 370);
    }
  } else {
    stamp('rug', 128 + offset, 284, -85, { width: 192, height: 128, tint: rugTint });
    table(176 + offset, 316);
    furniture('sofa', 128 + offset, 224, { x: 2, y: 30, width: 60, height: 28 });
    furniture('sofa', 256 + offset, 224, { x: 2, y: 30, width: 60, height: 28 });
    chair(204 + offset, 390);
    if (recipe === 'library') {
      furniture('shelf', 512, 240, { x: 3, y: 50, width: 90, height: 28 });
      furniture('shelf', 608, 240, { x: 3, y: 50, width: 90, height: 28 });
    }
    stamp('rug', 512, 368, -85, { tint: rugTint });
    furniture('sofa', 544, 376, { x: 2, y: 30, width: 60, height: 28 });
  }
  return parseHouseInterior({
    schemaVersion: 1,
    generatorVersion: 1,
    contentVersion: 'house-v1',
    worldId: input.worldId,
    landmarkId: input.landmarkId,
    themeId: input.themeId,
    recipe,
    scene,
  });
}
