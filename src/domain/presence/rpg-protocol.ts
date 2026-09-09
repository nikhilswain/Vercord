import { z } from 'zod';

export const RPG_APPEARANCE_IDS = ['rowan', 'ash', 'ivar', 'sigrid'] as const;
export const rpgAppearanceSchema = z.enum(RPG_APPEARANCE_IDS);
export const rpgSceneSchema = z.enum(['overworld', 'dungeon']);
export const rpgLocationSchema = z.strictObject({
  x: z.number().finite().min(0).max(32768),
  y: z.number().finite().min(0).max(32768),
  direction: z.enum(['down', 'left', 'right', 'up']),
  action: z.enum(['idle', 'walk', 'run']),
  scene: rpgSceneSchema,
});
export const rpgPlayerSchema = rpgLocationSchema.extend({
  id: z.string().regex(/^p_[A-Za-z0-9_-]{43}$/u),
  displayName: z.string().min(1).max(100),
  appearance: rpgAppearanceSchema,
});
export const rpgAdmissionSchema = z.strictObject({
  worldId: z.uuid(),
  checksum: z.string().min(1).max(100),
  scene: rpgSceneSchema,
});
export const rpgWelcomeSchema = rpgAdmissionSchema.extend({
  self: rpgPlayerSchema,
  players: z.array(rpgPlayerSchema).max(200),
});
export const rpgMoveSchema = rpgLocationSchema.extend({
  type: z.literal('rpg-move'),
  seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export const rpgAppearanceMessageSchema = z.strictObject({
  type: z.literal('rpg-appearance'),
  appearance: rpgAppearanceSchema,
});
export type RpgAppearanceId = z.infer<typeof rpgAppearanceSchema>;
export type RpgLocation = z.infer<typeof rpgLocationSchema>;
export type RpgPresencePlayer = z.infer<typeof rpgPlayerSchema>;
export type RpgAdmission = z.infer<typeof rpgAdmissionSchema>;
export type RpgWelcome = z.infer<typeof rpgWelcomeSchema>;
