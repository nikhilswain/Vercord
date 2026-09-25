import type {
  ChannelMutationInput,
  ChannelMutationResult,
  WorldSync,
  WorldView,
} from '../../src/domain/channels/protocol';
import { hasChannelPermission, sourceForMember } from '../../src/domain/discord/channel-policy';
import { BYPASS_SLOWMODE, CONNECT, VIEW_CHANNEL } from '../../src/domain/discord/constants';
import { createIdentifierFactory } from '../../src/domain/discord/identifiers';
import {
  liveFrameSchema,
  liveReadSchema,
  type LiveCursor,
  type LiveCommandResult,
  type LiveFrame,
  type LiveRead,
  type MemberRecord,
} from '../../src/domain/discord/live-protocol';
import type {
  MessageHistory,
  MessageSendInput,
  MessageSlowmodePolicy,
} from '../../src/domain/messages/protocol';
import { normalizeGuildStructure } from '../../src/domain/discord/normalize';
import type { DiscordSourceBundle } from '../../src/domain/discord/source';
import { projectChannelState } from '../channels/projection';
import { decodeBase64UrlSecret } from '../config/runtime';
import { createD1WorldRepository } from '../worlds/repository';
import { sendLiveCommand } from './bridge-client';
import { sessionIsCurrent, type WorldActor } from './session-access';

type Watch = {
  actor: WorldActor;
  actors: Map<string, WorldActor>;
  connected: boolean;
  expiresAt: number;
  registered: boolean;
};
type MemberSlot = {
  watches: Map<string, Watch>;
  record: MemberRecord | null;
  cursor: LiveCursor | null;
  generation: number;
  ready: boolean;
  initializing: Promise<void> | null;
  previous: {
    fingerprint: string;
    view: WorldView;
    sourceGeneration: number;
    memberGeneration: number;
    voiceKeys: Set<string>;
  } | null;
};

export class WorldAccessError extends Error {
  public constructor(
    public readonly code = 'WORLD_SOURCE_UNAVAILABLE',
    public readonly status = 503,
    public readonly retryAt?: number,
    public readonly scope?: 'admission' | 'mutation',
  ) {
    super(code);
  }
}

/** Guild-owned transient authority. No socket attachment or persisted snapshot restores grants. */
export class LiveWorldCoordinator {
  private guildId: string | null = null;
  private bridgeEpoch = 0;
  private available: boolean | null = null;
  private ready = false;
  private generation = 0;
  private sourceGeneration = 0;
  private source: DiscordSourceBundle | null = null;
  private sourceFingerprint = '';
  private sourceCursor: LiveCursor | null = null;
  private cursor: LiveCursor | null = null;
  private readonly members = new Map<string, MemberSlot>();
  private readonly defaultIds = new Map<string, string>();
  private identifiers: ReturnType<typeof createIdentifierFactory> | null = null;
  private normalized: ReturnType<typeof normalizeGuildStructure> | null = null;
  private slug: Promise<string> | null = null;
  private recovery: Promise<void> | null = null;
  private buffered: LiveFrame[] = [];
  private bufferedBytes = 0;
  private readonly jobs = new Set<Promise<unknown>>();

  public constructor(
    private readonly env: Env,
    private readonly epoch: number,
    private readonly deliver: (
      userId: string,
      view: WorldView | null,
      sync: WorldSync,
    ) => Promise<void>,
  ) {}

  /** Approximate guild size from the live source; only used to scale the private village layout. */
  public guildMemberCount(): number {
    return this.source?.guild.memberCount ?? 0;
  }

  public subscriptionId(userId: string): string {
    this.prune();
    let id = this.defaultIds.get(userId);
    if (id === undefined) {
      if (this.defaultIds.size >= 1_000) throw new WorldAccessError();
      id = crypto.randomUUID();
      this.defaultIds.set(userId, id);
    }
    return id;
  }

  /** Allows the DO to retain background recovery without blocking the bridge's ordered lane. */
  public async pendingWork(): Promise<void> {
    while (this.jobs.size > 0) await Promise.allSettled([...this.jobs]);
  }

