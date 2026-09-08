import {
  parseWorldDocument,
  WORLD_CONTENT_VERSION,
  WORLD_GENERATOR_VERSION,
  type WorldDocument,
  type WorldThemeId,
} from '../../src/domain/world/document';
import { generateWorldDocument } from '../../src/domain/world/generate';
import { createWorldInstanceRepository, type WorldInstanceRow } from './instance-repository';
import { WorldSaveError } from './save-error';

const MAX_DOCUMENT_BYTES = 1_500_000;

export interface SavedWorld {
  document: WorldDocument;
  checksum: string;
  createdAt: number;
}

export async function worldDocumentChecksum(json: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function checkVersions(row: WorldInstanceRow): void {
  // Retain explicit support for released versions when the current generator advances.
  if (row.schema_version !== 1 || row.generator_version !== 1 || row.content_version !== 'rpg-v1')
    throw new WorldSaveError('WORLD_VERSION_UNSUPPORTED');
  if (row.geometry_revision !== 1) throw new WorldSaveError('WORLD_VERSION_UNSUPPORTED');
}

async function decodeSavedWorld(row: WorldInstanceRow): Promise<SavedWorld> {
  checkVersions(row);
  if (row.status !== 'ready' || !row.document_json || !row.checksum)
    throw new WorldSaveError('WORLD_SAVE_INVALID');
  if (
    new TextEncoder().encode(row.document_json).byteLength > MAX_DOCUMENT_BYTES ||
    (await worldDocumentChecksum(row.document_json)) !== row.checksum
  )
    throw new WorldSaveError('WORLD_SAVE_INVALID');
  try {
    const document = parseWorldDocument(JSON.parse(row.document_json));
    if (
      document.worldId !== row.world_id ||
      document.themeId !== row.theme_id ||
      document.seed !== row.seed ||
      document.schemaVersion !== row.schema_version ||
      document.generatorVersion !== row.generator_version ||
      document.contentVersion !== row.content_version ||
      document.geometryRevision !== row.geometry_revision
    )
      throw new Error('Mismatched world identity');
    return { document, checksum: row.checksum, createdAt: row.created_at };
  } catch {
    throw new WorldSaveError('WORLD_SAVE_INVALID');
  }
}

/** Lives in the guild's existing Durable Object; D1 is the durable uniqueness boundary. */
export class WorldInstanceStore {
  private readonly pending = new Map<string, Promise<SavedWorld>>();
  private readonly repository: ReturnType<typeof createWorldInstanceRepository>;

  public constructor(database: D1Database) {
    this.repository = createWorldInstanceRepository(database);
  }

  public load(guildId: string, theme: WorldThemeId): Promise<SavedWorld> {
    const key = `${guildId}:${theme}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const operation = this.loadOrCreate(guildId, theme)
      .catch((error: unknown) => {
        if (error instanceof WorldSaveError) throw error;
        throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, operation);
    return operation;
  }

  private async loadOrCreate(guildId: string, theme: WorldThemeId): Promise<SavedWorld> {
    let row = await this.repository.read(guildId, theme);
    if (!row) {
      await this.repository.reserve({
        world_id: crypto.randomUUID(),
        guild_id: guildId,
        theme_id: theme,
        seed: crypto.randomUUID(),
        schema_version: 1,
        generator_version: WORLD_GENERATOR_VERSION,
        content_version: WORLD_CONTENT_VERSION,
        geometry_revision: 1,
        created_at: Math.floor(Date.now() / 1_000),
      });
      row = await this.repository.read(guildId, theme);
    }
    if (!row) throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
    if (row.status === 'ready') return decodeSavedWorld(row);
    checkVersions(row);
    if (row.status !== 'pending' || row.document_json !== null || row.checksum !== null)
      throw new WorldSaveError('WORLD_SAVE_INVALID');

    const document = generateWorldDocument({
      worldId: row.world_id,
      seed: row.seed,
      themeId: theme,
    });
    const json = JSON.stringify(parseWorldDocument(document));
    if (new TextEncoder().encode(json).byteLength > MAX_DOCUMENT_BYTES)
      throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
    await this.repository.complete(row, json, await worldDocumentChecksum(json));
    const completed = await this.repository.read(guildId, theme);
    if (!completed || completed.status !== 'ready')
      throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
    return decodeSavedWorld(completed);
  }
}
