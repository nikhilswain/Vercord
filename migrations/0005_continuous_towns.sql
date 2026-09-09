-- Keep the original square and street documents intact. A continuous town is
-- saved once. Later channel discoveries append plots without moving old homes.
CREATE TABLE IF NOT EXISTS world_towns (
  world_id TEXT PRIMARY KEY REFERENCES world_instances(world_id),
  version INTEGER NOT NULL CHECK (version = 1),
  revision INTEGER NOT NULL CHECK (revision > 0),
  layout_json TEXT NOT NULL,
  layout_checksum TEXT NOT NULL,
  document_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (length(CAST(layout_json AS BLOB)) <= 2000000),
  CHECK (length(CAST(document_json AS BLOB)) <= 8000000)
) WITHOUT ROWID;
