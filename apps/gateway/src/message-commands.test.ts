import { ChannelType, PermissionFlagsBits, type Message } from 'discord.js';
import { expect, it } from 'vitest';
import { createIdentifierFactory } from '../../../src/domain/discord/identifiers';
import { BYPASS_SLOWMODE } from '../../../src/domain/discord/constants';
import {
  liveHelloSchema,
  serverBridgeMessageSchema,
} from '../../../src/domain/discord/live-protocol';
import { parseDiscordChannels } from '../../../src/domain/discord/source-schema';
import { toMessageSlowmodeObservation, toRoomMessage } from './message-commands';

it('advertises the member persona contract and uses the actual Discord permission bit', () => {
  expect(BYPASS_SLOWMODE).toBe(PermissionFlagsBits.BypassSlowmode);
  expect(
    liveHelloSchema.safeParse({
      type: 'hello',
      protocolVersion: 2,
      serviceSessionId: crypto.randomUUID(),
      guildKeys: [],
      capabilities: ['live-world-v1', 'message-v1', 'message-persona-v1'],
    }).success,
  ).toBe(true);
});

it('parses bounded API channel slowmode and defaults absent fields for compatibility', () => {
  const channel = { id: '100000000000000001', type: 0, name: 'chat', position: 0 };
  expect(parseDiscordChannels([{ ...channel, rate_limit_per_user: 12 }])[0]).toMatchObject({
    rateLimitPerUser: 12,
  });
  expect(parseDiscordChannels([channel])[0]).toMatchObject({ rateLimitPerUser: 0 });
  expect(() => parseDiscordChannels([{ ...channel, rate_limit_per_user: 21_601 }])).toThrow();
});

it('forwards native slowmode with an opaque actor and keeps the browser message free of identifiers', async () => {
  const identifiers = await createIdentifierFactory(new Uint8Array(32).fill(2));
  const userId = '100000000000000002';
  const message = {
    id: '100000000000000003',
    author: { id: userId, bot: false, username: 'member' },
    webhookId: null,
    channel: { type: ChannelType.GuildText, rateLimitPerUser: 2 },
    createdTimestamp: 10_000,
    createdAt: new Date(10_000),
    content: 'hello',
    attachments: { size: 0 },
    embeds: [],
  } as unknown as Message<true>;
  const room = await toRoomMessage(message, `c_${'b'.repeat(43)}`, identifiers);
  const slowmode = await toMessageSlowmodeObservation(message, identifiers);
  const event = serverBridgeMessageSchema.parse({
    type: 'guild-message',
    guildKey: `g_${'a'.repeat(43)}`,
    serviceSessionId: crypto.randomUUID(),
    message: room,
    slowmode,
  });
  expect(slowmode).toMatchObject({
    actorKey: expect.stringMatching(/^m_[A-Za-z0-9_-]{43}$/u),
    nextAllowedAt: 12_000,
  });
  expect(JSON.stringify(event)).not.toContain(userId);
  expect(JSON.stringify(room)).not.toContain(slowmode!.actorKey);
  expect(
    await toMessageSlowmodeObservation(
      { ...message, author: { ...message.author, bot: true } } as Message<true>,
      identifiers,
    ),
  ).toBeUndefined();
  expect(
    await toMessageSlowmodeObservation(
      { ...message, webhookId: '100000000000000004' } as Message<true>,
      identifiers,
    ),
  ).toBeUndefined();
});
