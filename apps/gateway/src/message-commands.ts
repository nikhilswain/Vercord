import { createHash } from 'node:crypto';

import {
  ChannelType,
  DiscordAPIError,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type NewsChannel,
  type TextChannel,
} from 'discord.js';

import type { IdentifierFactory } from '../../../src/domain/discord/identifiers';
import type { LiveCommand, LiveCommandResult } from '../../../src/domain/discord/live-protocol';
import {
  MESSAGE_HISTORY_LIMIT,
  MESSAGE_CONTENT_MAX_LENGTH,
  messageHistorySchema,
  roomMessageSchema,
  type MessageErrorCode,
  type RoomMessage,
} from '../../../src/domain/messages/protocol';
import { dispatchContext, type DispatchContext } from './interactive-rest';
import {
  ManagedWebhookRateLimit,
  ManagedWebhookRelay,
  attributedContent,
  safePersona,
} from './managed-webhook-relay';

type Command = Extract<LiveCommand, { type: 'message-read' | 'message-send' }>;
type SendCommand = Extract<Command, { type: 'message-send' }>;
type MessageChannel = TextChannel | NewsChannel;
type Correlation = {
  fingerprint: string;
  expiresAt: number;
  result: Promise<LiveCommandResult>;
};

const MAX_PENDING_COMMANDS = 200;
const MAX_OUTCOMES = 1_000;
const OUTCOME_TTL_MS = 5 * 60_000;

class MessageCommandError extends Error {
  public constructor(
    public readonly code: MessageErrorCode,
    public readonly status: number,
    public readonly retryAt?: number,
  ) {
    super(code);
  }
}

