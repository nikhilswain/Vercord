-- Add neighborhoods without rewriting any existing world_instances document.
-- Addresses contain opaque keys only. Labels are projected from current Discord permissions.
CREATE TABLE IF NOT EXISTS world_channel_addresses (
  world_id TEXT NOT NULL REFERENCES world_instances(world_id),
  category_key TEXT NOT NULL,
  channel_key TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot >= 0 AND slot < 12000),
  PRIMARY KEY (world_id, category_key, channel_key),
  UNIQUE (world_id, category_key, slot)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS world_streets (
  street_id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES world_instances(world_id),
  category_key TEXT NOT NULL,
  street_index INTEGER NOT NULL CHECK (street_index >= 0 AND street_index < 2000),
  seed TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  document_json TEXT,
  checksum TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (world_id, category_key, street_index),
  CHECK ((document_json IS NULL AND checksum IS NULL) OR
    (document_json IS NOT NULL AND checksum IS NOT NULL)),
  CHECK (document_json IS NULL OR length(CAST(document_json AS BLOB)) <= 1500000)
) WITHOUT ROWID;
