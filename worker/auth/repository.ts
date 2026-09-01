export interface OAuthStateRecord {
  stateHash: string;
  returnTo: string;
  createdAt: number;
  expiresAt: number;
}

export interface SessionRecord {
  idHash: string;
  userId: string;
  username: string;
  displayName: string;
  avatarHash: string | null;
  accessTokenCiphertext: string;
  accessTokenIv: string;
  refreshTokenCiphertext: string | null;
  refreshTokenIv: string | null;
  tokenType: string;
  scope: string;
  tokenExpiresAt: number;
  sessionExpiresAt: number;
  createdAt: number;
  lastSeenAt: number;
}

interface SessionRow {
  id_hash: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_hash: string | null;
  access_token_ciphertext: string;
  access_token_iv: string;
  refresh_token_ciphertext: string | null;
  refresh_token_iv: string | null;
  token_type: string;
  scope: string;
  token_expires_at: number;
  session_expires_at: number;
  created_at: number;
  last_seen_at: number;
}

export interface SessionTokenUpdate {
  accessTokenCiphertext: string;
  accessTokenIv: string;
  refreshTokenCiphertext: string | null;
  refreshTokenIv: string | null;
  tokenType: string;
  scope: string;
  tokenExpiresAt: number;
}

export interface AuthRepository {
  createOAuthState(record: OAuthStateRecord): Promise<void>;
  consumeOAuthState(stateHash: string, now: number): Promise<string | null>;
  createSession(record: SessionRecord): Promise<void>;
  readSession(idHash: string): Promise<SessionRecord | null>;
  updateSessionTokens(idHash: string, update: SessionTokenUpdate): Promise<void>;
  touchSession(idHash: string, now: number): Promise<void>;
  deleteSession(idHash: string): Promise<void>;
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    idHash: row.id_hash,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarHash: row.avatar_hash,
    accessTokenCiphertext: row.access_token_ciphertext,
    accessTokenIv: row.access_token_iv,
    refreshTokenCiphertext: row.refresh_token_ciphertext,
    refreshTokenIv: row.refresh_token_iv,
    tokenType: row.token_type,
    scope: row.scope,
    tokenExpiresAt: row.token_expires_at,
    sessionExpiresAt: row.session_expires_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function createD1AuthRepository(database: D1Database): AuthRepository {
  return {
    async createOAuthState(record) {
      await database
        .prepare(
          `INSERT INTO oauth_states (state_hash, return_to, created_at, expires_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(record.stateHash, record.returnTo, record.createdAt, record.expiresAt)
        .run();
    },

    async consumeOAuthState(stateHash, now) {
      const row = await database
        .prepare(
          `DELETE FROM oauth_states
           WHERE state_hash = ? AND expires_at >= ?
           RETURNING return_to`,
        )
        .bind(stateHash, now)
        .first<{ return_to: string }>();
      return row?.return_to ?? null;
    },

    async createSession(record) {
      await database
        .prepare(
          `INSERT INTO sessions (
             id_hash, user_id, username, display_name, avatar_hash,
             access_token_ciphertext, access_token_iv,
             refresh_token_ciphertext, refresh_token_iv,
             token_type, scope, token_expires_at, session_expires_at,
             created_at, last_seen_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.idHash,
          record.userId,
          record.username,
          record.displayName,
          record.avatarHash,
          record.accessTokenCiphertext,
          record.accessTokenIv,
          record.refreshTokenCiphertext,
          record.refreshTokenIv,
          record.tokenType,
          record.scope,
          record.tokenExpiresAt,
          record.sessionExpiresAt,
          record.createdAt,
          record.lastSeenAt,
        )
        .run();
    },

    async readSession(idHash) {
      const row = await database
        .prepare(
          `SELECT id_hash, user_id, username, display_name, avatar_hash,
                  access_token_ciphertext, access_token_iv,
                  refresh_token_ciphertext, refresh_token_iv,
                  token_type, scope, token_expires_at, session_expires_at,
                  created_at, last_seen_at
           FROM sessions WHERE id_hash = ?`,
        )
        .bind(idHash)
        .first<SessionRow>();
      return row === null ? null : mapSession(row);
    },

    async updateSessionTokens(idHash, update) {
      await database
        .prepare(
          `UPDATE sessions SET
             access_token_ciphertext = ?, access_token_iv = ?,
             refresh_token_ciphertext = ?, refresh_token_iv = ?,
             token_type = ?, scope = ?, token_expires_at = ?
           WHERE id_hash = ?`,
        )
        .bind(
          update.accessTokenCiphertext,
          update.accessTokenIv,
          update.refreshTokenCiphertext,
          update.refreshTokenIv,
          update.tokenType,
          update.scope,
          update.tokenExpiresAt,
          idHash,
        )
        .run();
    },

    async touchSession(idHash, now) {
      await database
        .prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?')
        .bind(now, idHash)
        .run();
    },

    async deleteSession(idHash) {
      await database.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(idHash).run();
    },
  };
}
