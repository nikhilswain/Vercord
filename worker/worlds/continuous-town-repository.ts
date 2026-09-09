import { WorldSaveError } from './save-error';

export interface ContinuousTownRow {
  world_id: string;
  version: number;
  revision: number;
  layout_json: string;
  layout_checksum: string;
  document_json: string;
  checksum: string;
  created_at: number;
}

interface StoredTownRow extends ContinuousTownRow {
  document_gzip: number[] | null;
}

const COMPRESSED_DOCUMENT = 'gzip:v1';
const MAX_DOCUMENT_BYTES = 8_000_000;
// Leave room for checksums, identities, metadata and SQLite's record overhead.
const MAX_STORED_BYTES = 1_900_000;
const encoder = new TextEncoder();

async function decodeDocument(bytes: Uint8Array): Promise<string> {
  const reader = new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip')).getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const parts: string[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DOCUMENT_BYTES) throw new WorldSaveError('WORLD_SAVE_INVALID');
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new WorldSaveError('WORLD_SAVE_INVALID');
  } finally {
    reader.releaseLock();
  }
}

export function createContinuousTownRepository(database: D1Database) {
  return {
    async read(worldId: string): Promise<ContinuousTownRow | null> {
      const stored = await database
        .prepare('SELECT * FROM world_towns WHERE world_id = ?')
        .bind(worldId)
        .first<StoredTownRow>();
      if (!stored) return null;
      const { document_gzip: compressed, ...row } = stored;
      if (compressed === null) {
        if (row.document_json === COMPRESSED_DOCUMENT)
          throw new WorldSaveError('WORLD_SAVE_INVALID');
        return row;
      }
      if (
        row.document_json !== COMPRESSED_DOCUMENT ||
        !Array.isArray(compressed) ||
        !compressed.length ||
        compressed.length + encoder.encode(row.layout_json).byteLength > MAX_STORED_BYTES ||
        compressed.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
      )
        throw new WorldSaveError('WORLD_SAVE_INVALID');
      return { ...row, document_json: await decodeDocument(Uint8Array.from(compressed)) };
    },
    async save(row: ContinuousTownRow, previousRevision: number): Promise<boolean> {
      const document = encoder.encode(row.document_json);
      if (document.byteLength > MAX_DOCUMENT_BYTES)
        throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
      const compressed = await new Response(
        new Response(document).body!.pipeThrough(new CompressionStream('gzip')),
      ).arrayBuffer();
      if (compressed.byteLength + encoder.encode(row.layout_json).byteLength > MAX_STORED_BYTES)
        throw new WorldSaveError('WORLD_SAVE_UNAVAILABLE');
      const result =
        previousRevision === 0
          ? await database
              .prepare(
                `INSERT INTO world_towns
          (world_id, version, revision, layout_json, layout_checksum, document_json, checksum, created_at, document_gzip)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(world_id) DO NOTHING`,
              )
              .bind(
                row.world_id,
                row.version,
                row.revision,
                row.layout_json,
                row.layout_checksum,
                COMPRESSED_DOCUMENT,
                row.checksum,
                row.created_at,
                compressed,
              )
              .run()
          : await database
              .prepare(
                `UPDATE world_towns SET revision = ?, layout_json = ?,
            layout_checksum = ?, document_json = ?, checksum = ?, document_gzip = ?
          WHERE world_id = ? AND version = 1 AND revision = ?`,
              )
              .bind(
                row.revision,
                row.layout_json,
                row.layout_checksum,
                COMPRESSED_DOCUMENT,
                row.checksum,
                compressed,
                row.world_id,
                previousRevision,
              )
              .run();
      return result.meta.changes === 1;
    },
  };
}
