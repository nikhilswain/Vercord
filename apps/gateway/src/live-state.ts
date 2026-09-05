import { Events, Routes, type Client, type ClientEvents, type Guild } from 'discord.js';
import { z } from 'zod';

import type { PreparedChannelMutation } from '../../../src/domain/discord/channel-policy';
import type { IdentifierFactory } from '../../../src/domain/discord/identifiers';
import {
  memberRecordSchema,
  type LiveCommand,
  type LiveCursor,
  type LiveFrame,
  type LiveRead,
  type MemberRecord,
} from '../../../src/domain/discord/live-protocol';
import type { DiscordChannelSource, DiscordSourceBundle } from '../../../src/domain/discord/source';
import {
  discordTimestampSchema,
  parseDiscordBotMember,
  parseDiscordChannels,
  parseDiscordGuild,
  snowflakeSchema,
  validateDiscordSourceBundle,
} from '../../../src/domain/discord/source-schema';
import { LiveStateError, MemberState, type MemberReader } from './member-state';
import { sourceFromGuild } from './source-adapter';

const MAX_GUILD_MEMBERS = 200;
const MAX_MEMBERS = 5_000;
const LEASE_MS = 60_000;
type GatewayOperation =
  | 'member_cache_miss'
  | 'fresh_mutation_authorization'
  | 'source_recovery'
  | 'command_dispatch'
  | 'duplicate_content_suppression';
type GatewayOutcome = 'completed' | 'failed' | 'applied' | 'rejected' | 'uncertain' | 'suppressed';
type GatewayReason =
  | 'admission'
  | 'source_recovery'
  | 'cold_source'
  | 'mutation_uncertainty'
  | 'source_uncertainty'
  | 'member_refreshed'
  | 'member_refresh_failed'
  | 'create'
  | 'rename'
  | 'delete'
  | 'member_unchanged'
  | 'source_unchanged'
  | 'mutation_echo';
const operationCounts = new Map<string, number>();

/** Aggregate operational evidence only; all accepted values are closed, identifier-free enums. */
export function recordGatewayOperation(input: {
  operation: GatewayOperation;
  outcome: GatewayOutcome;
  reason: GatewayReason;
  durationMs: number;
}): void {
  try {
    const key = `${input.operation}:${input.outcome}:${input.reason}`;
    const count = (operationCounts.get(key) ?? 0) + 1;
    operationCounts.set(key, count);
    console.info(
      JSON.stringify({
        service: 'dmap-gateway',
        event: 'live_operation',
        operation: input.operation,
        outcome: input.outcome,
        reason: input.reason,
        count,
        durationMs: Math.max(0, Math.round(input.durationMs)),
      }),
    );
  } catch {
    // Diagnostics must never affect authorization, delivery, or command results.
  }
}
const memberPayloadSchema = z.object({
  guild_id: snowflakeSchema,
  user: z.object({ id: snowflakeSchema }),
  roles: z.array(snowflakeSchema).max(1_000),
  pending: z.boolean().optional(),
  communication_disabled_until: discordTimestampSchema.nullable().optional(),
});
const memberIdentitySchema = memberPayloadSchema.pick({ guild_id: true, user: true });
const memberResponseSchema = memberPayloadSchema.omit({ guild_id: true });
type Watch = { connected: boolean; expiresAt: number };
export type MutationFence = {
  cursor: LiveCursor;
  generation: number;
  target: DiscordChannelSource | null;
};
type GuildState = {
  guildId: string;
  guildKey?: string;
  keyPromise: Promise<void>;
  cursor: LiveCursor;
  generation: number;
  source?: DiscordSourceBundle;
  ready: boolean;
  suspended: boolean;
  delivering: boolean;
  recovery?: Promise<void>;
  watches: Map<string, Map<string, Watch>>;
  overlays: Map<string, DiscordChannelSource | null>;
  publishedMembers: Map<string, MemberRecord>;
  channelEvents: Map<string, number>;
  channelEventFloor: number;
  channelReads: Map<string, Promise<void>>;
  refreshChannels: boolean;
};
type FrameContent =
  | { type: 'world-source'; source: DiscordSourceBundle }
  | { type: 'world-member'; member: MemberRecord }
  | { type: 'world-health'; ready: boolean };