  public currentView(actor: WorldActor): WorldView | null {
    const slot = this.members.get(actor.userId);
    if (
      actor.guildId !== this.guildId ||
      !this.ready ||
      this.available === false ||
      !slot?.ready ||
      slot.record?.kind !== 'present' ||
      !this.hasWatch(slot) ||
      slot.previous?.sourceGeneration !== this.sourceGeneration ||
      slot.previous.memberGeneration !== slot.generation
    )
      return null;
    return slot.previous.view;
  }

  public canOccupyRoom(actor: WorldActor, roomKey: string): boolean {
    return (
      this.currentView(actor) !== null &&
      this.members.get(actor.userId)?.previous?.voiceKeys.has(roomKey) === true
    );
  }

  public async read(
    actor: WorldActor,
    subscriptionId: string,
    watch: 'lease' | 'connected' = 'lease',
  ): Promise<WorldView> {
    this.bind(actor);
    this.prune();
    const slot = this.slot(actor.userId);
    const previous = slot.watches.get(subscriptionId);
    if (!this.hasWatch(slot)) {
      slot.ready = false;
      slot.generation += 1;
    }
    if (previous) {
      // Keep the retained watch identity stable while concurrent HTTP/socket bootstraps coalesce.
      previous.registered = previous.registered && (previous.connected || watch === 'lease');
      previous.connected ||= watch === 'connected';
      previous.actor = actor;
      if (!previous.actors.has(actor.sessionHash) && previous.actors.size >= 200)
        throw new WorldAccessError();
      previous.actors.set(actor.sessionHash, actor);
      // A cache hit cannot extend the provider's lease. Renew only with a new world-read.
    } else {
      if (
        [...this.members.values()].reduce((total, member) => total + member.watches.size, 0) >=
        1_000
      )
        throw new WorldAccessError();
      slot.watches.set(subscriptionId, {
        actor,
        actors: new Map([[actor.sessionHash, actor]]),
        connected: watch === 'connected',
        expiresAt: Date.now() + 55_000,
        registered: false,
      });
    }
    await this.checkSession(actor);
    if (!this.ready) await this.recover();
    if (!slot.ready || !slot.watches.get(subscriptionId)?.registered)
      await this.hydrate(slot, actor, subscriptionId);
    return this.project(actor, slot);
  }

  public async release(userId: string, subscriptionId: string): Promise<void> {
    const slot = this.members.get(userId);
    if (!slot) return;
    const watch = slot.watches.get(subscriptionId);
    slot.watches.delete(subscriptionId);
    if (slot.watches.size === 0) {
      slot.ready = false;
      slot.generation += 1;
      this.members.delete(userId);
      this.defaultIds.delete(userId);
    }
    if (watch)
      await sendLiveCommand(this.env, {
        type: 'world-release',
        guildId: watch.actor.guildId,
        userId,
        subscriptionId,
      });
  }

  public async accept(frame: LiveFrame, bridgeEpoch: number): Promise<void> {
    frame = liveFrameSchema.parse(frame);
    if (
      bridgeEpoch < this.bridgeEpoch ||
      (bridgeEpoch === this.bridgeEpoch && this.available === false)
    )
      return;
    if (bridgeEpoch > this.bridgeEpoch) {
      this.bridgeEpoch = bridgeEpoch;
      this.available = true;
      this.invalidate();
    }
    if (!this.ready) {
      this.buffer(frame);
      this.scheduleRecovery();
      return;
    }
    if (
      !this.cursor ||
      frame.cursor.streamId !== this.cursor.streamId ||
      frame.cursor.sequence > this.cursor.sequence + 1
    ) {
      this.invalidate();
      this.buffer(frame);
      this.scheduleRecovery();
      return;
    }
    if (frame.cursor.sequence <= this.cursor.sequence) return;
    this.applyFrame(frame);
    if (!this.ready) this.scheduleRecovery();
    else this.publishAll();
  }

  public async service(available: boolean, bridgeEpoch: number): Promise<void> {
    if (
      bridgeEpoch < this.bridgeEpoch ||
      (bridgeEpoch === this.bridgeEpoch && this.available === false && available)
    )
      return;
    if (bridgeEpoch !== this.bridgeEpoch || available !== this.available) {
      this.bridgeEpoch = bridgeEpoch;
      this.available = available;
      this.invalidate();
    }
    if (available) this.scheduleRecovery();
  }

