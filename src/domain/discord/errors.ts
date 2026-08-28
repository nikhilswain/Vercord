export type DiscordDomainErrorCode =
  'DISCORD_SOURCE_INVALID' | 'SNAPSHOT_INVALID' | 'EXCESSIVE_BOT_PERMISSION';

export class DiscordDomainError extends Error {
  constructor(readonly code: DiscordDomainErrorCode) {
    super(code);
    this.name = 'DiscordDomainError';
  }
}
