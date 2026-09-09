import { z } from 'zod';
import type { MapRoomType } from '../../src/domain/map/snapshot';
import type { WorldDocument } from '../../src/domain/world/document';
import {
  generateHouseInterior,
  parseHouseInterior,
  type HouseInterior,
} from '../../src/domain/world/interiors';
import { worldDocumentChecksum } from './instance-store';
import { WorldSaveError } from './save-error';

// Leave space for the envelope under Durable Object storage's 128 KiB value limit.
const MAX_INTERIOR_BYTES = 120_000;
const envelopeSchema = z.strictObject({
  version: z.number().int(),
  json: z.string().max(MAX_INTERIOR_BYTES),
  checksum: z.string().regex(/^[a-f0-9]{64}$/u),
});

/** Each guild's Durable Object saves a house once, independent of subsequent town extensions. */
export class HouseInteriorStore {
  private readonly pending = new Map<string, Promise<HouseInterior>>();

  public constructor(private readonly storage: DurableObjectStorage) {}

  public load(
    document: WorldDocument,
    landmarkId: string,
    roomType: MapRoomType,
  ): Promise<HouseInterior> {
    const key = `houseInterior:${document.worldId}:${landmarkId}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const operation = this.loadOrCreate(key, document, landmarkId, roomType)
      .catch((error: unknown) => {
        if (error instanceof WorldSaveError) throw error;
        throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, operation);
    return operation;
  }

  private async loadOrCreate(
    key: string,
    document: WorldDocument,
    landmarkId: string,
    roomType: MapRoomType,
  ): Promise<HouseInterior> {
    return this.storage.transaction(async (transaction) => {
      let raw: unknown = await transaction.get(key);
      if (raw === undefined) {
        const interior = generateHouseInterior({
          worldId: document.worldId,
          seed: document.seed,
          themeId: document.themeId,
          landmarkId,
          roomType,
        });
        const json = JSON.stringify(parseHouseInterior(interior));
        if (new TextEncoder().encode(json).byteLength > MAX_INTERIOR_BYTES)
          throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
        raw = { version: 1, json, checksum: await worldDocumentChecksum(json) };
        await transaction.put(key, raw);
      }
      const envelope = envelopeSchema.safeParse(raw);
      if (!envelope.success) throw new WorldSaveError('WORLD_SAVE_INVALID');
      if (envelope.data.version !== 1) throw new WorldSaveError('WORLD_VERSION_UNSUPPORTED');
      const { json, checksum } = envelope.data;
      if (
        new TextEncoder().encode(json).byteLength > MAX_INTERIOR_BYTES ||
        (await worldDocumentChecksum(json)) !== checksum
      )
        throw new WorldSaveError('WORLD_SAVE_INVALID');
      let value: unknown;
      try {
        value = JSON.parse(json) as unknown;
      } catch {
        throw new WorldSaveError('WORLD_SAVE_INVALID');
      }
      if (
        typeof value === 'object' &&
        value !== null &&
        (('schemaVersion' in value && value.schemaVersion !== 1) ||
          ('generatorVersion' in value && value.generatorVersion !== 1) ||
          ('contentVersion' in value && value.contentVersion !== 'house-v1'))
      )
        throw new WorldSaveError('WORLD_VERSION_UNSUPPORTED');
      try {
        const interior = parseHouseInterior(value);
        if (
          interior.worldId !== document.worldId ||
          interior.themeId !== document.themeId ||
          interior.landmarkId !== landmarkId
        )
          throw new Error('Mismatched house identity');
        return interior;
      } catch {
        throw new WorldSaveError('WORLD_SAVE_INVALID');
      }
    });
  }
}