  public async mutate(
    actor: WorldActor,
    input: ChannelMutationInput,
  ): Promise<ChannelMutationResult> {
    await this.read(actor, this.subscriptionId(actor.userId));
    await this.checkSession(actor);
    if (!this.currentView(actor)) throw new WorldAccessError();
    const generation = this.generation;
    const result = await sendLiveCommand(this.env, {
      type: 'channel-mutate',
      guildId: actor.guildId,
      userId: actor.userId,
      input,
    });
    if (result.type === 'live-error')
      return {
        status: 'rejected',
        requestId: result.requestId,
        code: result.error.code,
        ...(result.error.retryAt === undefined ? {} : { retryAt: result.error.retryAt }),
      };
    if (result.type !== 'channel-result') throw new WorldAccessError();
    if (result.result.status !== 'applied') {
      if (result.result.status === 'uncertain') {
        this.invalidate();
        this.scheduleRecovery();
      }
      return result.result;
    }
    // The write already happened. Failure to refresh its private projection cannot undo that fact.
    let view: WorldView | null = null;
    try {
      const slot = this.members.get(actor.userId);
      if (slot && result.read && generation === this.generation && this.ready) {
        this.mergeRead(result.read, slot, actor, false);
        view = await this.project(actor, slot);
        this.publishAll();
      }
    } catch {
      /* Applied remains applied even after session loss or a newer removal event. */
    }
    return { status: 'applied', requestId: result.result.requestId, view };
  }

  public async voiceDestination(
    actor: WorldActor,
    roomKey: string,
  ): Promise<{ channelId: string }> {
    await this.read(actor, this.subscriptionId(actor.userId));
    const slot = this.members.get(actor.userId)!;
    const source = this.source;
    const sourceGeneration = this.sourceGeneration;
    const memberGeneration = slot.generation;
    if (!source || slot.record?.kind !== 'present' || !this.currentView(actor))
      throw new WorldAccessError();
    const identifiers = await this.ids();
    this.assertCurrent(slot, sourceGeneration, memberGeneration);
    const actorSource = sourceForMember(source, slot.record.member);
    for (const channel of source.channels) {
      if (channel.type !== 2 && channel.type !== 13) continue;
      const key = (await identifiers.for('channel', channel.id)).toLowerCase();
      this.assertCurrent(slot, sourceGeneration, memberGeneration);
      if (key !== roomKey) continue;
      if (
        !hasChannelPermission(source, channel, VIEW_CHANNEL) ||
        !hasChannelPermission(actorSource, channel, VIEW_CHANNEL | CONNECT)
      )
        throw new WorldAccessError('CHANNEL_MEMBER_FORBIDDEN', 403);
      await this.checkSession(actor);
      this.assertCurrent(slot, sourceGeneration, memberGeneration);
      return { channelId: channel.id };
    }
    throw new WorldAccessError('CHANNEL_NOT_FOUND', 404);
  }

  public async readMessages(
    actor: WorldActor,
    subscriptionId: string,
    roomKey: string,
  ): Promise<MessageHistory> {
    await this.read(actor, subscriptionId, 'connected');
    await this.assertMessageRoom(actor, roomKey);
    const result = await sendLiveCommand(this.env, {
      type: 'message-read',
      guildId: actor.guildId,
      userId: actor.userId,
      roomKey,
    });
    if (result.type === 'live-error') this.throwLiveFailure(result);
    if (result.type !== 'message-history-result') throw new WorldAccessError();
    return result.result;
  }

  public async messageSlowmodePolicy(
    actor: WorldActor,
    subscriptionId: string,
    roomKey: string,
  ): Promise<MessageSlowmodePolicy> {
    await this.read(actor, subscriptionId, 'connected');
    await this.assertMessageRoom(actor, roomKey);
    const slot = this.members.get(actor.userId)!;
    const source = this.source;
    const sourceGeneration = this.sourceGeneration;
    const memberGeneration = slot.generation;
    if (!source || slot.record?.kind !== 'present') throw new WorldAccessError();
    const actorSource = sourceForMember(source, slot.record.member);
    const identifiers = await this.ids();
    const actorKey = await identifiers.for('member', actor.userId);
    for (const channel of source.channels) {
      if ((await identifiers.for('channel', channel.id)).toLowerCase() !== roomKey) continue;
      this.assertCurrent(slot, sourceGeneration, memberGeneration);
      return {
        actorKey,
        roomKey,
        intervalMs: channel.rateLimitPerUser * 1_000,
        bypass: hasChannelPermission(actorSource, channel, BYPASS_SLOWMODE),
      };
    }
    throw new WorldAccessError('MESSAGE_CHANNEL_NOT_FOUND', 404);
  }

