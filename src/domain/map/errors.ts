export class MapDomainError extends Error {
  readonly code = 'MAP_SNAPSHOT_INVALID' as const;

  constructor() {
    super('MAP_SNAPSHOT_INVALID');
    this.name = 'MapDomainError';
  }
}
