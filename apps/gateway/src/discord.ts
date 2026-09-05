import { once } from 'node:events';

import {
  ChannelType,
  Client,
  DiscordAPIError,
  Events,
  GatewayIntentBits,
  Options,
  PermissionFlagsBits,
  type Guild,
  type Message,
  type VoiceBasedChannel,
  type VoiceState as DiscordVoiceState,
} from 'discord.js';

import {
  createIdentifierFactory,
  type IdentifierFactory,
} from '../../../src/domain/discord/identifiers';
import {
  type GatewayCommand,
  type GatewayCommandErrorCode,
  type GatewayCommandResult,
  type VoiceState,
} from '../../../src/domain/voice/protocol';
import type { GatewayConfig } from './config';
import type {
  LiveCommand,
  LiveCommandResult,
  LiveFrame,
  ServerBridgeMessage,
} from '../../../src/domain/discord/live-protocol';
import { ChannelCommands } from './channel-commands';
import { InteractiveRateLimit, InteractiveRest, interactiveRestOptions } from './interactive-rest';
import { LiveStateError } from './member-state';
import { liveFailureSchema } from '../../../src/domain/discord/live-protocol';
import { DiscordLiveState } from './live-state';
import { MessageCommands, toRoomMessage } from './message-commands';
import { KeyedSerialQueue } from './serial-queue';

type BridgeSender = (message: ServerBridgeMessage) => boolean;