  public async sendMessage(
    actor: WorldActor,
    subscriptionId: string,
    input: MessageSendInput,
  ): Promise<Extract<LiveCommandResult, { type: 'message-send-result' }>> {
    await this.read(actor, subscriptionId, 'connected');
    await this.assertMessageRoom(actor, input.roomKey);
    const result = await sendLiveCommand(this.env, {
      type: 'message-send',
      guildId: actor.guildId,
      userId: actor.userId,
      input,
    });
    if (result.type === 'live-error') this.throwLiveFailure(result);
    if (result.type !== 'message-send-result') throw new WorldAccessError();
    return result;
  }

  private async assertMessageRoom(actor: WorldActor, roomKey: string): Promise<void> {
    const view = this.currentView(actor);
    const room = view?.snapshot.areas
      .flatMap((area) => area.rooms)
      .find((candidate) => candidate.key === roomKey);
    if (room === undefined || (room.type !== 'text' && room.type !== 'announcement')) {
      throw new WorldAccessError('MESSAGE_CHANNEL_NOT_FOUND', 404);
    }
    await this.checkSession(actor);
    if (this.currentView(actor) !== view) throw new WorldAccessError();
  }

  private throwLiveFailure(result: Extract<LiveCommandResult, { type: 'live-error' }>): never {
    throw new WorldAccessError(
      result.error.code,
      result.error.status,
      result.error.retryAt,
      result.error.scope,
    );
  }

  private bind(actor: WorldActor): void {
    if (this.guildId !== null && this.guildId !== actor.guildId)
      throw new WorldAccessError('INVALID_REQUEST', 400);
    this.guildId = actor.guildId;
  }

  private slot(userId: string): MemberSlot {
    let slot = this.members.get(userId);
    if (!slot) {
      if (this.members.size >= 1_000) throw new WorldAccessError();
      slot = {
        watches: new Map(),
        record: null,
        cursor: null,
        generation: 0,
        ready: false,
        initializing: null,
        previous: null,
      };
      this.members.set(userId, slot);
    }
    return slot;
  }

  private hasWatch(slot: MemberSlot): boolean {
    return [...slot.watches.values()].some(
      (watch) => watch.connected || watch.expiresAt > Date.now(),
    );
  }

  private prune(): void {
    const now = Date.now();
    for (const [userId, slot] of this.members) {
      for (const [id, watch] of slot.watches)
        if (!watch.connected && watch.expiresAt <= now) slot.watches.delete(id);
      if (slot.watches.size === 0) {
        slot.ready = false;
        slot.generation += 1;
        this.members.delete(userId);
        this.defaultIds.delete(userId);
      }
    }
    if (this.members.size === 0 && this.ready) this.invalidate();
  }

  private ids(): ReturnType<typeof createIdentifierFactory> {
    return (this.identifiers ??= createIdentifierFactory(
      decodeBase64UrlSecret(this.env.SNAPSHOT_ID_SECRET),
    ));
  }

  private track(promise: Promise<unknown>): void {
    const safe = promise.catch(() => undefined);
    this.jobs.add(safe);
    void safe.finally(() => this.jobs.delete(safe));
  }

  private invalidate(): void {
    this.ready = false;
    this.generation += 1;
    this.buffered = [];
    this.bufferedBytes = 0;
    for (const [userId, slot] of this.members) {
      slot.ready = false;
      slot.generation += 1;
      for (const watch of slot.watches.values()) watch.registered = false;
      this.track(
        this.deliver(
          userId,
          null,
          this.available === false
            ? { state: 'offline', code: 'WORLD_SOURCE_UNAVAILABLE' }
            : { state: 'recovering', code: 'WORLD_SOURCE_UNAVAILABLE' },
        ),
      );
    }
  }

