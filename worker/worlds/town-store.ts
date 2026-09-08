import type { MapSnapshot } from '../../src/domain/map/snapshot';
import { parseWorldDocument } from '../../src/domain/world/document';
import type { StreetSelection } from '../../src/domain/world/protocol';
import { generateStreetDocument } from '../../src/domain/world/streets';
import { WorldAccessError } from '../live-world/coordinator';
import { projectWorldBindings } from './bindings';
import { type SavedWorld, worldDocumentChecksum } from './instance-store';
import { WorldSaveError } from './save-error';
import { createTownRepository, type StreetRow } from './town-repository';
import { projectTown, streetBindings } from './town-projection';

export class TownStore {
  private readonly repository: ReturnType<typeof createTownRepository>;
  private readonly pending = new Map<string, Promise<SavedWorld>>();

  public constructor(database: D1Database) {
    this.repository = createTownRepository(database);
  }

  public async prepare(square: SavedWorld, snapshot: MapSnapshot, selection?: StreetSelection) {
    try {
      const addresses = await this.repository.addresses(square.document.worldId, snapshot);
      const streets = await this.repository.streets(square.document.worldId, addresses);
      const directory = projectTown(snapshot, addresses, streets, null);
      const permitted = directory.districts.flatMap((district) => district.streets);
      const activeId = selection === 'square' ? null : (selection ?? permitted[0]?.id ?? null);
      if (activeId && !permitted.some((street) => street.id === activeId))
        throw new WorldAccessError('CHANNEL_MEMBER_FORBIDDEN', 403);
      const selected = streets.find((street) => street.street_id === activeId);
      const saved = selected ? await this.loadStreet(square, selected) : square;
      return {
        // Call only after the coordinator refreshes membership and checks the session again.
        // Labels read before awaited D1/generation work must never escape through this closure.
        project: (current: MapSnapshot) => {
          const town = projectTown(current, addresses, streets, activeId);
          if (
            activeId &&
            !town.districts.some((district) =>
              district.streets.some((street) => street.id === activeId),
            )
          )
            throw new WorldAccessError('CHANNEL_MEMBER_FORBIDDEN', 403);
          return {
            ...saved,
            server: current.server,
            town,
            bindings: activeId
              ? streetBindings(town)
              : projectWorldBindings(square.document, current),
          };
        },
      };
    } catch (error) {
      if (error instanceof WorldSaveError || error instanceof WorldAccessError) throw error;
      throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
    }
  }

  private loadStreet(square: SavedWorld, street: StreetRow): Promise<SavedWorld> {
    const previous = this.pending.get(street.street_id);
    if (previous) return previous;
    const operation = this.readOrCreate(square, street).finally(() =>
      this.pending.delete(street.street_id),
    );
    this.pending.set(street.street_id, operation);
    return operation;
  }

  private async readOrCreate(square: SavedWorld, street: StreetRow): Promise<SavedWorld> {
    let row = await this.repository.read(street.street_id);
    if (!row) throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
    if (row.version !== 1) throw new WorldSaveError('WORLD_VERSION_UNSUPPORTED');
    if (row.document_json === null && row.checksum === null) {
      const document = generateStreetDocument(square.document, row.seed);
      const json = JSON.stringify(document);
      if (new TextEncoder().encode(json).byteLength > 1_500_000)
        throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
      await this.repository.complete(row, json, await worldDocumentChecksum(json));
      row = await this.repository.read(street.street_id);
    }
    if (
      !row?.document_json ||
      !row.checksum ||
      new TextEncoder().encode(row.document_json).byteLength > 1_500_000 ||
      (await worldDocumentChecksum(row.document_json)) !== row.checksum
    )
      throw new WorldSaveError('WORLD_SAVE_INVALID');
    try {
      const document = parseWorldDocument(JSON.parse(row.document_json));
      if (
        document.worldId !== square.document.worldId ||
        document.seed !== square.document.seed ||
        document.themeId !== square.document.themeId ||
        row.world_id !== document.worldId ||
        row.seed !== street.seed ||
        row.version !== 1
      )
        throw new Error('Mismatched street');
      return { document, checksum: row.checksum, createdAt: row.created_at };
    } catch {
      throw new WorldSaveError('WORLD_SAVE_INVALID');
    }
  }
}
