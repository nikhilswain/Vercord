import { memberRecordSchema, type MemberRecord } from '../../../src/domain/discord/live-protocol';

export class LiveStateError extends Error {
  public constructor(
    public readonly code = 'WORLD_SOURCE_UNAVAILABLE',
    public readonly status = 503,
  ) {
    super(code);
    this.name = 'LiveStateError';
  }
}

export type MemberReader = (
  guildId: string,
  userId: string,
  signal?: AbortSignal,
) => Promise<MemberRecord>;

type Slot = {
  generation: number;
  recordGeneration?: number;
  record?: MemberRecord;
  flight?: { promise: Promise<MemberRecord>; fresh: boolean; signal?: AbortSignal };
};

export class MemberState {
  private readonly guilds = new Map<string, Map<string, Slot>>();

  public constructor(private readonly read: MemberReader) {}

  public retain(guildId: string, userId: string): void {
    let guild = this.guilds.get(guildId);
    if (guild === undefined) {
      guild = new Map();
      this.guilds.set(guildId, guild);
    }
    if (!guild.has(userId)) guild.set(userId, { generation: 0 });
  }

  public get(
    guildId: string,
    userId: string,
    fresh = false,
    signal?: AbortSignal,
  ): Promise<MemberRecord> {
    let guild = this.guilds.get(guildId);
    if (guild === undefined) {
      guild = new Map();
      this.guilds.set(guildId, guild);
    }
    let slot = guild.get(userId);
    if (slot === undefined) {
      slot = { generation: 0 };
      guild.set(userId, slot);
    }
    if (signal?.aborted) return Promise.reject(new LiveStateError());
    if (!fresh && slot.record !== undefined) return Promise.resolve(slot.record);
    if (
      slot.flight !== undefined &&
      (!fresh || (slot.flight.fresh && slot.flight.signal === signal))
    ) {
      return slot.flight.promise;
    }
    // A command's fresh read must fence an older admission bootstrap.
    const generation = ++slot.generation;
    const target = slot;
    const promise = Promise.resolve()
      .then(() => this.read(guildId, userId, signal))
      .then((value) => {
        if (signal?.aborted) throw new LiveStateError();
        if (this.guilds.get(guildId)?.get(userId) !== target) throw new LiveStateError();
        if (target.generation !== generation) {
          if (target.record === undefined || (target.recordGeneration ?? -1) <= generation)
            throw new LiveStateError();
          return target.record;
        }
        const record = memberRecordSchema.parse(value);
        if ((record.kind === 'present' ? record.member.userId : record.userId) !== userId) {
          throw new LiveStateError();
        }
        target.record = record;
        target.recordGeneration = generation;
        return record;
      })
      .finally(() => {
        if (target.flight?.promise === promise) target.flight = undefined;
      });
    slot.flight = { promise, fresh, signal };
    return promise;
  }

  public peek(guildId: string, userId: string): MemberRecord | undefined {
    return this.guilds.get(guildId)?.get(userId)?.record;
  }

  public update(guildId: string, record: MemberRecord): void {
    const userId = record.kind === 'present' ? record.member.userId : record.userId;
    const slot = this.guilds.get(guildId)?.get(userId);
    if (slot === undefined) return;
    slot.generation += 1;
    slot.record = memberRecordSchema.parse(record);
    slot.recordGeneration = slot.generation;
    slot.flight = undefined;
  }

  public invalidate(guildId: string, userId: string, preserve = false): void {
    const slot = this.guilds.get(guildId)?.get(userId);
    if (slot === undefined) return;
    slot.generation += 1;
    if (!preserve) slot.record = undefined;
    slot.flight = undefined;
  }

  public invalidateGuild(guildId: string, preserve = false): void {
    for (const userId of this.guilds.get(guildId)?.keys() ?? []) {
      this.invalidate(guildId, userId, preserve);
    }
  }

  public release(guildId: string, userId: string): void {
    const guild = this.guilds.get(guildId);
    guild?.delete(userId);
    if (guild?.size === 0) this.guilds.delete(guildId);
  }
}