  private buffer(frame: LiveFrame): void {
    const bytes = new TextEncoder().encode(JSON.stringify(frame)).byteLength;
    if (this.buffered.length >= 256 || this.bufferedBytes + bytes > 2 * 1_024 * 1_024) {
      this.invalidate();
      return;
    }
    this.buffered.push(frame);
    this.bufferedBytes += bytes;
  }

  private scheduleRecovery(): void {
    if (!this.ready && this.available !== false && this.members.size > 0 && !this.recovery)
      this.track(this.recover());
  }

  private async recover(): Promise<void> {
    if (this.recovery) return this.recovery;
    if (this.available === false) throw new WorldAccessError();
    const generation = this.generation;
    const recovery = (async () => {
      // One initial guild baseline; later users share its source and normalize operation.
      let first = true;
      const hydrated = new Set<MemberSlot>();
      while (true) {
        const pending = [...this.members.values()].filter(
          (slot) => this.hasWatch(slot) && !hydrated.has(slot),
        );
        if (pending.length === 0) break;
        for (const slot of pending) {
          const entry = [...slot.watches].find(
            ([, watch]) => watch.connected || watch.expiresAt > Date.now(),
          );
          if (!entry) continue;
          const [id, watch] = entry;
          let authenticated = false;
          for (const actor of watch.actors.values()) {
            try {
              await this.fetchBaseline(slot, actor, id, generation, first);
              first = false;
              authenticated = true;
              break;
            } catch (error) {
              if (!(error instanceof WorldAccessError) || error.code !== 'UNAUTHENTICATED')
                throw error;
              watch.actors.delete(actor.sessionHash);
            }
          }
          if (!authenticated) {
            slot.ready = false;
            slot.generation += 1;
            this.track(
              this.deliver(watch.actor.userId, null, { state: 'denied', code: 'UNAUTHENTICATED' }),
            );
          }
          hydrated.add(slot);
        }
      }
      if (generation !== this.generation || !this.source || !this.cursor)
        throw new WorldAccessError();
      const frames = this.buffered;
      this.buffered = [];
      this.bufferedBytes = 0;
      this.ready = true;
      for (const frame of frames) {
        if (frame.cursor.streamId !== this.cursor.streamId) {
          this.invalidate();
          throw new WorldAccessError();
        }
        if (frame.cursor.sequence <= this.cursor.sequence) continue;
        if (frame.cursor.sequence !== this.cursor.sequence + 1) {
          this.invalidate();
          throw new WorldAccessError();
        }
        this.applyFrame(frame);
        if (!this.ready) throw new WorldAccessError();
      }
      this.publishAll();
    })();
    this.recovery = recovery;
    try {
      await recovery;
    } catch (error) {
      if (generation === this.generation) {
        this.ready = false;
        for (const [userId] of this.members)
          this.track(this.deliver(userId, null, this.syncFor(error)));
      }
      throw error;
    } finally {
      if (this.recovery === recovery) this.recovery = null;
      // A newer gap/service event superseded this attempt. One replacement, never a write replay.
      if (generation !== this.generation) this.scheduleRecovery();
    }
  }

  private async hydrate(slot: MemberSlot, actor: WorldActor, id: string): Promise<void> {
    if (slot.initializing) await slot.initializing;
    if (slot.ready && slot.watches.get(id)?.registered) return;
    const pending = this.fetchBaseline(slot, actor, id, this.generation, false);
    slot.initializing = pending;
    try {
      await pending;
    } finally {
      if (slot.initializing === pending) slot.initializing = null;
    }
  }