/** Owns authorization records only for bridge-owned watches; the Discord client is shared. */
export class DiscordLiveState {
  private readonly guilds = new Map<string, GuildState>();
  private readonly suspendedShards = new Set<number>();
  private readonly members: MemberState;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private readonly removeListeners: (() => void)[] = [];
  private memberCount = 0;
  private stopped = false;
  private readonly serviceSessionId: string;

  public constructor(
    private readonly client: Client,
    private readonly identifiers: IdentifierFactory,
    private readonly publish: (frame: LiveFrame) => boolean,
    options: { serviceSessionId?: string; readMember?: MemberReader } = {},
  ) {
    this.serviceSessionId = options.serviceSessionId ?? crypto.randomUUID();
    this.members = new MemberState(options.readMember ?? this.readMember.bind(this));
    // discord.js exposes raw at runtime through its untyped EventEmitter overload.
    const rawListener = (packet: unknown): void => this.rawMember(packet);
    this.client.on(Events.Raw, rawListener);
    this.removeListeners.push(() => this.client.off(Events.Raw, rawListener));
    this.listen(Events.ChannelCreate, (channel: { guild: Guild; id: string }) =>
      this.structure(channel.guild.id, channel.id),
    );
    this.listen(Events.ChannelDelete, (channel: { guild?: Guild; id: string }) => {
      if (channel.guild !== undefined) this.structure(channel.guild.id, channel.id);
    });
    this.listen(Events.ChannelUpdate, (_old: unknown, channel: { guild?: Guild; id: string }) => {
      if (channel.guild !== undefined) this.structure(channel.guild.id, channel.id);
    });
    this.listen(Events.GuildRoleCreate, (role: { guild: Guild }) => this.structure(role.guild.id));
    this.listen(Events.GuildRoleDelete, (role: { guild: Guild }) => this.structure(role.guild.id));
    this.listen(Events.GuildRoleUpdate, (_old: unknown, role: { guild: Guild }) =>
      this.structure(role.guild.id),
    );
    this.listen(Events.GuildUpdate, (_old: unknown, guild: Guild) => this.structure(guild.id));
    this.listen(Events.GuildUnavailable, (guild: Guild) => this.loseGuild(guild.id));
    this.listen(Events.GuildDelete, (guild: Guild) => this.loseGuild(guild.id, false));
    this.listen(Events.GuildAvailable, (guild: Guild) => this.resumeGuild(guild.id, false));
    this.listen(Events.GuildCreate, (guild: Guild) => this.resumeGuild(guild.id, false));
    this.listen(Events.ShardDisconnect, (_event: unknown, shardId: number) =>
      this.loseShard(shardId),
    );
    this.listen(Events.ShardReconnecting, (shardId: number) => this.loseShard(shardId));
    this.listen(Events.ShardResume, (shardId: number) => this.resumeShard(shardId, true));
    this.listen(Events.ShardReady, (shardId: number) => this.resumeShard(shardId, false));
    this.cleanupTimer = setInterval(() => this.expireLeases(), 5_000);
    this.cleanupTimer.unref();
  }

  public async read(command: Extract<LiveCommand, { type: 'world-read' }>): Promise<LiveRead> {
    if (this.stopped || command.expiresAt <= Date.now()) throw new LiveStateError();
    const state = this.ensureGuild(command.guildId);
    try {
      this.watch(state, command.userId, command.subscriptionId, command.watch);
    } catch (error) {
      if (state.watches.size === 0) this.guilds.delete(state.guildId);
      throw error;
    }
    await state.keyPromise;
    this.assertOwned(state, command.userId, command.subscriptionId);
    // Only an explicit resubscription can restart a failed delivery stream.
    if (!state.delivering) {
      state.cursor = { streamId: crypto.randomUUID(), sequence: 0 };
      state.delivering = true;
    }
    await this.recover(command.guildId);
    this.assertOwned(state, command.userId, command.subscriptionId);
    await this.cachedMember(command.guildId, command.userId, 'admission');
    this.assertOwned(state, command.userId, command.subscriptionId);
    if (command.expiresAt <= Date.now()) throw new LiveStateError();
    return this.current(command.guildId, command.userId);
  }

  public release(command: Extract<LiveCommand, { type: 'world-release' }>): void {
    const state = this.guilds.get(command.guildId);
    const watches = state?.watches.get(command.userId);
    if (state === undefined || watches === undefined) return;
    watches.delete(command.subscriptionId);
    if (watches.size === 0) this.dropMember(state, command.userId);
  }

