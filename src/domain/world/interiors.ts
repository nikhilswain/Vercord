import { z } from 'zod';
import {
  parseHouseInterior as parseLegacy,
  type HouseInterior as LegacyHouseInterior,
} from './interiors-v1';
import { parseHouseInteriorV2, type HouseInteriorV2 } from './content/house-v2/schema';
export { generateHouseInteriorV2 as generateHouseInterior } from './content/house-v2/generate';
export type HouseInterior = LegacyHouseInterior | HouseInteriorV2;

/** Both readers stay pinned; the store upgrades existing rooms in one transaction. */
export function parseHouseInterior(value: unknown): HouseInterior {
  return typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 2
    ? parseHouseInteriorV2(value)
    : parseLegacy(value);
}
export const houseInteriorSchema = z.unknown().transform((value, context) => {
  try {
    return parseHouseInterior(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid saved house interior' });
    return z.NEVER;
  }
});
