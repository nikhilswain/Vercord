CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  return_to TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS oauth_states_expires_at
  ON oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_hash TEXT,
  access_token_ciphertext TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  refresh_token_iv TEXT,
  token_type TEXT NOT NULL,
  scope TEXT NOT NULL,
  token_expires_at INTEGER NOT NULL,
  session_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  CHECK ((refresh_token_ciphertext IS NULL) = (refresh_token_iv IS NULL))
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS sessions_user_id
  ON sessions (user_id);

CREATE INDEX IF NOT EXISTS sessions_expires_at
  ON sessions (session_expires_at);