  private async fetchBaseline(
    slot: MemberSlot,
    actor: WorldActor,
    id: string,
    generation: number,
    first: boolean,
  ): Promise<void> {
    const watch = slot.watches.get(id);
    if (!watch) throw new WorldAccessError();
    await this.checkSession(actor);
    if (
      generation !== this.generation ||
      this.members.get(actor.userId) !== slot ||
      slot.watches.get(id) !== watch
    )
      throw new WorldAccessError();
    const dispatchedConnected = watch.connected;
    const leaseExpiresAt = Date.now() + 55_000;
    const result = await sendLiveCommand(this.env, {
      type: 'world-read',
      guildId: actor.guildId,
      userId: actor.userId,
      subscriptionId: id,
      watch: dispatchedConnected ? 'connected' : 'lease',
    });
    if (
      generation !== this.generation ||
      this.members.get(actor.userId) !== slot ||
      slot.watches.get(id) !== watch
    )
      throw new WorldAccessError();
    if (result.type === 'live-error')
      throw new WorldAccessError(
        result.error.code,
        result.error.status,
        result.error.retryAt,
        result.error.scope,
      );
    if (result.type !== 'world-result') throw new WorldAccessError();
    if (first) {
      this.cursor = { ...result.result.cursor };
      this.sourceCursor = null;
      for (const member of this.members.values()) member.cursor = null;
      // Frames received before this complete baseline may belong to its superseded stream.
      this.buffered = this.buffered.filter(
        (frame) => frame.cursor.streamId === this.cursor!.streamId,
      );
      this.bufferedBytes = this.buffered.reduce(
        (bytes, frame) => bytes + new TextEncoder().encode(JSON.stringify(frame)).byteLength,
        0,
      );
    }
    this.mergeRead(result.result, slot, actor, true);
    watch.registered = dispatchedConnected || !watch.connected;
    watch.expiresAt = leaseExpiresAt;
  }

  private mergeRead(read: LiveRead, slot: MemberSlot, actor: WorldActor, baseline: boolean): void {
    read = liveReadSchema.parse(read);
    const userId = read.member.kind === 'present' ? read.member.member.userId : read.member.userId;
    if (
      read.guildId !== actor.guildId ||
      read.source.guild.id !== actor.guildId ||
      userId !== actor.userId
    )
      throw new WorldAccessError();
    if (!this.cursor || this.cursor.streamId !== read.cursor.streamId) {
      if (baseline) {
        this.invalidate();
        this.scheduleRecovery();
      }
      throw new WorldAccessError();
    }
    if (!this.sourceCursor || read.cursor.sequence >= this.sourceCursor.sequence) {
      this.setSource(read.source);
      this.sourceCursor = { ...read.cursor };
    }
    if (!slot.cursor || read.cursor.sequence >= slot.cursor.sequence)
      this.setMember(slot, read.member, read.cursor);
  }

  private setSource(source: DiscordSourceBundle): void {
    const fingerprint = JSON.stringify(source);
    if (fingerprint === this.sourceFingerprint) return;
    this.source = source;
    this.sourceFingerprint = fingerprint;
    this.sourceGeneration += 1;
    this.normalized = this.ids().then((identifiers) =>
      normalizeGuildStructure(source, {
        identifiers,
        generatedAt: new Date().toISOString(),
      }),
    );
  }

  private setMember(slot: MemberSlot, record: MemberRecord, cursor: LiveCursor): void {
    if (JSON.stringify(slot.record) !== JSON.stringify(record) || !slot.ready) slot.generation += 1;
    slot.record = record;
    slot.cursor = { ...cursor };
    slot.ready = true;
    if (record.kind === 'absent') {
      slot.previous = null;
      this.track(
        this.deliver(record.userId, null, { state: 'denied', code: 'GUILD_MEMBERSHIP_REQUIRED' }),
      );
    }
  }

  private applyFrame(frame: LiveFrame): void {
    this.cursor = { ...frame.cursor };
    if (frame.type === 'world-health') {
      if (!frame.ready) this.invalidate();
      return; // A health notification alone never establishes membership.
    }
    if (frame.type === 'world-source') {
      if (this.guildId && frame.source.guild.id !== this.guildId) {
        this.invalidate();
        return;
      }
      if (!this.sourceCursor || frame.cursor.sequence > this.sourceCursor.sequence) {
        this.setSource(frame.source);
        this.sourceCursor = { ...frame.cursor };
      }
    } else {
      const userId =
        frame.member.kind === 'present' ? frame.member.member.userId : frame.member.userId;
      const slot = this.members.get(userId);
      if (slot && (!slot.cursor || frame.cursor.sequence > slot.cursor.sequence))
        this.setMember(slot, frame.member, frame.cursor);
    }
  }

  private async checkSession(actor: WorldActor): Promise<void> {
    if (!(await sessionIsCurrent(this.env, actor, Date.now())))
      throw new WorldAccessError('UNAUTHENTICATED', 401);
  }

