export class ChannelActionError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}
