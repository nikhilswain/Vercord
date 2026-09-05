import {
  WebhookType,
  type GuildMember,
  type NewsChannel,
  type TextChannel,
  type Webhook,
} from 'discord.js';

import { dispatchContext, type DispatchContext } from './interactive-rest';

const RELAY_NAME = 'Dmap Relay';
const RELAY_REASON = 'Dmap managed message relay';
const MAX_RELAYS = 1_000;
const MAX_PERSONA_LENGTH = 80;

type MessageChannel = TextChannel | NewsChannel;
type Relay = Webhook<WebhookType.Incoming>;
type CachedRelay = { guildId: string; webhook: Relay };
type SetupFlight = {
  guildId: string;
  promise: Promise<Relay | null>;
  valid: boolean;
};

export interface ResolveRelayInput {
  channel: MessageChannel;
  botId: string;
  requestId: string;
  assertAllowed(): void;
}

export class ManagedWebhookRateLimit extends Error {
  public constructor(public readonly retryAt: number) {
    super('MESSAGE_RATE_LIMITED');
    this.name = 'ManagedWebhookRateLimit';
  }
}

export class ManagedWebhookRelay {
  private readonly cache = new Map<string, CachedRelay>();
  private readonly setup = new Map<string, SetupFlight>();

  public resolve(input: ResolveRelayInput): Promise<Relay | null> {
    input.assertAllowed();
    const channelId = input.channel.id;
    const cached = this.cache.get(channelId);
    if (cached !== undefined) return Promise.resolve(cached.webhook);

    const current = this.setup.get(channelId);
    if (current !== undefined) return current.promise;

    const flight: SetupFlight = {
      guildId: input.channel.guildId,
      promise: Promise.resolve(null),
      valid: true,
    };
    flight.promise = this.discover(input)
      .then((webhook) => {
        if (webhook === null || !flight.valid || this.setup.get(channelId) !== flight) return null;
        this.remember(channelId, input.channel.guildId, webhook);
        return webhook;
      })
      .finally(() => {
        if (this.setup.get(channelId) === flight) this.setup.delete(channelId);
      });
    this.setup.set(channelId, flight);
    return flight.promise;
  }

  public invalidate(channelId: string): void {
    this.cache.delete(channelId);
    const flight = this.setup.get(channelId);
    if (flight !== undefined) flight.valid = false;
    this.setup.delete(channelId);
  }

  public invalidateGuild(guildId: string): void {
    for (const [channelId, relay] of this.cache)
      if (relay.guildId === guildId) this.cache.delete(channelId);
    for (const [channelId, flight] of this.setup) {
      if (flight.guildId !== guildId) continue;
      flight.valid = false;
      this.setup.delete(channelId);
    }
  }

  public clear(): void {
    this.cache.clear();
    for (const flight of this.setup.values()) flight.valid = false;
    this.setup.clear();
  }

  private async discover(input: ResolveRelayInput): Promise<Relay | null> {
    try {
      input.assertAllowed();
      const webhooks = await input.channel.fetchWebhooks();
      input.assertAllowed();
      const existing = webhooks.find(
        (webhook): webhook is Relay =>
          webhook.type === WebhookType.Incoming &&
          webhook.owner?.id === input.botId &&
          webhook.name === RELAY_NAME,
      );
      if (existing !== undefined) return existing;
    } catch (error) {
      this.rethrowRateLimit(error);
      return null;
    }

    const context: DispatchContext = {
      requestId: input.requestId,
      dispatched: false,
      assertAllowed: input.assertAllowed,
    };
    try {
      return await dispatchContext.run(context, () =>
        input.channel.createWebhook({ name: RELAY_NAME, reason: RELAY_REASON }),
      );
    } catch (error) {
      this.rethrowRateLimit(error);
      return null;
    }
  }

  private remember(channelId: string, guildId: string, webhook: Relay): void {
    if (this.cache.has(channelId)) this.cache.delete(channelId);
    while (this.cache.size >= MAX_RELAYS) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    this.cache.set(channelId, { guildId, webhook });
  }

  private rethrowRateLimit(error: unknown): void {
    if (error instanceof ManagedWebhookRateLimit) throw error;
    if (!isRateLimit(error)) return;
    const wait = Math.max(
      1,
      ...['retryAfter', 'timeToReset', 'sublimitTimeout'].map(
        (key) => numericProperty(error, key) ?? 0,
      ),
    );
    throw new ManagedWebhookRateLimit(Math.ceil(Date.now() + Math.min(wait, 60_000)));
  }
}

export function safePersona(member: GuildMember): { username: string; avatarURL?: string } {
  const username = truncate(normalizedName(member), MAX_PERSONA_LENGTH);
  const avatarURL = member.displayAvatarURL({ size: 128 });
  return { username, ...(avatarURL.length === 0 ? {} : { avatarURL }) };
}

export function attributedContent(member: GuildMember, content: string): string {
  return `**${escapedName(member)} says:**\n${content}`;
}

function normalizedName(member: GuildMember): string {
  for (const candidate of [member.displayName, member.user.username, 'Discord member']) {
    const normalized = candidate
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    if (normalized.length > 0) return normalized;
  }
  return 'Discord member';
}

function truncate(value: string, maximum: number): string {
  return [...value].slice(0, maximum).join('');
}

function escapedName(member: GuildMember): string {
  let escaped = '';
  let length = 0;
  for (const character of normalizedName(member)) {
    const next = /[\\*_~`|]/u.test(character) ? `\\${character}` : character;
    const nextLength = [...next].length;
    if (length + nextLength > MAX_PERSONA_LENGTH) break;
    escaped += next;
    length += nextLength;
  }
  return escaped;
}

function isRateLimit(error: unknown): boolean {
  if (error instanceof Error && error.name === 'RateLimitError') return true;
  return numericProperty(error, 'status') === 429;
}

function numericProperty(error: unknown, key: string): number | undefined {
  if (typeof error !== 'object' || error === null || !(key in error)) return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