  private assertCurrent(
    slot: MemberSlot,
    sourceGeneration: number,
    memberGeneration: number,
  ): void {
    if (
      !this.ready ||
      this.available === false ||
      !slot.ready ||
      !this.hasWatch(slot) ||
      this.sourceGeneration !== sourceGeneration ||
      slot.generation !== memberGeneration
    )
      throw new WorldAccessError();
    if (slot.record?.kind !== 'present')
      throw new WorldAccessError('GUILD_MEMBERSHIP_REQUIRED', 403);
  }

  private async project(actor: WorldActor, slot: MemberSlot): Promise<WorldView> {
    const sourceGeneration = this.sourceGeneration;
    const memberGeneration = slot.generation;
    this.assertCurrent(slot, sourceGeneration, memberGeneration);
    const member = slot.record;
    const source = this.source;
    if (!source || member?.kind !== 'present' || !this.normalized) throw new WorldAccessError();
    await this.checkSession(actor);
    this.assertCurrent(slot, sourceGeneration, memberGeneration);
    this.slug ??= createD1WorldRepository(this.env.AUTH_DB)
      .read(actor.guildId)
      .then((world) => {
        if (!world) throw new WorldAccessError('WORLD_NOT_FOUND', 404);
        return world.mapSlug;
      });
    const [snapshot, identifiers, slug] = await Promise.all([
      this.normalized,
      this.ids(),
      this.slug,
    ]);
    this.assertCurrent(slot, sourceGeneration, memberGeneration);
    const state = await projectChannelState({
      source,
      snapshot,
      member: member.member,
      slug,
      identifiers,
    });
    this.assertCurrent(slot, sourceGeneration, memberGeneration);
    const actorSource = sourceForMember(source, member.member);
    const voiceKeys = new Set(
      await Promise.all(
        source.channels
          .filter(
            (channel) =>
              (channel.type === 2 || channel.type === 13) &&
              hasChannelPermission(source, channel, VIEW_CHANNEL) &&
              hasChannelPermission(actorSource, channel, VIEW_CHANNEL | CONNECT),
          )
          .map(async (channel) => (await identifiers.for('channel', channel.id)).toLowerCase()),
      ),
    );
    this.assertCurrent(slot, sourceGeneration, memberGeneration);
    await this.checkSession(actor);
    this.assertCurrent(slot, sourceGeneration, memberGeneration);
    const fingerprint = JSON.stringify([
      state.snapshot.server,
      state.snapshot.areas,
      state.controls,
    ]);
    const previous = slot.previous;
    const view =
      fingerprint === previous?.fingerprint
        ? previous.view
        : {
            ...state,
            version: { epoch: this.epoch, revision: (previous?.view.version.revision ?? 0) + 1 },
          };
    slot.previous = { fingerprint, view, sourceGeneration, memberGeneration, voiceKeys };
    return view;
  }

  private publishAll(): void {
    if (!this.ready) return;
    for (const [userId, slot] of this.members) {
      if (slot.record?.kind !== 'present' || !slot.ready) continue;
      const actors = [...slot.watches.values()]
        .filter((watch) => watch.connected)
        .flatMap((watch) => [...watch.actors.values()]);
      if (actors.length === 0) continue;
      this.track(
        (async () => {
          for (const actor of actors) {
            try {
              const view = await this.project(actor, slot);
              if (this.currentView(actor) !== view) return;
              await this.deliver(userId, view, { state: 'ready' });
              return;
            } catch (error) {
              if (!(error instanceof WorldAccessError) || error.code !== 'UNAUTHENTICATED') return;
            }
          }
          await this.deliver(userId, null, { state: 'denied', code: 'UNAUTHENTICATED' });
        })(),
      );
    }
  }

  private syncFor(error: unknown): WorldSync {
    if (error instanceof WorldAccessError) {
      if (error.retryAt !== undefined)
        return {
          state: 'cooldown',
          scope: error.scope ?? 'admission',
          retryAt: error.retryAt,
          code: error.code,
        };
      if (error.code === 'GATEWAY_UPDATE_REQUIRED') return { state: 'offline', code: error.code };
    }
    return { state: 'recovering', code: 'WORLD_SOURCE_UNAVAILABLE' };
  }
}
