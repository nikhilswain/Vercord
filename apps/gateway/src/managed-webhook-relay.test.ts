import {
  ChannelType,
  Collection,
  WebhookType,
  type Client,
  type GuildMember,
  type Message,
  type TextChannel,
  type Webhook,
} from 'discord.js';
import { expect, it, vi } from 'vitest';

import type { LiveCommand } from '../../../src/domain/discord/live-protocol';
import { ManagedWebhookRelay, attributedContent, safePersona } from './managed-webhook-relay';
import { dispatchContext } from './interactive-rest';
import { MessageCommands } from './message-commands';

const botId = '100000000000000001';

function webhook(id: string, ownerId = botId, name = 'Dmap Relay'): Webhook<WebhookType.Incoming> {
  return {
    id,
    name,
    owner: { id: ownerId },
    type: WebhookType.Incoming,
  } as Webhook<WebhookType.Incoming>;
}

function channelFixture(fetches: Webhook<WebhookType.Incoming>[][] = [[]]) {
  const created = webhook('100000000000000010');
  let fetchIndex = 0;
  const channel = {
    id: '100000000000000002',
    guildId: '100000000000000003',
    fetchWebhooks: vi.fn(async () => {
      const entries = fetches[Math.min(fetchIndex, fetches.length - 1)] ?? [];
      fetchIndex += 1;
      return new Collection(entries.map((entry) => [entry.id, entry]));
    }),
    createWebhook: vi.fn(async () => created),
  } as unknown as TextChannel;
  return { channel, created };
}

function input(channel: TextChannel) {
  return {
    channel,
    botId,
    requestId: crypto.randomUUID(),
    assertAllowed: vi.fn(),
  };
}

function memberNamed(displayName: string, username = 'discord-user'): GuildMember {
  return {
    displayName,
    user: { username },
    displayAvatarURL: vi.fn(() => 'https://cdn.discordapp.com/avatar.png'),
  } as unknown as GuildMember;
}

function messageFixture(webhookSend: () => Promise<Message<true>>) {
  const userId = '100000000000000004';
  const guildId = '100000000000000005';
  const roomKey = `c_${'a'.repeat(43)}`;
  const actor = { ...memberNamed('ZERO'), id: userId, pending: false } as GuildMember;
  const bot = { id: botId } as GuildMember;
  const fallbackSend = vi.fn(async () => ({}) as Message<true>);
  const channel = {
    id: '100000000000000006',
    guildId,
    type: ChannelType.GuildText,
    permissionsFor: vi.fn(() => ({ has: () => true })),
    send: fallbackSend,
  } as unknown as TextChannel;
  const guild = {
    channels: { cache: new Collection([[channel.id, channel]]) },
    members: { cache: new Collection([[userId, actor]]), me: bot },
  };
  const client = {
    guilds: { cache: new Collection([[guildId, guild]]) },
  } as unknown as Client;
  const relay = {
    resolve: vi.fn(async () => ({ send: vi.fn(webhookSend) })),
  } as unknown as ManagedWebhookRelay;
  const commands = new MessageCommands(client, { for: async () => roomKey }, relay);
  const command: Extract<LiveCommand, { type: 'message-send' }> = {
    type: 'message-send',
    requestId: crypto.randomUUID(),
    guildId,
    userId,
    expiresAt: Date.now() + 5_000,
    input: { roomKey, content: 'hello' },
  };
  return { command, commands, fallbackSend };
}

it('coalesces concurrent cache misses into one managed relay creation', async () => {
  const relay = new ManagedWebhookRelay();
  const { channel, created } = channelFixture();
  const resolveInput = input(channel);

  const resolved = await Promise.all([relay.resolve(resolveInput), relay.resolve(resolveInput)]);

  expect(resolved).toHaveLength(2);
  expect(resolved).toEqual([created, created]);
  expect(channel.fetchWebhooks).toHaveBeenCalledTimes(1);
  expect(channel.createWebhook).toHaveBeenCalledTimes(1);
  expect(channel.createWebhook).toHaveBeenCalledWith({
    name: 'Dmap Relay',
    reason: 'Dmap managed message relay',
  });
});

it('does not reuse a foreign webhook with the managed name', async () => {
  const relay = new ManagedWebhookRelay();
  const foreign = webhook('100000000000000011', '100000000000000099');
  const { channel, created } = channelFixture([[foreign]]);

  expect(await relay.resolve(input(channel))).toBe(created);
  expect(channel.createWebhook).toHaveBeenCalledTimes(1);
});

it('discovers again after an ambiguous create before attempting another create', async () => {
  const relay = new ManagedWebhookRelay();
  const discovered = webhook('100000000000000012');
  const { channel } = channelFixture([[], [discovered]]);
  vi.mocked(channel.createWebhook).mockImplementationOnce(async () => {
    const context = dispatchContext.getStore();
    if (context !== undefined) context.dispatched = true;
    throw new Error('connection closed after dispatch');
  });

  expect(await relay.resolve(input(channel))).toBeNull();
  expect(await relay.resolve(input(channel))).toBe(discovered);
  expect(channel.fetchWebhooks).toHaveBeenCalledTimes(2);
  expect(channel.createWebhook).toHaveBeenCalledTimes(1);
});

it('normalizes authoritative persona and fallback text without line or Markdown injection', () => {
  const member = memberNamed('**ZERO**\n@everyone');

  expect(safePersona(member)).toEqual({
    username: '**ZERO** @everyone',
    avatarURL: 'https://cdn.discordapp.com/avatar.png',
  });
  expect(attributedContent(member, 'hello')).toBe('**\\*\\*ZERO\\*\\* @everyone says:**\nhello');
});

it('uses the Discord username and neutral label when names normalize to empty text', () => {
  expect(safePersona(memberNamed('\u0000\n', ' fallback\tuser ')).username).toBe('fallback user');
  expect(safePersona(memberNamed('\u0000', '\u0007')).username).toBe('Discord member');
});

it('does not split a Markdown escape when bounding fallback attribution', () => {
  expect(attributedContent(memberNamed(`${'A'.repeat(79)}*`), 'hello')).toBe(
    `**${'A'.repeat(79)} says:**\nhello`,
  );
});

it('does not route around a pre-dispatch webhook rate limit with the bot fallback', async () => {
  const rateLimit = Object.assign(new Error('limited'), {
    name: 'RateLimitError',
    retryAfter: 1_000,
  });
  const { command, commands, fallbackSend } = messageFixture(async () => Promise.reject(rateLimit));

  expect(await commands.execute(command, () => true)).toMatchObject({
    type: 'live-error',
    error: { code: 'MESSAGE_RATE_LIMITED', status: 429 },
  });
  expect(fallbackSend).not.toHaveBeenCalled();
});

it('keeps a post-acceptance normalization failure uncertain without fallback', async () => {
  const { command, commands, fallbackSend } = messageFixture(async () => {
    const context = dispatchContext.getStore();
    if (context !== undefined) {
      context.dispatched = true;
      context.responseStatus = 200;
    }
    return { id: '100000000000000007' } as Message<true>;
  });

  expect(await commands.execute(command, () => true)).toMatchObject({
    type: 'message-send-result',
    status: 'uncertain',
    code: 'MESSAGE_ACTION_UNCERTAIN',
  });
  expect(fallbackSend).not.toHaveBeenCalled();
});
