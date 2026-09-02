CREATE TABLE IF NOT EXISTS worlds (
  guild_id TEXT PRIMARY KEY,
  map_slug TEXT NOT NULL UNIQUE,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_synced_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS worlds_visibility
  ON worlds (visibility);
