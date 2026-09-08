import type { WorldThemeId } from '../../src/domain/world/document';

/** A pending row reserves the seed and versions even if generation is interrupted. */
export interface WorldInstanceRow {
  world_id: string;
  guild_id: string;
  theme_id: WorldThemeId;
  seed: string;
  schema_version: number;
  generator_version: number;
  content_version: string;
  geometry_revision: number;
  status: 'pending' | 'ready';
  document_json: string | null;
  checksum: string | null;
  created_at: number;
  saved_at: number | null;
}

export type WorldReservation = Pick<
  WorldInstanceRow,
  | 'world_id'
  | 'guild_id'
  | 'theme_id'
  | 'seed'
  | 'schema_version'
  | 'generator_version'
  | 'content_version'
  | 'geometry_revision'
  | 'created_at'
>;

export function createWorldInstanceRepository(database: D1Database) {
  return {
    read(guildId: string, theme: WorldThemeId): Promise<WorldInstanceRow | null> {
      return database
        .prepare('SELECT * FROM world_instances WHERE guild_id = ? AND theme_id = ?')
        .bind(guildId, theme)
        .first<WorldInstanceRow>();
    },
    async reserve(value: WorldReservation): Promise<void> {
      await database
        .prepare(
          `INSERT INTO world_instances (
        world_id, guild_id, theme_id, seed, schema_version, generator_version,
        content_version, geometry_revision, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, theme_id) DO NOTHING`,
        )
        .bind(
          value.world_id,
          value.guild_id,
          value.theme_id,
          value.seed,
          value.schema_version,
          value.generator_version,
          value.content_version,
          value.geometry_revision,
          value.created_at,
        )
        .run();
    },
    async complete(value: WorldInstanceRow, document: string, checksum: string): Promise<void> {
      // A concurrent creator or a later version may never replace a completed document.
      await database
        .prepare(
          `UPDATE world_instances
        SET status = 'ready', document_json = ?, checksum = ?, saved_at = ?
        WHERE world_id = ? AND status = 'pending' AND seed = ?
          AND schema_version = ? AND generator_version = ? AND content_version = ?
          AND geometry_revision = ?`,
        )
        .bind(
          document,
          checksum,
          Math.floor(Date.now() / 1_000),
          value.world_id,
          value.seed,
          value.schema_version,
          value.generator_version,
          value.content_version,
          value.geometry_revision,
        )
        .run();
    },
  };
}