export class DiscordVoiceService {
  private readonly client = new Client({
    rest: interactiveRestOptions,
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      GuildMemberManager: {
        maxSize: 200,
        keepOverLimit: (member) => member.id === member.client.user?.id,
      },
      UserManager: { maxSize: 5_000, keepOverLimit: (user) => user.id === user.client.user?.id },
    }),
  });
  public readonly liveState: Promise<DiscordLiveState>;
  private readonly interactiveRest = new InteractiveRest(this.client.rest);
  private readonly channelCommands: Promise<ChannelCommands>;
  private readonly messageCommands: Promise<MessageCommands>;
  private readonly identifiersPromise: Promise<IdentifierFactory>;
  private readonly queue = new KeyedSerialQueue();
  public readonly serviceSessionId = crypto.randomUUID();
  private revision = 0;
  private sendToBridge: BridgeSender = () => false;
  private sendLiveToBridge: (frame: LiveFrame) => boolean = () => false;
  private bridgeAttached = false;
  private bridgeGeneration = 0;
  private registrationTimer: NodeJS.Timeout | null = null;
  private readonly structureTimers = new Map<string, ReturnType<typeof setTimeout>>();

  public constructor(private readonly config: GatewayConfig) {
    this.identifiersPromise = createIdentifierFactory(config.snapshotIdSecret);
    this.liveState = this.identifiersPromise.then(
      (identifiers) =>
        new DiscordLiveState(this.client, identifiers, (frame) => this.sendLiveToBridge(frame), {
          serviceSessionId: this.serviceSessionId,
          readMember: (guildId, userId, signal) =>
            this.interactiveRest.member(guildId, userId, signal),
          readSource: (path, signal) => this.interactiveRest.read(path, signal),
        }),
    );
    this.channelCommands = Promise.all([this.liveState, this.identifiersPromise]).then(
      ([state, identifiers]) => new ChannelCommands(state, this.interactiveRest, identifiers),
    );
    this.messageCommands = this.identifiersPromise.then(
      (identifiers) => new MessageCommands(this.client, identifiers),
    );
    this.client.on(Events.VoiceStateUpdate, (_previous, current) => {
      void this.publishVoiceState(current).catch(() => {
        console.error(
          JSON.stringify({ service: 'dmap-gateway', event: 'voice_state_publish_failed' }),
        );
      });
    });
    this.client.on(Events.GuildCreate, () => this.refreshBridgeRegistration());
    this.client.on(Events.GuildDelete, () => this.refreshBridgeRegistration());
    this.client.on(Events.ChannelCreate, (channel) => this.queueStructureChange(channel.guild.id));
    this.client.on(Events.ChannelDelete, (channel) => {
      if ('guild' in channel) this.queueStructureChange(channel.guild.id);
    });
    this.client.on(Events.ChannelUpdate, (_previous, channel) => {
      if ('guild' in channel) this.queueStructureChange(channel.guild.id);
    });
    this.client.on(Events.GuildRoleCreate, (role) => this.queueStructureChange(role.guild.id));
    this.client.on(Events.GuildRoleDelete, (role) => this.queueStructureChange(role.guild.id));
    this.client.on(Events.GuildRoleUpdate, (_previous, role) =>
      this.queueStructureChange(role.guild.id),
    );
    this.client.on(Events.GuildUpdate, (_previous, guild) => this.queueStructureChange(guild.id));
    this.client.on(Events.MessageCreate, (message) => {
      void this.publishGuildMessage(message).catch(() => {
        console.error(JSON.stringify({ service: 'dmap-gateway', event: 'message_publish_failed' }));
      });
    });
    this.client.on(Events.Error, () => {
      console.error(JSON.stringify({ service: 'dmap-gateway', event: 'discord_error' }));
    });
  }

  public async start(): Promise<void> {
    await this.liveState;
    const ready = once(this.client, Events.ClientReady);
    await this.client.login(this.config.botToken);
    await ready;
  }

  public stop(): void {
    void this.liveState.then((live) => live.stop());
    for (const timer of this.structureTimers.values()) clearTimeout(timer);
    this.structureTimers.clear();
    if (this.registrationTimer !== null) clearTimeout(this.registrationTimer);
    this.registrationTimer = null;
    this.client.destroy();
  }

  public attachLiveBridge(send: (frame: LiveFrame) => boolean): void {
    this.sendLiveToBridge = send;
  }

  public detachBridge(): void {
    this.bridgeGeneration += 1;
    this.bridgeAttached = false;
    this.sendToBridge = () => false;
    this.sendLiveToBridge = () => false;
    if (this.registrationTimer !== null) clearTimeout(this.registrationTimer);
    this.registrationTimer = null;
    void this.liveState.then((live) => live.detachBridge());
  }

  public async attachBridge(send: BridgeSender): Promise<void> {
    const generation = ++this.bridgeGeneration;
    const identifiers = await this.identifiersPromise;
    const live = await this.liveState;
    const guilds = [...this.client.guilds.cache.values()];
    const guildKeys = await Promise.all(guilds.map(({ id }) => identifiers.for('guild', id)));
    if (generation !== this.bridgeGeneration) return;
    live.detachBridge();
    const helloSent = send({
      type: 'hello',
      protocolVersion: 2,
      serviceSessionId: this.serviceSessionId,
      guildKeys,
      capabilities: ['live-world-v1', 'message-v1'],
    });
    if (!helloSent) throw new Error('Worker bridge closed before initialization.');
    this.sendToBridge = send;
    this.attachLiveBridge(send);
    this.bridgeAttached = true;
    await Promise.all(guilds.map((guild) => this.publishSnapshot(guild, send)));
  }

  public handleCommand(command: GatewayCommand): Promise<GatewayCommandResult> {
    return this.queue.run(`${command.guildId}:${command.userId}`, () =>
      this.executeCommand(command),
    );
  }

  public async handleChannelCommand(
    command: Extract<LiveCommand, { type: 'channel-mutate' }>,
  ): Promise<LiveCommandResult> {
    const generation = this.bridgeGeneration;
    return (await this.channelCommands).execute(
      command,
      () => this.bridgeAttached && generation === this.bridgeGeneration,
    );
  }

  public async handleLiveCommand(command: LiveCommand): Promise<LiveCommandResult> {
    if (command.type === 'channel-mutate') return this.handleChannelCommand(command);
    if (command.type === 'message-read' || command.type === 'message-send') {
      const generation = this.bridgeGeneration;
      return (await this.messageCommands).execute(
        command,
        () => this.bridgeAttached && generation === this.bridgeGeneration,
      );
    }
    try {
      const generation = this.bridgeGeneration;
      const live = await this.liveState;
      if (!this.bridgeAttached || generation !== this.bridgeGeneration) throw new LiveStateError();
      if (command.type === 'world-release') {
        live.release(command);
        return { type: 'release-result', requestId: command.requestId };
      }
      return {
        type: 'world-result',
        requestId: command.requestId,
        result: await live.read(command),
      };
    } catch (error) {
      const failure = liveFailureSchema.safeParse(
        error instanceof LiveStateError
          ? {
              code: error.code,
              status: error.status,
              ...(error instanceof InteractiveRateLimit
                ? { retryAt: error.retryAt, scope: 'admission' }
                : {}),
            }
          : null,
      );
      return {
        type: 'live-error',
        requestId: command.requestId,
        error: failure.success ? failure.data : { code: 'WORLD_SOURCE_UNAVAILABLE', status: 503 },
      };
    }
  }

  private queueStructureChange(guildId: string): void {
    if (this.structureTimers.has(guildId)) return;
    this.structureTimers.set(
      guildId,
      setTimeout(() => {
        this.structureTimers.delete(guildId);
        void this.publishStructureChange(guildId).catch(() => {
          console.error(
            JSON.stringify({ service: 'dmap-gateway', event: 'structure_update_failed' }),
          );
        });
      }, 500),
    );
  }

  private async publishStructureChange(guildId: string): Promise<void> {
    if (!this.bridgeAttached || !this.client.guilds.cache.has(guildId)) return;
    const identifiers = await this.identifiersPromise;
    this.sendToBridge({
      type: 'guild-structure-changed',
      guildKey: await identifiers.for('guild', guildId),
      serviceSessionId: this.serviceSessionId,
    });
  }

  private async executeCommand(command: GatewayCommand): Promise<GatewayCommandResult> {
    try {
      const guild = this.client.guilds.cache.get(command.guildId);
      if (guild === undefined) return this.failure(command, 'GUILD_NOT_FOUND');
      const current = guild.voiceStates.cache.get(command.userId);

      if (command.type === 'voice-query') {
        return this.success(
          command,
          current?.channelId ? await this.normalize(current) : await this.disconnectedState(),
        );
      }
      if (current?.channelId === null || current?.channelId === undefined) {
        return this.failure(command, 'NOT_CONNECTED');
      }
      if (command.type === 'disconnect') {
        await current.disconnect('Disconnected from Dmap');
        return this.success(command, null);
      }

      const channel = await this.resolveVoiceChannel(guild, command.roomKey);
      if (channel === null) return this.failure(command, 'CHANNEL_NOT_FOUND');
      // The bounded cache may evict a voice participant; fetch only this genuine miss.
      const member =
        current.member ?? (await guild.members.fetch({ user: command.userId, cache: false }));
      const me = guild.members.me ?? (await guild.members.fetchMe());
      const memberPermissions = channel.permissionsFor(member);
      if (
        memberPermissions === null ||
        !memberPermissions.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])
      ) {
        return this.failure(command, 'MEMBER_FORBIDDEN');
      }
      const permissions = channel.permissionsFor(me);
      if (
        permissions === null ||
        !permissions.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.MoveMembers,
        ])
      ) {
        return this.failure(command, 'BOT_FORBIDDEN');
      }
      await current.setChannel(channel, 'Moved by Dmap');
      return this.success(command, null);
    } catch (error) {
      return this.failure(command, this.errorCode(error));
    }
  }

  private async publishVoiceState(state: DiscordVoiceState): Promise<void> {
    const identifiers = await this.identifiersPromise;
    const normalized = await this.normalize(state);
    const [guildKey, presenceId] = await Promise.all([
      identifiers.for('guild', state.guild.id),
      identifiers.for('presence', `${state.guild.id}:${state.id}`),
    ]);
    this.sendToBridge({ type: 'voice-state', guildKey, presenceId, state: normalized });
  }

  private async publishGuildMessage(message: Message): Promise<void> {
    if (
      !this.bridgeAttached ||
      !message.inGuild() ||
      (message.channel.type !== ChannelType.GuildText &&
        message.channel.type !== ChannelType.GuildAnnouncement)
    ) {
      return;
    }
    const identifiers = await this.identifiersPromise;
    const [guildKey, roomKey] = await Promise.all([
      identifiers.for('guild', message.guildId),
      identifiers.for('channel', message.channelId),
    ]);
    this.sendToBridge({
      type: 'guild-message',
      guildKey,
      serviceSessionId: this.serviceSessionId,
      message: await toRoomMessage(message, roomKey.toLowerCase(), identifiers),
    });
  }

  private async publishSnapshot(
    guild: Guild,
    send: BridgeSender = this.sendToBridge,
  ): Promise<void> {
    const identifiers = await this.identifiersPromise;
    const revision = this.nextRevision();
    const voiceStates = [...guild.voiceStates.cache.values()];
    const states = await Promise.all(
      voiceStates.map(async (voiceState) => ({
        presenceId: await identifiers.for('presence', `${guild.id}:${voiceState.id}`),
        state: await this.normalize(voiceState, revision),
      })),
    );
    const guildKey = await identifiers.for('guild', guild.id);
    if (states.length <= 1_000) {
      send({
        type: 'voice-snapshot',
        guildKey,
        serviceSessionId: this.serviceSessionId,
        revision,
        states,
      });
      return;
    }
    for (const entry of states) {
      send({ type: 'voice-state', guildKey, ...entry });
    }
  }

  private async normalize(
    state: DiscordVoiceState,
    revision = this.nextRevision(),
  ): Promise<VoiceState> {
    const identifiers = await this.identifiersPromise;
    return {
      serviceSessionId: this.serviceSessionId,
      revision,
      channelKey:
        state.channelId === null
          ? null
          : (await identifiers.for('channel', state.channelId)).toLowerCase(),
      selfMute: state.selfMute ?? false,
      selfDeaf: state.selfDeaf ?? false,
      serverMute: state.serverMute ?? false,
      serverDeaf: state.serverDeaf ?? false,
      suppress: state.suppress ?? false,
    };
  }

  private disconnectedState(): Promise<VoiceState> {
    return Promise.resolve({
      serviceSessionId: this.serviceSessionId,
      revision: this.nextRevision(),
      channelKey: null,
      selfMute: false,
      selfDeaf: false,
      serverMute: false,
      serverDeaf: false,
      suppress: false,
    });
  }

  private async resolveVoiceChannel(
    guild: Guild,
    roomKey: string,
  ): Promise<VoiceBasedChannel | null> {
    const identifiers = await this.identifiersPromise;
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) {
        continue;
      }
      const key = (await identifiers.for('channel', channel.id)).toLowerCase();
      if (key === roomKey) return channel;
    }
    return null;
  }

  private success(command: GatewayCommand, state: VoiceState | null): GatewayCommandResult {
    return { type: 'command-result', requestId: command.requestId, ok: true, state };
  }

  private failure(
    command: GatewayCommand,
    errorCode: GatewayCommandErrorCode,
  ): GatewayCommandResult {
    return { type: 'command-result', requestId: command.requestId, ok: false, errorCode };
  }

  private errorCode(error: unknown): GatewayCommandErrorCode {
    if (error instanceof DiscordAPIError) {
      if (error.status === 403) return 'BOT_FORBIDDEN';
      if (error.status === 404) return 'MEMBER_NOT_FOUND';
      if (error.status === 429) return 'RATE_LIMITED';
    }
    return 'DISCORD_ERROR';
  }

  private nextRevision(): number {
    this.revision += 1;
    return this.revision;
  }

  private refreshBridgeRegistration(): void {
    if (!this.bridgeAttached) return;
    if (this.registrationTimer !== null) clearTimeout(this.registrationTimer);
    this.registrationTimer = setTimeout(() => {
      this.registrationTimer = null;
      void this.attachBridge(this.sendToBridge).catch(() => {
        console.error(
          JSON.stringify({ service: 'dmap-gateway', event: 'bridge_registration_failed' }),
        );
      });
    }, 100);
    this.registrationTimer.unref();
  }
}
