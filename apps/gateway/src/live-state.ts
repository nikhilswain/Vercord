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
    await this.members.get(command.guildId, command.userId);
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
      }
      this.assertRecovery(state, generation);
      this.replaceSource(state, this.withOverlays(state, source));
      const userIds = [...state.watches.keys()];
      await Promise.all(
        userIds.map(async (userId) => {
          const before = this.members.peek(guildId, userId);
          const record = await this.members.get(guildId, userId);
          this.assertRecovery(state, generation);
          if (state.watches.has(userId) && JSON.stringify(before) !== JSON.stringify(record)) {
            this.emit(state, { type: 'world-member', member: record });
          }
        }),
      );
      this.assertRecovery(state, generation);
      state.ready = true;
      this.emit(state, { type: 'world-health', ready: true });
    })().finally(() => {
      if (state.recovery === recovery) state.recovery = undefined;
    });
    state.recovery = recovery;
    return recovery;
  }

  public async reconcile(
    guildId: string,
    mutation: PreparedChannelMutation,
    response: unknown,
    before: LiveCursor,
  ): Promise<void> {
    const state = this.guilds.get(guildId);
    if (state === undefined) throw new LiveStateError();
    this.assertReady(state);
    if (state.cursor.streamId !== before.streamId) throw new LiveStateError();
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
        this.uncertain(state);
        throw new LiveStateError();
      }
      channel = parseDiscordChannels([response])[0]!;
      channel.overwrites.sort((a, b) => a.id.localeCompare(b.id) || a.type - b.type);
      channelId = channel.id;
      if (mutation.method === 'PATCH' && mutation.path !== `/channels/${channelId}`)
        throw new LiveStateError();
    }
    const current = source.channels.find((entry) => entry.id === channelId) ?? null;
    if (state.cursor.sequence !== before.sequence) {
      // A gateway event already advanced the world. Never install an older response.
      if (JSON.stringify(current) === JSON.stringify(channel)) return;
      this.uncertain(state);
      throw new LiveStateError();
    }
    if (!state.overlays.has(channelId) && state.overlays.size >= 1_000) {
      this.uncertain(state);
      throw new LiveStateError();
    }
    state.overlays.set(channelId, channel);
    this.replaceSource(state, this.withOverlays(state, source));
    this.assertReady(state);
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
    )
      return;
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
    if (JSON.stringify(state.source) === JSON.stringify(source)) return;
    state.source = source;
    this.emit(state, { type: 'world-source', source });
  }

  private withOverlays(state: GuildState, source: DiscordSourceBundle): DiscordSourceBundle {
    const channels = new Map(source.channels.map((channel) => [channel.id, channel]));
    for (const [id, channel] of state.overlays) {
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
    if (channelId !== undefined) state.overlays.delete(channelId);
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
