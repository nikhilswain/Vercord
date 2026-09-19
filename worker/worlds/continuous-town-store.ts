import type { MapSnapshot } from '../../src/domain/map/snapshot';
import {
  extendTownLayout,
  CONTINUOUS_TOWN_BLOCK_SIZE,
  generateContinuousTownDocument,
  parseContinuousTownLayout,
  type ContinuousTownLayout,
} from '../../src/domain/world/continuous-town';
import { parseWorldDocument } from '../../src/domain/world/document';
import { withTownHall } from '../../src/domain/world/town-hall';
import type { StreetSelection, WorldBindings } from '../../src/domain/world/protocol';
import { WorldAccessError } from '../live-world/coordinator';
import { type SavedWorld, worldDocumentChecksum } from './instance-store';
import {
  createContinuousTownRepository,
  type ContinuousTownRow,
} from './continuous-town-repository';
import { WorldSaveError } from './save-error';
import { projectTown } from './town-projection';
import { createTownRepository } from './town-repository';

interface SavedTown {
  saved: SavedWorld;
  layout: ContinuousTownLayout;
}
const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

/** Geometry is server-owned; labels are projected only after the caller rechecks membership. */
export class ContinuousTownStore {
  private readonly repository: ReturnType<typeof createContinuousTownRepository>;
  private readonly addresses: ReturnType<typeof createTownRepository>;
  private readonly pending = new Map<string, Promise<SavedTown>>();

  public constructor(database: D1Database) {
    this.repository = createContinuousTownRepository(database);
    this.addresses = createTownRepository(database);
  }

  public async prepare(square: SavedWorld, snapshot: MapSnapshot, selection?: StreetSelection) {
    try {
      const addresses = await this.addresses.addresses(square.document.worldId, snapshot);
      const streets = await this.addresses.streets(square.document.worldId, addresses);
      const prepared = await this.load(square, snapshot);
      return {
        project: (current: MapSnapshot) => {
          const town = {
            ...projectTown(current, addresses, streets, null),
            continuous: true as const,
          };
          town.districts = town.districts.map((district) => ({
            ...district,
            anchors: prepared.layout.blocks
              .filter((block) => block.categoryKey === district.key)
              .map((block) => ({ x: block.x + CONTINUOUS_TOWN_BLOCK_SIZE / 2, y: block.y + 112 })),
          }));
          // Old street bookmarks resolve into the continuous town, retaining their access boundary.
          if (
            selection &&
            selection !== 'square' &&
            !town.districts.some((district) =>
              district.streets.some((street) => street.id === selection),
            )
          )
            throw new WorldAccessError('CHANNEL_MEMBER_FORBIDDEN', 403);
          const homes = new Map(
            prepared.layout.entries.map((entry) => [
              `${entry.categoryKey}:${entry.channelKey}`,
              entry.landmarkId,
            ]),
          );
          const bindings: WorldBindings = [];
          for (const district of town.districts) {
            for (const street of district.streets) {
              street.rooms = street.rooms.flatMap((room) => {
                const landmarkId = homes.get(`${district.key}:${room.key}`);
                if (!landmarkId) return [];
                const { key, label, type } = room;
                bindings.push({ landmarkId, rooms: [{ key, label, type }] });
                return [{ ...room, landmarkId }];
              });
            }
          }
          return { ...prepared.saved, server: current.server, town, bindings };
        },
      };
    } catch (error) {
      if (error instanceof WorldAccessError || error instanceof WorldSaveError) throw error;
      throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
    }
  }

  private load(square: SavedWorld, snapshot: MapSnapshot): Promise<SavedTown> {
    const worldId = square.document.worldId;
    // Serialize mutations, not reads with different member projections: each visit must append
    // its own newly discovered channels after the previous save completes.
    const previous = this.pending.get(worldId);
    const operation = (previous ? previous.catch(() => undefined) : Promise.resolve())
      .then(() => this.readOrCreate(square, snapshot))
      .finally(() => {
        if (this.pending.get(worldId) === operation) this.pending.delete(worldId);
      });
    this.pending.set(worldId, operation);
    return operation;
  }

  private async decode(row: ContinuousTownRow, square: SavedWorld): Promise<SavedTown> {
    if (row.version !== 1) throw new WorldSaveError('WORLD_VERSION_UNSUPPORTED');
    if (
      byteLength(row.document_json) > 8_000_000 ||
      byteLength(row.layout_json) > 2_000_000 ||
      (await worldDocumentChecksum(row.document_json)) !== row.checksum ||
      (await worldDocumentChecksum(row.layout_json)) !== row.layout_checksum
    )
      throw new WorldSaveError('WORLD_SAVE_INVALID');
    try {
      const document = parseWorldDocument(JSON.parse(row.document_json));
      const layout = parseContinuousTownLayout(JSON.parse(row.layout_json));
      const landmarks = new Set(document.scenes.overworld.landmarks.map((landmark) => landmark.id));
      if (
        document.worldId !== square.document.worldId ||
        row.world_id !== document.worldId ||
        document.seed !== square.document.seed ||
        layout.seed !== document.seed ||
        document.themeId !== square.document.themeId ||
        !document.scenes.overworld.terrain ||
        layout.entries.some((entry) => !landmarks.has(entry.landmarkId))
      )
        throw new Error('Invalid town identity');
      return { layout, saved: { document, checksum: row.checksum, createdAt: row.created_at } };
    } catch {
      throw new WorldSaveError('WORLD_SAVE_INVALID');
    }
  }

  private async readOrCreate(square: SavedWorld, snapshot: MapSnapshot): Promise<SavedTown> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await this.repository.read(square.document.worldId);
      const current = row ? await this.decode(row, square) : null;
      const layout = extendTownLayout(
        current?.layout ?? null,
        snapshot.areas,
        square.document.seed,
      );
      const json = JSON.stringify(layout);
      const unchangedLayout = row && current && json === row.layout_json;
      // A civic art upgrade must not regenerate or rearrange any saved channel house.
      const upgraded = current ? withTownHall(current.saved.document) : null;
      if (unchangedLayout && upgraded === current.saved.document) return current;
      const document = unchangedLayout
        ? parseWorldDocument(upgraded)
        : generateContinuousTownDocument(square.document, layout);
      const documentJson = JSON.stringify(document);
      if (byteLength(json) > 2_000_000 || byteLength(documentJson) > 8_000_000)
        throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
      const next: ContinuousTownRow = {
        world_id: square.document.worldId,
        version: 1,
        revision: (row?.revision ?? 0) + 1,
        layout_json: json,
        layout_checksum: await worldDocumentChecksum(json),
        document_json: documentJson,
        checksum: await worldDocumentChecksum(documentJson),
        created_at: row?.created_at ?? Math.floor(Date.now() / 1000),
      };
      if (await this.repository.save(next, row?.revision ?? 0))
        return { layout, saved: { document, checksum: next.checksum, createdAt: next.created_at } };
    }
    throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
  }
}
