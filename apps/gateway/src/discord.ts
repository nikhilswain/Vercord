import { once } from 'node:events';

import {
  ChannelType,
  Client,
  DiscordAPIError,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  type Guild,
  type VoiceBasedChannel,
  type VoiceState as DiscordVoiceState,
} from 'discord.js';

import {
  createIdentifierFactory,
  type IdentifierFactory,
} from '../../../src/domain/discord/identifiers';
import {
  type GatewayBridgeMessage,
  type GatewayCommand,
  type GatewayCommandErrorCode,
  type GatewayCommandResult,
  type VoiceState,
} from '../../../src/domain/voice/protocol';
import type { GatewayConfig } from './config';
import { KeyedSerialQueue } from './serial-queue';

type BridgeSender = (message: GatewayBridgeMessage) => boolean;

export class DiscordVoiceService {
  private readonly client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
  private readonly identifiersPromise: Promise<IdentifierFactory>;
  private readonly queue = new KeyedSerialQueue();
  private readonly serviceSessionId = crypto.randomUUID();
  private revision = 0;
  private sendToBridge: BridgeSender = () => false;
  private bridgeAttached = false;
  private registrationTimer: NodeJS.Timeout | null = null;

  public constructor(private readonly config: GatewayConfig) {
    this.identifiersPromise = createIdentifierFactory(config.snapshotIdSecret);
    this.client.on(Events.VoiceStateUpdate, (_previous, current) => {
      void this.publishVoiceState(current).catch(() => {
        console.error(
          JSON.stringify({ service: 'dmap-gateway', event: 'voice_state_publish_failed' }),
        );
      });
    });
    this.client.on(Events.GuildCreate, () => this.refreshBridgeRegistration());
    this.client.on(Events.GuildDelete, () => this.refreshBridgeRegistration());
    this.client.on(Events.Error, () => {
      console.error(JSON.stringify({ service: 'dmap-gateway', event: 'discord_error' }));
    });
  }

  public async start(): Promise<void> {
    const ready = once(this.client, Events.ClientReady);
    await this.client.login(this.config.botToken);
    await ready;
  }

  public stop(): void {
    if (this.registrationTimer !== null) clearTimeout(this.registrationTimer);
    this.registrationTimer = null;
    this.client.destroy();
  }

  public async attachBridge(send: BridgeSender): Promise<void> {
    const identifiers = await this.identifiersPromise;
    const guilds = [...this.client.guilds.cache.values()];
    const guildKeys = await Promise.all(guilds.map(({ id }) => identifiers.for('guild', id)));
    const helloSent = send({
      type: 'hello',
      protocolVersion: 1,
      serviceSessionId: this.serviceSessionId,
      guildKeys,
    });
    if (!helloSent) throw new Error('Worker bridge closed before initialization.');
    this.sendToBridge = send;
    this.bridgeAttached = true;
    await Promise.all(guilds.map((guild) => this.publishSnapshot(guild, send)));
  }

  public handleCommand(command: GatewayCommand): Promise<GatewayCommandResult> {
    return this.queue.run(`${command.guildId}:${command.userId}`, () =>
      this.executeCommand(command),
    );
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
      const member = current.member;
      if (member === null) return this.failure(command, 'MEMBER_NOT_FOUND');
      const memberPermissions = channel.permissionsFor(member);
      if (
        memberPermissions === null ||
        !memberPermissions.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])
      ) {
        return this.failure(command, 'MEMBER_FORBIDDEN');
      }
      const me = guild.members.me;
      const permissions = me === null ? null : channel.permissionsFor(me);
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