  public async freshMember(
    guildId: string,
    userId: string,
    signal?: AbortSignal,
  ): Promise<MemberRecord> {
    const state = this.guilds.get(guildId);
    if (state === undefined || !state.watches.has(userId)) throw new LiveStateError();
    this.assertReady(state);
    const before = this.members.peek(guildId, userId);
    const record = await this.members.get(guildId, userId, true, signal);
    this.assertReady(state);
    if (JSON.stringify(before) !== JSON.stringify(record))
      this.emit(state, { type: 'world-member', member: record });
    this.assertReady(state);
    return record;
  }

  public current(guildId: string, userId: string): LiveRead {
    const state = this.guilds.get(guildId);
    if (state === undefined || !state.watches.has(userId)) throw new LiveStateError();
    this.assertReady(state);
    const member = this.members.peek(guildId, userId);
    if (member === undefined || state.source === undefined) throw new LiveStateError();
    return { guildId, cursor: { ...state.cursor }, source: state.source, member };
  }

  public async recover(guildId: string): Promise<void> {
    const state = this.guilds.get(guildId);
    const guild = this.client.guilds.cache.get(guildId);
    if (state === undefined || guild === undefined || !guild.available || state.suspended)
      throw new LiveStateError();
    if (state.recovery !== undefined) return state.recovery;
    if (state.ready) return;
    const startedAt = Date.now();
    const recoveryReason: GatewayReason =
      state.source === undefined
        ? 'cold_source'
        : state.refreshChannels
          ? 'mutation_uncertainty'
          : 'source_uncertainty';
    const generation = state.generation;
    const recovery = (async () => {
      await state.keyPromise;
      let fallbackBotMember = state.source?.botMember;
      if (guild.members.me === null && fallbackBotMember === undefined) {
        const botId = this.client.user?.id;
        if (botId === undefined) throw new LiveStateError();
        fallbackBotMember = parseDiscordBotMember(
          await this.client.rest.get(Routes.guildMember(guildId, botId)),
        );
      }
      let source: DiscordSourceBundle;
      let fetchedChannels = false;
      try {
        source = sourceFromGuild(guild, fallbackBotMember);
      } catch {
        // Do not mutate discord.js caches: a late REST response must not replace replayed events.
        const [rawGuild, rawChannels] = await Promise.all([
          this.client.rest.get(Routes.guild(guildId)),
          this.client.rest.get(Routes.guildChannels(guildId)),
        ]);
        if (
          !Array.isArray(rawChannels) ||
          rawChannels.some(
            (channel: unknown) =>
              typeof channel !== 'object' ||
              channel === null ||
              !('permission_overwrites' in channel),
          )
        )
          throw new LiveStateError();
        const botId = this.client.user?.id;
        const botMember = guild.members.me;
        if (botId === undefined || (botMember === null && fallbackBotMember === undefined))
          throw new LiveStateError();
        source = validateDiscordSourceBundle(
          {
            bot: { id: botId },
            guild: parseDiscordGuild(rawGuild),
            botMember:
              botMember === null
                ? fallbackBotMember!
                : parseDiscordBotMember({
                    roles: botMember.roles.cache
                      .filter((role) => role.id !== guildId)
                      .map((role) => role.id)
                      .sort(),
                  }),
            channels: parseDiscordChannels(rawChannels),
          },
          guildId,
        );
        source.guild.roles.sort((a, b) => a.id.localeCompare(b.id));
        source.channels.sort((a, b) => a.id.localeCompare(b.id));
        for (const channel of source.channels)
          channel.overwrites.sort((a, b) => a.id.localeCompare(b.id) || a.type - b.type);
        fetchedChannels = true;
      }
      if (state.refreshChannels && !fetchedChannels) {
        const rawChannels = await this.client.rest.get(Routes.guildChannels(guildId), {
          signal: AbortSignal.timeout(5_000),
        });
        if (
          !Array.isArray(rawChannels) ||
          rawChannels.some(
            (channel: unknown) =>
              typeof channel !== 'object' ||
              channel === null ||
              !('permission_overwrites' in channel),
          )
        )
          throw new LiveStateError();
        source = validateDiscordSourceBundle(
          { ...source, channels: parseDiscordChannels(rawChannels) },
          guildId,
        );
        source.channels.sort((a, b) => a.id.localeCompare(b.id));
        for (const channel of source.channels)
          channel.overwrites.sort((a, b) => a.id.localeCompare(b.id) || a.type - b.type);
      }
      this.assertRecovery(state, generation);
      if (state.refreshChannels) {
        // A provider read supersedes response overlays retained before an unknown write.
        state.overlays.clear();
        state.refreshChannels = false;
      }
      this.replaceSource(state, this.withOverlays(state, source));
      const recovered = new Map<string, Map<string, Watch>>();
      while (true) {
        this.assertRecovery(state, generation);
        // A last close destroys this watch map and its member slot. Rewatching the
        // same user creates a different obligation, even while an old read settles.
        for (const [userId, watches] of recovered) {
          if (state.watches.get(userId) !== watches) recovered.delete(userId);
        }
        const obligations = [...state.watches].filter(
          ([userId, watches]) => recovered.get(userId) !== watches,
        );
        if (obligations.length === 0) break;
        await Promise.all(
          obligations.map(async ([userId, watches]) => {
            const before = this.members.peek(guildId, userId);
            let record: MemberRecord;
            try {
              record = await this.cachedMember(guildId, userId, 'source_recovery');
            } catch (error) {
              this.assertRecovery(state, generation);
              if (state.watches.get(userId) !== watches) return;
              throw error;
            }
            this.assertRecovery(state, generation);
            if (state.watches.get(userId) !== watches) return;
            recovered.set(userId, watches);
            if (JSON.stringify(before) !== JSON.stringify(record)) {
              this.emit(state, { type: 'world-member', member: record });
            }
          }),
        );
        // Hydrate replacements here: their public read is awaiting this recovery.
      }
      this.assertRecovery(state, generation);
      state.ready = true;
      this.emit(state, { type: 'world-health', ready: true });
    })()
      .then(() => {
        recordGatewayOperation({
          operation: 'source_recovery',
          outcome: 'completed',
          reason: recoveryReason,
          durationMs: Date.now() - startedAt,
        });
      })
      .catch((error: unknown) => {
        recordGatewayOperation({
          operation: 'source_recovery',
          outcome: 'failed',
          reason: recoveryReason,
          durationMs: Date.now() - startedAt,
        });
        throw error;
      })
      .finally(() => {
        if (state.recovery === recovery) state.recovery = undefined;
      });
    state.recovery = recovery;
    return recovery;
  }

