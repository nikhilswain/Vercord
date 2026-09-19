import { z } from 'zod';
import { WORLD_THEME_IDS } from '../../catalog/themes';
import { isHouseSceneId, type HouseSceneId } from '../../catalog/scenes';
import { containsRect, sceneIsReachable } from '../../geometry';
import { HOUSE_V2_ASSETS } from './assets';

export const HOUSE_RECIPES = ['library', 'herbalist', 'lodge', 'workshop', 'tearoom'] as const;
const coordinate = z.number().int().min(0).max(1280);
const point = z.strictObject({ x: coordinate, y: coordinate });
const rect = point.extend({ width: coordinate.positive(), height: coordinate.positive() });
const id = z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/u);
const text = z.string().min(1).max(240);
const color = z.number().int().min(0).max(0xffffff);
const stamp = point.extend({
  id,
  texture: id,
  frame: id,
  width: coordinate.positive().max(256).optional(),
  height: coordinate.positive().max(192).optional(),
  depth: z.number().int().min(-10000).max(1280),
  tint: color.optional(),
});
const shape = z.strictObject({
  schemaVersion: z.literal(2),
  generatorVersion: z.literal(2),
  contentVersion: z.literal('house-v2'),
  worldId: z.uuid(),
  landmarkId: z
    .string()
    .refine(isHouseSceneId)
    .transform((v) => v as HouseSceneId),
  themeId: z.enum(WORLD_THEME_IDS),
  recipe: z.enum(HOUSE_RECIPES),
  scene: z.strictObject({
    id: z.enum(WORLD_THEME_IDS),
    name: text,
    subtitle: text,
    bounds: rect,
    spawn: point,
    textures: z
      .array(z.strictObject({ key: id, url: z.string().max(200), frames: z.record(id, rect) }))
      .min(1)
      .max(16),
    stamps: z.array(stamp).min(1).max(1000),
    colliders: z.array(rect.extend({ id })).max(80),
    npcs: z.array(z.never()).max(0),
    landmarks: z
      .array(
        point.extend({
          id,
          name: text,
          description: text,
          radius: z.number().int().min(24).max(64),
          kind: z.enum(['sign', 'view', 'portal']),
          destination: z.literal('return').optional(),
        }),
      )
      .min(2)
      .max(12),
    lights: z.array(point.extend({ id, radius: z.number().int().min(16).max(192), color })).max(8),
    background: z.string().regex(/^#[a-fA-F0-9]{6}$/u),
  }),
  animations: z
    .array(
      stamp.omit({ frame: true }).extend({
        frames: z.array(id).min(2).max(8),
        durationMs: z.number().int().min(300).max(5000),
        phaseMs: z.number().int().min(0).max(5000),
        trigger: id.optional(),
      }),
    )
    .max(8),
  interactions: z
    .array(
      z.strictObject({
        id,
        action: z.enum(['Read', 'Use']),
        lines: z.array(text).min(1).max(4),
        effect: z.enum(['warmth', 'brew', 'spin', 'clock']).optional(),
      }),
    )
    .min(1)
    .max(10),
});
export type HouseInteriorV2 = z.infer<typeof shape>;
export type HouseInteraction = HouseInteriorV2['interactions'][number];

export function parseHouseInteriorV2(value: unknown): HouseInteriorV2 {
  const house = shape.parse(value),
    { scene } = house;
  const known = new Map(scene.textures.map((asset) => [asset.key, asset]));
  const objects = [
    ...scene.stamps,
    ...scene.colliders,
    ...scene.landmarks,
    ...scene.lights,
    ...house.animations,
  ];
  const invalid = scene.textures.some((asset) => {
    const pinned = HOUSE_V2_ASSETS.get(asset.key);
    return (
      !pinned ||
      asset.url !== pinned.url ||
      Object.keys(asset.frames).length !== Object.keys(pinned.frames!).length ||
      Object.entries(asset.frames).some(([name, frame]) => {
        const expected = pinned.frames![name];
        return (
          !expected ||
          (['x', 'y', 'width', 'height'] as const).some((key) => expected[key] !== frame[key])
        );
      })
    );
  });
  if (
    invalid ||
    known.size !== scene.textures.length ||
    scene.id !== house.themeId ||
    scene.bounds.x !== 0 ||
    scene.bounds.y !== 0 ||
    scene.bounds.width < 608 ||
    scene.bounds.width > 768 ||
    scene.bounds.height < 544 ||
    scene.bounds.height > 640 ||
    new Set(objects.map((o) => o.id)).size !== objects.length ||
    scene.colliders.some((box) => !containsRect(scene.bounds, box)) ||
    [...scene.stamps, ...house.animations].some((s) => {
      const frames = 'frames' in s ? s.frames : [s.frame];
      return frames.some((name) => {
        const f = known.get(s.texture)?.frames[name];
        return (
          !f ||
          !containsRect(scene.bounds, {
            ...s,
            width: s.width ?? f.width,
            height: s.height ?? f.height,
          })
        );
      });
    }) ||
    scene.landmarks.filter(
      (l) => l.destination === 'return' && l.id === 'house-exit' && l.kind === 'portal',
    ).length !== 1 ||
    scene.landmarks.some((l) => l.id !== 'house-exit' && (l.kind === 'portal' || l.destination)) ||
    new Set(house.interactions.map((i) => i.id)).size !== house.interactions.length ||
    house.interactions.some(
      (i) => !scene.landmarks.some((l) => l.id === i.id && l.kind !== 'portal'),
    ) ||
    house.animations.some(
      (a) => a.trigger && !house.interactions.some((i) => i.id === a.trigger),
    ) ||
    !sceneIsReachable(scene)
  )
    throw new Error('Invalid saved house interior');
  return house;
}
