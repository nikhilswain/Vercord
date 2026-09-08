-- Geometry is independent of Discord sync metadata and member-specific channel visibility.
CREATE TABLE IF NOT EXISTS world_instances (
  world_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES worlds(guild_id),
  theme_id TEXT NOT NULL CHECK (theme_id IN ('village', 'norse')),
  seed TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  generator_version INTEGER NOT NULL,
  content_version TEXT NOT NULL,
  geometry_revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  document_json TEXT,
  checksum TEXT,
  created_at INTEGER NOT NULL,
  saved_at INTEGER,
  UNIQUE (guild_id, theme_id),
  CHECK (
    (status = 'pending' AND document_json IS NULL AND checksum IS NULL AND saved_at IS NULL)
    OR
    (status = 'ready' AND document_json IS NOT NULL AND checksum IS NOT NULL AND saved_at IS NOT NULL)
  ),
  CHECK (document_json IS NULL OR length(CAST(document_json AS BLOB)) <= 1500000)
) WITHOUT ROWID;
