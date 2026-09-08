import { z } from 'zod';
import { RPG_TEXTURES } from './content/v1/assets';
import { NORSE_TEXTURES } from './content/v1/norse-props';
import type { Rect, RpgSample, RpgStamp } from './content/v1/types';
import { containsRect, footprint, overlaps } from './geometry';

export const WORLD_GENERATOR_VERSION = 1;
export const WORLD_CONTENT_VERSION = 'rpg-v1';
export type WorldThemeId = 'village' | 'norse';
export interface WorldScene extends Omit<RpgSample, 'stamps' | 'colliders' | 'lights'> {
  stamps: Array<RpgStamp & { id: string }>;
  colliders: Array<Rect & { id: string }>;
  lights: Array<RpgSample['lights'][number] & { id: string }>;
}
export interface WorldDocument {
  schemaVersion: 1;
  generatorVersion: 1;
  contentVersion: 'rpg-v1';
  worldId: string;
  themeId: WorldThemeId;
  seed: string;
  geometryRevision: 1;
  scenes: { overworld: WorldScene; dungeon: WorldScene };
}

const coordinate = z.number().finite().min(-256).max(2304);
const dimension = z.number().finite().positive().max(2048);
const point = z.object({ x: coordinate, y: coordinate }).strict();
const rectangle = point.extend({ width: dimension, height: dimension });
const id = z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/);
const text = z.string().min(1).max(4096);
const texture = z
  .object({
    key: id,
    url: z.string().max(256),
    frameWidth: dimension.optional(),
    frameHeight: dimension.optional(),
    frames: z
      .record(id, rectangle)
      .refine((frames) => Object.keys(frames).length <= 16)
      .optional(),
  })
  .strict();
const stamp = point.extend({
  id,
  texture: id,
  frame: z.union([z.number().int().nonnegative().max(1024), id]).optional(),
  width: dimension.max(512).optional(),
  height: dimension.max(512).optional(),
  originX: z.number().min(0).max(1).optional(),
  originY: z.number().min(0).max(1).optional(),
  depth: coordinate.optional(),
  alpha: z.number().min(0).max(1).optional(),
  tint: z.number().int().min(0).max(0xffffff).optional(),
});
const landmark = point.extend({
  id,
  name: text,
  description: text,
  radius: z.number().finite().min(24).max(128),
  kind: z.enum(['sign', 'portal', 'view']),
  destination: z.enum(['village', 'norse', 'dungeon', 'return']).optional(),
});
const npc = point.extend({
  id,
  name: text,
  role: text,
  appearance: z.enum(['rowan', 'ash', 'ivar', 'sigrid']),
  direction: z.enum(['up', 'down', 'left', 'right']),
  lines: z.array(text).min(1).max(12),
});
const scene = z
  .object({
    id: z.enum(['village', 'norse', 'dungeon']),
    name: text,
    subtitle: text,
    bounds: rectangle,
    spawn: point,
    textures: z.array(texture).min(1).max(40),
    stamps: z.array(stamp).min(1).max(6000),
    colliders: z.array(rectangle.extend({ id })).max(2000),
    npcs: z.array(npc).max(32),
    landmarks: z.array(landmark).min(1).max(64),
    lights: z
      .array(
        point.extend({
          id,
          radius: z.number().positive().max(512),
          color: z.number().int().min(0).max(0xffffff),
        }),
      )
      .max(64),
    background: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  })
  .strict();
const schema = z
  .object({
    schemaVersion: z.literal(1),
    generatorVersion: z.literal(1),
    contentVersion: z.literal('rpg-v1'),
    worldId: z.uuid(),
    themeId: z.enum(['village', 'norse']),
    seed: z.uuid(),
    geometryRevision: z.literal(1),
    scenes: z.object({ overworld: scene, dungeon: scene }).strict(),
  })
  .strict();

const catalog = new Map([...RPG_TEXTURES, ...NORSE_TEXTURES].map((entry) => [entry.key, entry]));
const frameCounts: Record<string, number> = {
  'lpc-terrain': 416,
  'lpc-flowers': 55,
  'lpc-walls': 54,
  'lpc-stone-floor': 16,
  'lpc-diamond-floor': 36,
  'lpc-grit': 4,
  'norse-terrain': 32,
};

function validateScene(value: WorldScene): void {
  const fail = () => {
    throw new Error('Invalid saved world scene');
  };
  const seen = new Set<string>();
  for (const entry of [
    ...value.stamps,
    ...value.colliders,
    ...value.lights,
    ...value.npcs,
    ...value.landmarks,
  ]) {
    if (seen.has(entry.id)) fail();
    seen.add(entry.id);
  }
  const textures = new Set<string>();
  for (const entry of value.textures) {
    const known = catalog.get(entry.key);
    if (
      !known ||
      textures.has(entry.key) ||
      entry.url !== known.url ||
      entry.frameWidth !== known.frameWidth ||
      entry.frameHeight !== known.frameHeight
    )
      fail();
    const knownFrames = known!.frames ?? {};
    const entries = Object.entries(entry.frames ?? {});
    if (entries.length !== Object.keys(knownFrames).length) fail();
    for (const [name, frame] of entries) {
      const original = knownFrames[name];
      if (
        !original ||
        frame.x !== original.x ||
        frame.y !== original.y ||
        frame.width !== original.width ||
        frame.height !== original.height
      )
        fail();
    }
    textures.add(entry.key);
  }
  for (const entry of value.stamps) {
    const known = catalog.get(entry.texture);
    if (!known || !textures.has(entry.texture)) fail();
    if (typeof entry.frame === 'number' && entry.frame >= (frameCounts[entry.texture] ?? 0)) fail();
    if (typeof entry.frame === 'string' && !Object.hasOwn(known!.frames ?? {}, entry.frame)) fail();
    if (
      entry.x < value.bounds.x - 256 ||
      entry.y < value.bounds.y - 256 ||
      entry.x > value.bounds.x + value.bounds.width ||
      entry.y > value.bounds.y + value.bounds.height
    )
      fail();
  }
  if (
    value.bounds.x !== 0 ||
    value.bounds.y !== 0 ||
    value.bounds.width * value.bounds.height > 3_000_000
  )
    fail();
  if (value.colliders.some((box) => !containsRect(value.bounds, box))) fail();
  const obstacles = [...value.colliders, ...value.npcs.map(footprint)];
  if (
    !containsRect(value.bounds, footprint(value.spawn)) ||
    obstacles.some((box) => overlaps(footprint(value.spawn), box))
  )
    fail();
  for (const target of [...value.npcs, ...value.landmarks]) {
    if (
      !containsRect(value.bounds, footprint(target)) ||
      value.colliders.some((box) => overlaps(footprint(target), box))
    )
      fail();
  }
  for (const target of value.landmarks) {
    if (
      target.kind === 'portal'
        ? target.destination !== (value.id === 'dungeon' ? 'return' : 'dungeon')
        : target.destination !== undefined
    )
      fail();
  }
  if (!value.landmarks.some((target) => target.kind === 'portal')) fail();
}

/** Parse the complete saved output; never repairs, regenerates, or accepts arbitrary asset URLs. */
export function parseWorldDocument(value: unknown): WorldDocument {
  const document: WorldDocument = schema.parse(value);
  if (document.scenes.overworld.id !== document.themeId || document.scenes.dungeon.id !== 'dungeon')
    throw new Error('Invalid saved world scene identity');
  validateScene(document.scenes.overworld);
  validateScene(document.scenes.dungeon);
  return document;
}
