export type WorkerErrorCode =
  | 'DISCORD_SOURCE_INVALID'
  | 'DISCORD_UNAUTHORIZED'
  | 'DISCORD_FORBIDDEN'
  | 'DISCORD_NOT_FOUND'
  | 'DISCORD_RATE_LIMITED'
  | 'DISCORD_UNAVAILABLE'
  | 'DISCORD_RESPONSE_INVALID'
  | 'DISCORD_RESPONSE_TOO_LARGE'
  | 'DISCORD_REQUEST_TIMEOUT'
  | 'SYNC_TIMEOUT'
  | 'SNAPSHOT_READ_FAILED'
  | 'SNAPSHOT_WRITE_FAILED'
  | 'SUSPICIOUS_EMPTY_SNAPSHOT'
  | 'SYNC_IN_PROGRESS';

export class WorkerError extends Error {
  constructor(readonly code: WorkerErrorCode) {
    super(code);
    this.name = 'WorkerError';
  }
}