  public captureMutation(guildId: string, mutation: PreparedChannelMutation): MutationFence {
    const state = this.guilds.get(guildId);
    if (state === undefined) throw new LiveStateError();
    this.assertReady(state);
    const id = mutation.method === 'POST' ? undefined : mutation.path.split('/').at(-1);
    return {
      cursor: { ...state.cursor },
      generation: state.generation,
      target: state.source!.channels.find((channel) => channel.id === id) ?? null,
    };
  }

  public invalidateMutation(guildId: string, streamId: string): void {
    const state = this.guilds.get(guildId);
    if (state !== undefined && state.cursor.streamId === streamId) {
      state.refreshChannels = true;
      this.uncertain(state);
    }
  }

  public async reconcile(
    guildId: string,
    mutation: PreparedChannelMutation,
    response: unknown,
    before: LiveCursor,
    fence?: MutationFence,
    signal?: AbortSignal,
  ): Promise<void> {
    const state = this.guilds.get(guildId);
    if (state === undefined) throw new LiveStateError();
    this.assertReady(state);
    if (state.cursor.streamId !== before.streamId) throw new LiveStateError();
    try {
      const source = state.source!;
      let channel: DiscordChannelSource | null;
      let channelId: string;
      if (mutation.method === 'DELETE') {
        channelId = mutation.path.split('/').at(-1)!;
        if (!snowflakeSchema.safeParse(channelId).success) throw new LiveStateError();
        channel = null;
      } else {
        // The domain REST parser permits omitted overwrites; reconciliation must not.
        if (
          typeof response !== 'object' ||
          response === null ||
          !('permission_overwrites' in response)
        ) {
          throw new LiveStateError();
        }
        channel = parseDiscordChannels([response])[0]!;
        channel.overwrites.sort((a, b) => a.id.localeCompare(b.id) || a.type - b.type);
        channelId = channel.id;
        if (mutation.method === 'PATCH' && mutation.path !== `/channels/${channelId}`)
          throw new LiveStateError();
      }
      const current = source.channels.find((entry) => entry.id === channelId) ?? null;
      if (JSON.stringify(current) === JSON.stringify(channel)) {
        recordGatewayOperation({
          operation: 'duplicate_content_suppression',
          outcome: 'suppressed',
          reason: 'mutation_echo',
          durationMs: 0,
        });
        return;
      }
      const conflict =
        fence === undefined
          ? state.cursor.sequence !== before.sequence
          : state.channelEventFloor > fence.generation ||
            (state.channelEvents.get(channelId) ?? 0) > fence.generation ||
            (mutation.method !== 'POST' &&
              JSON.stringify(current) !== JSON.stringify(fence.target));
      if (conflict) {
        // The event wins over this late write response. Read only the affected
        // channel, with another event fence, to discover its final provider state.
        await this.recoverChannel(state, channelId, signal);
        return;
      }
      if (!state.overlays.has(channelId) && state.overlays.size >= 1_000) {
        throw new LiveStateError();
      }
      const overlays = new Map(state.overlays);
      overlays.set(channelId, channel);
      const candidate = this.withOverlays(state, source, overlays);
      // Commit only after parser, target identity, and combined relationships pass.
      state.overlays = overlays;
      this.replaceSource(state, candidate);
      this.assertReady(state);
    } catch {
      // The confirmed mutation remains applied; only source authority is unavailable.
      if (fence !== undefined) state.refreshChannels = true;
      this.uncertain(state);
      throw new LiveStateError();
    }
  }

