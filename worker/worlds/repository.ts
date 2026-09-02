export type WorldVisibility = 'private' | 'public';

export interface WorldRecord {
  guildId: string;
  mapSlug: string;
  visibility: WorldVisibility;
  createdAt: number;
  updatedAt: number;
  lastSyncedAt: number;
}

interface WorldRow {
  guild_id: string;
  map_slug: string;
  visibility: string;
  created_at: number;
  updated_at: number;
  last_synced_at: number;
}

export interface WorldRepository {
  read(guildId: string): Promise<WorldRecord | null>;
  readMany(guildIds: readonly string[]): Promise<Map<string, WorldRecord>>;
  recordSync(guildId: string, mapSlug: string, syncedAt: number): Promise<void>;
}

function mapWorld(row: WorldRow): WorldRecord {
  if (row.visibility !== 'private' && row.visibility !== 'public') {
    throw new Error('WORLD_RECORD_INVALID');
  }
  return {
    guildId: row.guild_id,
    mapSlug: row.map_slug,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at,
  };
}

const worldColumns = `guild_id, map_slug, visibility, created_at, updated_at, last_synced_at`;

export function createD1WorldRepository(database: D1Database): WorldRepository {
  return {
    async read(guildId) {
      const row = await database
        .prepare(`SELECT ${worldColumns} FROM worlds WHERE guild_id = ?`)
        .bind(guildId)
        .first<WorldRow>();
      return row === null ? null : mapWorld(row);
    },

    async readMany(guildIds) {
      if (guildIds.length === 0) return new Map();
      const rows: WorldRow[] = [];
      for (let offset = 0; offset < guildIds.length; offset += 90) {
        const batch = guildIds.slice(offset, offset + 90);
        const placeholders = batch.map(() => '?').join(', ');
        const result = await database
          .prepare(`SELECT ${worldColumns} FROM worlds WHERE guild_id IN (${placeholders})`)
          .bind(...batch)
          .all<WorldRow>();
        rows.push(...result.results);
      }
      return new Map(
        rows.map((row) => {
          const world = mapWorld(row);
          return [world.guildId, world] as const;
        }),
      );
    },

    async recordSync(guildId, mapSlug, syncedAt) {
      await database
        .prepare(
          `INSERT INTO worlds (
             guild_id, map_slug, visibility, created_at, updated_at, last_synced_at
           ) VALUES (?, ?, 'private', ?, ?, ?)
           ON CONFLICT(guild_id) DO UPDATE SET
             map_slug = excluded.map_slug,
             updated_at = excluded.updated_at,
             last_synced_at = excluded.last_synced_at`,
        )
        .bind(guildId, mapSlug, syncedAt, syncedAt, syncedAt)
        .run();
    },
  };
}
