export class WorldSaveError extends Error {
  public constructor(
    public readonly code:
      'WORLD_SAVE_INVALID' | 'WORLD_VERSION_UNSUPPORTED' | 'WORLD_SAVE_UNAVAILABLE',
    public readonly status = code === 'WORLD_SAVE_UNAVAILABLE' ? 503 : 409,
  ) {
    super(code);
  }
}