  private recoverChannel(
    state: GuildState,
    channelId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const existing = state.channelReads.get(channelId);
    if (existing !== undefined) return existing;
    if (state.channelReads.size >= 20) return Promise.reject(new LiveStateError());
    const generation = state.generation;
    const streamId = state.cursor.streamId;
    const recovery = (async () => {
      const deadline = AbortSignal.timeout(2_000);
      const bounded = signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
      let channel: DiscordChannelSource | null;
      try {
        const raw = await this.client.rest.get(Routes.channel(channelId), { signal: bounded });
        if (typeof raw !== 'object' || raw === null || !('permission_overwrites' in raw))
          throw new LiveStateError();
        channel = parseDiscordChannels([raw])[0]!;
        if (channel.id !== channelId) throw new LiveStateError();
        channel.overwrites.sort((a, b) => a.id.localeCompare(b.id) || a.type - b.type);
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 10003)
          channel = null;
        else throw error;
      }
      bounded.throwIfAborted();
      this.assertReady(state);
      if (state.cursor.streamId !== streamId) throw new LiveStateError();
      if (
        state.channelEventFloor > generation ||
        (state.channelEvents.get(channelId) ?? 0) > generation
      )
        return; // A newer event already supplied the authoritative channel.
      if (!state.overlays.has(channelId) && state.overlays.size >= 1_000)
        throw new LiveStateError();
      const overlays = new Map(state.overlays);
      overlays.set(channelId, channel);
      const candidate = this.withOverlays(state, state.source!, overlays);
      state.overlays = overlays;
      this.replaceSource(state, candidate);
      this.assertReady(state);
    })().finally(() => {
      if (state.channelReads.get(channelId) === recovery) state.channelReads.delete(channelId);
    });
    state.channelReads.set(channelId, recovery);
    return recovery;
  }

  /** Called on private bridge loss, before any replacement connection subscribes. */
  public detachBridge(): void {
    for (const state of this.guilds.values()) {
      for (const userId of state.watches.keys()) this.members.release(state.guildId, userId);
      state.generation += 1;
    }
    this.guilds.clear();
    this.memberCount = 0;
  }

  public stop(): void {
    this.stopped = true;
    clearInterval(this.cleanupTimer);
    for (const remove of this.removeListeners) remove();
    this.detachBridge();
  }

  private listen<K extends keyof ClientEvents>(
    event: K,
    listener: (...args: ClientEvents[K]) => void,
  ): void {
    this.client.on(event, listener);
    this.removeListeners.push(() => this.client.off(event, listener));
  }

  private ensureGuild(guildId: string): GuildState {
    const existing = this.guilds.get(guildId);
    if (existing !== undefined) return existing;
    const guild = this.client.guilds.cache.get(guildId);
    if (guild === undefined) throw new LiveStateError('WORLD_NOT_FOUND', 404);
    const state: GuildState = {
      guildId,
      keyPromise: Promise.resolve(),
      cursor: { streamId: crypto.randomUUID(), sequence: 0 },
      generation: 0,
      ready: false,
      suspended: !guild.available || this.suspendedShards.has(guild.shardId),
      delivering: true,
      watches: new Map(),
      overlays: new Map(),
      publishedMembers: new Map(),
      channelEvents: new Map(),
      channelEventFloor: 0,
      channelReads: new Map(),
      refreshChannels: false,
    };
    state.keyPromise = this.identifiers.for('guild', guildId).then((key) => {
      state.guildKey = key;
    });
    this.guilds.set(guildId, state);
    return state;
  }

  private watch(
    state: GuildState,
    userId: string,
    subscriptionId: string,
    kind: 'lease' | 'connected',
  ): void {
    let watches = state.watches.get(userId);
    if (!watches?.has(subscriptionId)) {
      const subscriptions = [...state.watches.values()].reduce(
        (total, memberWatches) => total + memberWatches.size,
        0,
      );
      if (subscriptions >= MAX_GUILD_MEMBERS) throw new LiveStateError();
    }
    if (watches === undefined) {
      if (state.watches.size >= MAX_GUILD_MEMBERS || this.memberCount >= MAX_MEMBERS)
        throw new LiveStateError();
      watches = new Map();
      state.watches.set(userId, watches);
      this.memberCount += 1;
    }
    const existing = watches.get(subscriptionId);
    watches.set(subscriptionId, {
      connected: existing?.connected === true || kind === 'connected',
      expiresAt: Date.now() + LEASE_MS,
    });
    // Establish the generation slot before yielding to identifier/source bootstrap.
    // The read itself starts in recover(), after source readiness has been established.
    this.members.retain(state.guildId, userId);
  }

  private assertOwned(state: GuildState, userId: string, subscriptionId: string): void {
    if (this.guilds.get(state.guildId) !== state || !state.watches.get(userId)?.has(subscriptionId))
      throw new LiveStateError();
  }

  private assertReady(state: GuildState): void {
    if (
      this.stopped ||
      this.guilds.get(state.guildId) !== state ||
      !state.ready ||
      state.suspended ||
      !state.delivering
    )
      throw new LiveStateError();
  }

  private assertRecovery(state: GuildState, generation: number): void {
    if (
      this.stopped ||
      this.guilds.get(state.guildId) !== state ||
      state.generation !== generation ||
      state.suspended ||
      !state.delivering
    )
      throw new LiveStateError();
  }

  private dropMember(state: GuildState, userId: string): void {
    if (!state.watches.delete(userId)) return;
    this.members.release(state.guildId, userId);
    state.publishedMembers.delete(userId);
    this.memberCount -= 1;
    if (state.watches.size === 0) {
      state.generation += 1;
      this.guilds.delete(state.guildId);
    }
  }

  private expireLeases(): void {
    const now = Date.now();
    for (const state of this.guilds.values()) {
      for (const [userId, watches] of state.watches) {
        for (const [subscriptionId, watch] of watches) {
          if (!watch.connected && watch.expiresAt <= now) watches.delete(subscriptionId);
        }
        if (watches.size === 0) this.dropMember(state, userId);
      }
    }
  }

  private emit(state: GuildState, content: FrameContent): void {
    if (
      !state.delivering ||
      state.guildKey === undefined ||
      this.guilds.get(state.guildId) !== state
    )
      return;
    if (state.suspended && content.type !== 'world-health') return;
    const memberId =
      content.type === 'world-member'
        ? content.member.kind === 'present'
          ? content.member.member.userId
          : content.member.userId
        : undefined;
    if (
      content.type === 'world-member' &&
      JSON.stringify(state.publishedMembers.get(memberId!)) === JSON.stringify(content.member)
    ) {
      recordGatewayOperation({
        operation: 'duplicate_content_suppression',
        outcome: 'suppressed',
        reason: 'member_unchanged',
        durationMs: 0,
      });
      return;
    }
    const cursor = { streamId: state.cursor.streamId, sequence: state.cursor.sequence + 1 };
    let sent = false;
    try {
      sent = this.publish({
        ...content,
        serviceSessionId: this.serviceSessionId,
        guildKey: state.guildKey,
        cursor,
      });
    } catch {
      /* The failed send fences all further authoritative delivery. */
    }
    if (sent) {
      state.cursor = cursor;
      if (content.type === 'world-member') state.publishedMembers.set(memberId!, content.member);
    } else state.delivering = false;
  }

  private replaceSource(state: GuildState, source: DiscordSourceBundle): void {
    if (JSON.stringify(state.source) === JSON.stringify(source)) {
      recordGatewayOperation({
        operation: 'duplicate_content_suppression',
        outcome: 'suppressed',
        reason: 'source_unchanged',
        durationMs: 0,
      });
      return;
    }
    state.source = source;
    this.emit(state, { type: 'world-source', source });
  }

  private async cachedMember(
    guildId: string,
    userId: string,
    reason: 'admission' | 'source_recovery',
  ): Promise<MemberRecord> {
    if (this.members.peek(guildId, userId) !== undefined) {
      return this.members.get(guildId, userId);
    }
    const startedAt = Date.now();
    try {
      const record = await this.members.get(guildId, userId);
      recordGatewayOperation({
        operation: 'member_cache_miss',
        outcome: 'completed',
        reason,
        durationMs: Date.now() - startedAt,
      });
      return record;
    } catch (error) {
      recordGatewayOperation({
        operation: 'member_cache_miss',
        outcome: 'failed',
        reason,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  private withOverlays(
    state: GuildState,
    source: DiscordSourceBundle,
    overlays: ReadonlyMap<string, DiscordChannelSource | null> = state.overlays,
  ): DiscordSourceBundle {
    const channels = new Map(source.channels.map((channel) => [channel.id, channel]));
    for (const [id, channel] of overlays) {
      if (channel === null) channels.delete(id);
      else channels.set(id, channel);
    }
    return validateDiscordSourceBundle(
      { ...source, channels: [...channels.values()].sort((a, b) => a.id.localeCompare(b.id)) },
      state.guildId,
    );
  }

  private structure(guildId: string, channelId?: string): void {
    const state = this.guilds.get(guildId);
    const guild = this.client.guilds.cache.get(guildId);
    if (state === undefined || guild === undefined) return;
    state.generation += 1;
    if (channelId !== undefined) {
      state.overlays.delete(channelId);
      state.channelEvents.delete(channelId);
      state.channelEvents.set(channelId, state.generation);
      if (state.channelEvents.size > 1_000) {
        const oldest = state.channelEvents.entries().next().value!;
        state.channelEventFloor = Math.max(state.channelEventFloor, oldest[1]);
        state.channelEvents.delete(oldest[0]);
      }
    }
    try {
      this.replaceSource(
        state,
        this.withOverlays(state, sourceFromGuild(guild, state.source?.botMember)),
      );
    } catch {
      this.uncertain(state);
    }
    if (!state.ready) this.requestRecovery(state);
  }

  private requestRecovery(state: GuildState): void {
    void Promise.resolve(state.recovery)
      .catch(() => undefined)
      .then(() => {
        if (
          this.guilds.get(state.guildId) === state &&
          !state.suspended &&
          !state.ready &&
          state.delivering
        )
          return this.recover(state.guildId);
      })
      .catch(() => undefined);
  }

  private uncertain(state: GuildState): void {
    state.generation += 1;
    state.ready = false;
    this.emit(state, { type: 'world-health', ready: false });
  }

  private loseGuild(guildId: string, preserve = true): void {
    const state = this.guilds.get(guildId);
    if (state === undefined) return;
    // Health closes the old stream. Recovery subsequently starts at sequence zero.
    this.uncertain(state);
    state.suspended = true;
    state.cursor = { streamId: crypto.randomUUID(), sequence: 0 };
    state.overlays.clear();
    state.publishedMembers.clear();
    this.members.invalidateGuild(guildId, preserve);
  }

  private loseShard(shardId: number): void {
    this.suspendedShards.add(shardId);
    for (const state of this.guilds.values()) {
      if (this.client.guilds.cache.get(state.guildId)?.shardId === shardId)
        this.loseGuild(state.guildId);
    }
  }

  private resumeGuild(guildId: string, resumed: boolean): void {
    const state = this.guilds.get(guildId);
    if (state === undefined) return;
    state.suspended = false;
    state.ready = false;
    state.generation += 1;
    if (!resumed) {
      state.cursor = { streamId: crypto.randomUUID(), sequence: 0 };
      state.source = undefined;
      state.overlays.clear();
      this.members.invalidateGuild(guildId);
    }
    // A superseded recovery must settle before the replay/fresh-ready recovery starts.
    this.requestRecovery(state);
  }

  private resumeShard(shardId: number, resumed: boolean): void {
    this.suspendedShards.delete(shardId);
    for (const state of this.guilds.values()) {
      if (this.client.guilds.cache.get(state.guildId)?.shardId === shardId)
        this.resumeGuild(state.guildId, resumed);
    }
  }

  private rawMember(packet: unknown): void {
    if (typeof packet !== 'object' || packet === null || !('t' in packet) || !('d' in packet))
      return;
    if (
      !['GUILD_MEMBER_ADD', 'GUILD_MEMBER_UPDATE', 'GUILD_MEMBER_REMOVE'].includes(String(packet.t))
    )
      return;
    const identity = memberIdentitySchema.safeParse(packet.d);
    if (!identity.success) return;
    const guildId = identity.data.guild_id;
    const userId = identity.data.user.id;
    const state = this.guilds.get(guildId);
    if (state === undefined) return;
    const bot = userId === this.client.user?.id;
    if (!bot && !state.watches.has(userId)) return;
    const previous = this.members.peek(guildId, userId);
    if (packet.t === 'GUILD_MEMBER_REMOVE') {
      const record: MemberRecord = { kind: 'absent', userId };
      this.members.update(guildId, record);
      if (state.watches.has(userId) && JSON.stringify(previous) !== JSON.stringify(record))
        this.emit(state, { type: 'world-member', member: record });
      if (bot) this.loseGuild(guildId, false);
      return;
    }
    const parsed = memberPayloadSchema.safeParse(packet.d);
    if (!parsed.success) {
      this.members.invalidate(guildId, userId);
      this.uncertain(state);
      this.requestRecovery(state);
      return;
    }
    const data = parsed.data;
    if (bot) {
      state.generation += 1;
      if (state.source !== undefined) {
        try {
          this.replaceSource(
            state,
            validateDiscordSourceBundle(
              {
                ...state.source,
                botMember: { roleIds: data.roles.filter((id) => id !== guildId).sort() },
              },
              guildId,
            ),
          );
        } catch {
          this.uncertain(state);
        }
      }
      if (!state.ready) this.requestRecovery(state);
    }
    if (!state.watches.has(userId)) return;
    const baseline = previous?.kind === 'present' ? previous.member : undefined;
    const pending = data.pending ?? baseline?.pending;
    const timeout =
      data.communication_disabled_until === undefined
        ? baseline?.communicationDisabledUntil
        : data.communication_disabled_until;
    if (pending === undefined || timeout === undefined) {
      // Optional UPDATE fields are not permission-granting defaults.
      this.members.invalidate(guildId, userId);
      this.uncertain(state);
      this.requestRecovery(state);
      return;
    }
    const record: MemberRecord = {
      kind: 'present',
      member: {
        userId,
        roleIds: data.roles.filter((id) => id !== guildId).sort(),
        pending,
        communicationDisabledUntil: timeout,
      },
    };
    this.members.update(guildId, record);
    if (JSON.stringify(previous) !== JSON.stringify(record))
      this.emit(state, { type: 'world-member', member: record });
  }

  private async readMember(
    guildId: string,
    userId: string,
    signal?: AbortSignal,
  ): Promise<MemberRecord> {
    try {
      const raw = await this.client.rest.get(Routes.guildMember(guildId, userId), { signal });
      const data = memberResponseSchema.parse(raw);
      if (data.user.id !== userId) throw new LiveStateError();
      // Full REST member responses supply the baseline for optional gateway updates.
      return memberRecordSchema.parse({
        kind: 'present',
        member: {
          userId,
          roleIds: data.roles.filter((id) => id !== guildId).sort(),
          pending: data.pending ?? false,
          communicationDisabledUntil: data.communication_disabled_until ?? null,
        },
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 10007)
        return { kind: 'absent', userId };
      if (error instanceof LiveStateError) throw error;
      throw new LiveStateError();
    }
  }
}
