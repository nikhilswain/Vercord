import { z } from 'zod';

import { mapSnapshotSchema } from '../map/snapshot';
import { isSafeMapDisplayText } from '../map/labels';

export const channelKeySchema = z.string().regex(/^c_[a-z0-9_-]{43}$/u);
export const channelNameSchema = z.string().trim().refine(isSafeMapDisplayText);
const labelSchema = z.string().refine(isSafeMapDisplayText);

export const createChannelSchema = z.strictObject({
  name: channelNameSchema,
  type: z.enum(['text', 'voice']),
  parentKey: channelKeySchema.nullable(),
});
export const renameChannelSchema = z.strictObject({
  name: channelNameSchema,
  expectedName: labelSchema,
});
export const deleteChannelSchema = z.strictObject({ expectedName: labelSchema });

export const channelControlsSchema = z.strictObject({
  canCreateRoot: z.boolean(),
  categories: z.array(z.strictObject({ key: channelKeySchema, label: labelSchema })).max(1_000),
  manageableKeys: z.array(channelKeySchema).max(1_000),
});

export const channelStateSchema = z.strictObject({
  snapshot: mapSnapshotSchema,
  controls: channelControlsSchema,
});

export type ChannelControls = z.infer<typeof channelControlsSchema>;
export type ChannelState = z.infer<typeof channelStateSchema>;
export type CreateChannel = z.infer<typeof createChannelSchema>;
export type RenameChannel = z.infer<typeof renameChannelSchema>;
