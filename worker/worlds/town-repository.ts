import type { MapSnapshot } from '../../src/domain/map/snapshot';
import { STREET_HOUSE_COUNT } from '../../src/domain/world/streets';

export interface HouseAddress {
  category_key: string;
  channel_key: string;
  slot: number;
}
export interface StreetRow {
  street_id: string;
  world_id: string;
  category_key: string;
  street_index: number;
  seed: string;
  version: number;
  created_at: number;
}
export interface SavedStreetRow extends StreetRow {
  document_json: string | null;
  checksum: string | null;
}

/** Batch bounded statements; avoid per-house network round trips and oversized IN clauses. */
async function batch<T>(database: D1Database, statements: D1PreparedStatement[]): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < statements.length; start += 75) {
    const results = await database.batch<T>(statements.slice(start, start + 75));
    for (const result of results) rows.push(...result.results);
  }
  return rows;
}

export function createTownRepository(database: D1Database) {
  const readAddresses = (worldId: string, snapshot: MapSnapshot) => {
    const statements: D1PreparedStatement[] = [];
    for (const area of snapshot.areas) {
      for (let start = 0; start < area.rooms.length; start += 80) {
        const keys = area.rooms.slice(start, start + 80).map((room) => room.key);
        statements.push(
          database
            .prepare(
              `SELECT category_key, channel_key, slot
          FROM world_channel_addresses WHERE world_id = ? AND category_key = ?
          AND channel_key IN (${keys.map(() => '?').join(',')})`,
            )
            .bind(worldId, area.key, ...keys),
        );
      }
    }
    return batch<HouseAddress>(database, statements);
  };
  return {
    async addresses(worldId: string, snapshot: MapSnapshot): Promise<HouseAddress[]> {
      const existing = await readAddresses(worldId, snapshot);
      const known = new Set(existing.map((row) => `${row.category_key}:${row.channel_key}`));
      const missing = snapshot.areas.flatMap((area) =>
        area.rooms
          .filter((room) => !known.has(`${area.key}:${room.key}`))
          .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
          .map((room) => ({ category: area.key, channel: room.key })),
      );
      if (!missing.length) return existing;
      // SQLite allocates each next slot atomically. Concurrent visits cannot overwrite an address;
      // an old slot is never recycled when a channel disappears or changes category.
      await batch(
        database,
        missing.map(({ category, channel }) =>
          database
            .prepare(
              `
        INSERT INTO world_channel_addresses (world_id, category_key, channel_key, slot)
        SELECT ?, ?, ?, COALESCE(MAX(slot) + 1, 0) FROM world_channel_addresses
        WHERE world_id = ? AND category_key = ?
        ON CONFLICT(world_id, category_key, channel_key) DO NOTHING
      `,
            )
            .bind(worldId, category, channel, worldId, category),
        ),
      );
      return readAddresses(worldId, snapshot);
    },
    async streets(worldId: string, addresses: HouseAddress[]): Promise<StreetRow[]> {
      const groups = new Map<string, Set<number>>();
      for (const address of addresses) {
        const indices = groups.get(address.category_key) ?? new Set<number>();
        indices.add(Math.floor(address.slot / STREET_HOUSE_COUNT));
        groups.set(address.category_key, indices);
      }
      const reads = () =>
        [...groups].flatMap(([category, indices]) => {
          const all = [...indices];
          const statements: D1PreparedStatement[] = [];
          for (let start = 0; start < all.length; start += 80) {
            const part = all.slice(start, start + 80);
            statements.push(
              database
                .prepare(
                  `SELECT street_id, world_id, category_key,
            street_index, seed, version, created_at FROM world_streets
            WHERE world_id = ? AND category_key = ? AND street_index IN (${part.map(() => '?').join(',')})
          `,
                )
                .bind(worldId, category, ...part),
            );
          }
          return statements;
        });
      const existing = await batch<StreetRow>(database, reads());
      const known = new Set(existing.map((row) => `${row.category_key}:${row.street_index}`));
      const inserts = [...groups].flatMap(([category, indices]) =>
        [...indices]
          .filter((index) => !known.has(`${category}:${index}`))
          .map((index) =>
            database
              .prepare(
                `INSERT INTO world_streets (
          street_id, world_id, category_key, street_index, seed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(world_id, category_key, street_index) DO NOTHING`,
              )
              .bind(
                crypto.randomUUID(),
                worldId,
                category,
                index,
                crypto.randomUUID(),
                Math.floor(Date.now() / 1000),
              ),
          ),
      );
      if (!inserts.length) return existing;
      await batch(database, inserts);
      return batch<StreetRow>(database, reads());
    },
    read(streetId: string): Promise<SavedStreetRow | null> {
      return database
        .prepare('SELECT * FROM world_streets WHERE street_id = ?')
        .bind(streetId)
        .first<SavedStreetRow>();
    },
    async complete(row: StreetRow, json: string, checksum: string): Promise<void> {
      await database
        .prepare(
          `UPDATE world_streets SET document_json = ?, checksum = ?
        WHERE street_id = ? AND seed = ? AND version = 1 AND document_json IS NULL AND checksum IS NULL`,
        )
        .bind(json, checksum, row.street_id, row.seed)
        .run();
    },
  };
}
