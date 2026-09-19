import {
  FOREST_VERSION,
  forestIdentitySchema,
  type ForestAreaId,
  type ForestVisit,
} from '../../src/domain/world/forest/catalog';
import type { WorldDocument } from '../../src/domain/world/document';
import { WorldSaveError } from './save-error';

/** Pin the forest separately: existing town documents/checksums are never rewritten. */
export class ForestStore {
  constructor(private readonly storage: DurableObjectStorage) {}
  async load(document: WorldDocument, region: ForestAreaId): Promise<ForestVisit> {
    const key = `forest:${document.worldId}`;
    return this.storage.transaction(async (transaction) => {
      let value: unknown = await transaction.get(key);
      if (value === undefined) {
        value = { contentVersion: FOREST_VERSION, worldId: document.worldId, seed: document.seed };
        await transaction.put(key, value);
      }
      const parsed = forestIdentitySchema.safeParse(value);
      if (
        !parsed.success ||
        parsed.data.worldId !== document.worldId ||
        parsed.data.seed !== document.seed
      )
        throw new WorldSaveError('WORLD_SAVE_INVALID');
      return { ...parsed.data, region };
    });
  }
}