function safeMessageContent(message: Message<true>): string {
  return message.content
    .replace(/<@!?\d{17,20}>/gu, '@member')
    .replace(/<@&\d{17,20}>/gu, '@role')
    .replace(/<#\d{17,20}>/gu, '#channel')
    .replace(/<\/([^:>]{1,100}):\d{17,20}>/gu, '/$1')
    .replace(/<a?:([^:>]{1,100}):\d{17,20}>/gu, ':$1:')
    .slice(0, MESSAGE_CONTENT_MAX_LENGTH);
}

export async function toRoomMessage(
  message: Message<true>,
  roomKey: string,
  identifiers: IdentifierFactory,
): Promise<RoomMessage> {
  return roomMessageSchema.parse({
    id: await identifiers.for('message', message.id),
    roomKey,
    author: {
      displayName:
        message.member?.displayName ?? message.author.globalName ?? message.author.username,
      // Provider avatar URLs contain stable Discord identifiers. Keep the browser payload opaque.
      avatarUrl: null,
      bot: message.author.bot,
    },
    content: safeMessageContent(message),
    createdAt: message.createdAt.toISOString(),
    attachmentCount: message.attachments.size,
    embedCount: message.embeds.length,
  });
}

export class MessageCommands {
  private readonly outcomes = new Map<string, Correlation>();
  private pending = 0;

  public constructor(
    private readonly client: Client,
    private readonly identifiers: IdentifierFactory,
    private readonly relay = new ManagedWebhookRelay(),
  ) {}

  public execute(command: Command, isCurrent: () => boolean): Promise<LiveCommandResult> {
    if (command.type === 'message-send') return this.sendOnce(command, isCurrent);
    return this.withAdmission(command, () => this.read(command, isCurrent));
  }

  private sendOnce(command: SendCommand, isCurrent: () => boolean): Promise<LiveCommandResult> {
    const now = Date.now();
    for (const [id, outcome] of this.outcomes)
      if (outcome.expiresAt <= now) this.outcomes.delete(id);

    const fingerprint = createHash('sha256')
      .update(JSON.stringify([command.guildId, command.userId, command.input]))
      .digest('hex');
    const existing = this.outcomes.get(command.requestId);
    if (existing !== undefined)
      return existing.fingerprint === fingerprint
        ? existing.result
        : Promise.resolve(this.failure(command, 'INVALID_REQUEST', 400));
    if (this.outcomes.size >= MAX_OUTCOMES)
      return Promise.resolve(this.failure(command, 'MESSAGE_LIMIT_REACHED', 503));

    const result = this.withAdmission(command, () => this.send(command, isCurrent));
    const correlation: Correlation = {
      fingerprint,
      expiresAt: Number.POSITIVE_INFINITY,
      result,
    };
    this.outcomes.set(command.requestId, correlation);
    void result.finally(() => {
      correlation.expiresAt = Date.now() + OUTCOME_TTL_MS;
    });
    return result;
  }

  private async withAdmission(
    command: Command,
    operation: () => Promise<LiveCommandResult>,
  ): Promise<LiveCommandResult> {
    if (command.expiresAt <= Date.now())
      return this.failure(command, 'MESSAGE_REQUEST_EXPIRED', 408);
    if (this.pending >= MAX_PENDING_COMMANDS)
      return this.failure(command, 'MESSAGE_LIMIT_REACHED', 503);
    this.pending += 1;
    try {
      return await operation();
    } catch (error) {
      return this.errorResult(command, error);
    } finally {
      this.pending -= 1;
    }
  }

  private async read(
    command: Extract<Command, { type: 'message-read' }>,
    isCurrent: () => boolean,
  ): Promise<LiveCommandResult> {
    this.assertCurrent(command, isCurrent);
    const guild = this.guild(command.guildId);
    const channel = await this.channel(guild, command.roomKey);
    const [actor, bot] = await Promise.all([this.actor(guild, command.userId), this.bot(guild)]);
    const canRead =
      this.hasPermissions(channel, actor, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ]) &&
      this.hasPermissions(channel, bot, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ]);
    const actorAllowed =
      !actor.pending &&
      !this.isTimedOut(actor) &&
      this.hasPermissions(channel, actor, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ]);
    const webhookAllowed = this.hasPermissions(channel, bot, [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ManageWebhooks,
    ]);
    const fallbackAllowed = this.hasPermissions(channel, bot, [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ]);
    const canSend = actorAllowed && (webhookAllowed || fallbackAllowed);
    this.assertCurrent(command, isCurrent);

    let messages: RoomMessage[] = [];
    if (canRead) {
      let fetched;
      try {
        fetched = await channel.messages.fetch({ limit: MESSAGE_HISTORY_LIMIT });
      } catch (error) {
        throw this.mapDiscordError(error, 'MESSAGE_READ_FAILED');
      }
      this.assertCurrent(command, isCurrent);
      messages = await Promise.all(
        [...fetched.values()]
          .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
          .map((message) => toRoomMessage(message, command.roomKey, this.identifiers)),
      );
    }
    return {
      type: 'message-history-result',
      requestId: command.requestId,
      result: messageHistorySchema.parse({
        roomKey: command.roomKey,
        messages,
        canRead,
        canSend,
      }),
    };
  }

  private async send(command: SendCommand, isCurrent: () => boolean): Promise<LiveCommandResult> {
    this.assertCurrent(command, isCurrent);
    const guild = this.guild(command.guildId);
    const channel = await this.channel(guild, command.input.roomKey);
    const [actor, bot] = await Promise.all([this.actor(guild, command.userId), this.bot(guild)]);
    if (actor.pending) throw new MessageCommandError('MESSAGE_MEMBER_PENDING', 403);
    if (this.isTimedOut(actor)) throw new MessageCommandError('MESSAGE_MEMBER_TIMED_OUT', 403);
    this.assertPermissions(
      channel,
      actor,
      [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      'MESSAGE_MEMBER_FORBIDDEN',
    );
    const webhookAllowed = this.hasPermissions(channel, bot, [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ManageWebhooks,
    ]);
    const fallbackAllowed = this.hasPermissions(channel, bot, [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ]);
    if (!webhookAllowed && !fallbackAllowed)
      throw new MessageCommandError('MESSAGE_BOT_FORBIDDEN', 403);

    const assertAllowed = () => this.assertCurrent(command, isCurrent);
    if (webhookAllowed) {
      const webhook = await this.relay.resolve({
        channel,
        botId: bot.id,
        requestId: command.requestId,
        assertAllowed,
      });
      if (webhook !== null) {
        const context = this.dispatch(command.requestId, assertAllowed);
        try {
          const persona = safePersona(actor);
          const message = await dispatchContext.run(context, () =>
            webhook.send({
              content: command.input.content,
              username: persona.username,
              avatarURL: persona.avatarURL,
              allowedMentions: { parse: [] },
            }),
          );
          return await this.applied(command, message);
        } catch (error) {
          const status = context.responseStatus;
          if (status === 401 || status === 404) this.relay.invalidate(channel.id);
          const mapped = this.mapDiscordError(error, 'MESSAGE_SEND_REJECTED');
          if (mapped.status === 429) throw mapped;
          const definitelyRejected =
            !context.dispatched || (status !== undefined && status >= 400 && status < 500);
          if (!definitelyRejected) return this.uncertain(command);
          if (!fallbackAllowed) throw mapped;
        }
      }
    }

    if (!fallbackAllowed) throw new MessageCommandError('MESSAGE_BOT_FORBIDDEN', 403);
    const context = this.dispatch(command.requestId, assertAllowed);
    try {
      const nonce = createHash('sha256').update(command.requestId).digest('base64url').slice(0, 25);
      const message = await dispatchContext.run(context, () =>
        channel.send({
          content: attributedContent(actor, command.input.content),
          allowedMentions: { parse: [] },
          nonce,
          enforceNonce: true,
        }),
      );
      return await this.applied(command, message);
    } catch (error) {
      const mapped = this.mapDiscordError(error, 'MESSAGE_SEND_REJECTED');
      const status = context.responseStatus;
      if (!context.dispatched || (status !== undefined && status >= 400 && status < 500)) {
        throw mapped;
      }
      return this.uncertain(command);
    }
  }

  private applied(command: SendCommand, message: Message<true>): Promise<LiveCommandResult> {
    return toRoomMessage(message, command.input.roomKey, this.identifiers).then((normalized) => ({
      type: 'message-send-result' as const,
      requestId: command.requestId,
      status: 'applied' as const,
      message: normalized,
    }));
  }

  private uncertain(command: SendCommand): LiveCommandResult {
    return {
      type: 'message-send-result',
      requestId: command.requestId,
      status: 'uncertain',
      code: 'MESSAGE_ACTION_UNCERTAIN',
    };
  }

  private dispatch(requestId: string, assertAllowed: () => void): DispatchContext {
    return { requestId, dispatched: false, assertAllowed };
  }

  private guild(guildId: string): Guild {
    const guild = this.client.guilds.cache.get(guildId);
    if (guild === undefined) throw new MessageCommandError('WORLD_SOURCE_UNAVAILABLE', 503);
    return guild;
  }

  private async channel(guild: Guild, roomKey: string): Promise<MessageChannel> {
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
        continue;
      if ((await this.identifiers.for('channel', channel.id)).toLowerCase() === roomKey)
        return channel;
    }
    throw new MessageCommandError('MESSAGE_CHANNEL_NOT_FOUND', 404);
  }

  private async actor(guild: Guild, userId: string): Promise<GuildMember> {
    try {
      return (
        guild.members.cache.get(userId) ??
        (await guild.members.fetch({ user: userId, cache: false }))
      );
    } catch (error) {
      if (this.discordStatus(error) === 404)
        throw new MessageCommandError('GUILD_MEMBERSHIP_REQUIRED', 403);
      throw this.mapDiscordError(error, 'MESSAGE_READ_FAILED');
    }
  }

  private async bot(guild: Guild): Promise<GuildMember> {
    try {
      return guild.members.me ?? (await guild.members.fetchMe());
    } catch (error) {
      throw this.mapDiscordError(error, 'MESSAGE_BOT_FORBIDDEN');
    }
  }

  private assertPermissions(
    channel: MessageChannel,
    member: GuildMember,
    permissions: bigint[],
    code: 'MESSAGE_MEMBER_FORBIDDEN' | 'MESSAGE_BOT_FORBIDDEN',
  ): void {
    if (!this.hasPermissions(channel, member, permissions))
      throw new MessageCommandError(code, 403);
  }

  private hasPermissions(
    channel: MessageChannel,
    member: GuildMember,
    permissions: bigint[],
  ): boolean {
    return channel.permissionsFor(member).has(permissions);
  }

  private isTimedOut(member: GuildMember): boolean {
    return (member.communicationDisabledUntilTimestamp ?? 0) > Date.now();
  }

  private assertCurrent(command: Command, isCurrent: () => boolean): void {
    if (!isCurrent()) throw new MessageCommandError('WORLD_SOURCE_UNAVAILABLE', 503);
    if (command.expiresAt <= Date.now())
      throw new MessageCommandError('MESSAGE_REQUEST_EXPIRED', 408);
  }

  private errorResult(command: Command, error: unknown): LiveCommandResult {
    const mapped =
      error instanceof MessageCommandError
        ? error
        : this.mapDiscordError(
            error,
            command.type === 'message-read' ? 'MESSAGE_READ_FAILED' : 'MESSAGE_SEND_REJECTED',
          );
    return this.failure(command, mapped.code, mapped.status, mapped.retryAt);
  }

  private failure(
    command: Command,
    code: MessageErrorCode,
    status: number,
    retryAt?: number,
  ): LiveCommandResult {
    return {
      type: 'live-error',
      requestId: command.requestId,
      error: { code, status, ...(retryAt === undefined ? {} : { retryAt }) },
    };
  }

  private mapDiscordError(
    error: unknown,
    fallback: 'MESSAGE_READ_FAILED' | 'MESSAGE_SEND_REJECTED' | 'MESSAGE_BOT_FORBIDDEN',
  ): MessageCommandError {
    if (error instanceof ManagedWebhookRateLimit)
      return new MessageCommandError('MESSAGE_RATE_LIMITED', 429, error.retryAt);
    const status = this.discordStatus(error);
    if (status === 403) return new MessageCommandError('MESSAGE_BOT_FORBIDDEN', 403);
    if (status === 404) return new MessageCommandError('MESSAGE_CHANNEL_NOT_FOUND', 404);
    if (status === 429 || this.errorName(error) === 'RateLimitError') {
      const retryAfter = this.numericProperty(error, 'retryAfter');
      const retryAt = Math.ceil(Date.now() + Math.min(Math.max(retryAfter ?? 1_000, 1), 60_000));
      return new MessageCommandError('MESSAGE_RATE_LIMITED', 429, retryAt);
    }
    if (error instanceof MessageCommandError) return error;
    return new MessageCommandError(fallback, fallback === 'MESSAGE_READ_FAILED' ? 502 : 400);
  }

  private discordStatus(error: unknown): number | undefined {
    if (error instanceof DiscordAPIError) return error.status;
    return this.numericProperty(error, 'status');
  }

  private errorName(error: unknown): string | undefined {
    return error instanceof Error ? error.name : undefined;
  }

  private numericProperty(error: unknown, key: string): number | undefined {
    if (typeof error !== 'object' || error === null || !(key in error)) return undefined;
    const value = (error as Record<string, unknown>)[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
}
