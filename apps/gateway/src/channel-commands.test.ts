import { REST } from 'discord.js';
import { afterEach, expect, it, vi } from 'vitest';

import type { LiveCommand, LiveRead } from '../../../src/domain/discord/live-protocol';
import { ChannelCommands } from './channel-commands';
import { InteractiveRest, interactiveRestOptions } from './interactive-rest';
import type { DiscordLiveState } from './live-state';
import { LiveStateError } from './member-state';

const guildId = '100000000000000001';
const userId = '100000000000000002';
const botId = '100000000000000003';
const key = `c_${'a'.repeat(43)}`;
const command = (): Extract<LiveCommand, { type: 'channel-mutate' }> => ({
  type: 'channel-mutate',
  requestId: crypto.randomUUID(),
  guildId,
  userId,
  expiresAt: Date.now() + 8_000,
  input: { kind: 'create', data: { name: 'test', type: 'text', parentKey: null } },
});

function fixture() {
  const rest = new REST(interactiveRestOptions).setToken('test.bot.token.never.real.0001');
  const interactive = new InteractiveRest(rest);
  const read: LiveRead = {
    guildId,
    cursor: { streamId: crypto.randomUUID(), sequence: 1 },
    source: {
      bot: { id: botId },
      botMember: { roleIds: [] },
      channels: [],
      guild: {
        id: guildId,
        name: 'Guild',
        ownerId: userId,
        roles: [{ id: guildId, permissions: '1040' }],
      },
    },
    member: {
      kind: 'present',
      member: { userId, roleIds: [], pending: false, communicationDisabledUntil: null },
    },
  };
  const state = {
    current: vi.fn(() => read),
    freshMember: vi.fn(async (_guild: string, _user: string, signal: AbortSignal) => {
      read.member = await interactive.member(guildId, userId, signal);
      return read.member;
    }),
    captureMutation: vi.fn(() => ({ cursor: read.cursor, generation: 1, target: null })),
    reconcile: vi.fn(async () => {}),
    invalidateMutation: vi.fn(),
  };
  return {
    rest,
    read,
    state,
    commands: new ChannelCommands(state as unknown as DiscordLiveState, interactive, {
      for: async () => key,
    }),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const member = () => json({ user: { id: userId }, roles: [], pending: false });
afterEach(() => vi.unstubAllGlobals());

it('carries the final policy guard through the actual REST queue and prevents a revoked write', async () => {
  const { rest, state, read, commands } = fixture();
  const started = deferred();
  const release = deferred();
  const fetchedMember = deferred();
  const writes: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { method?: string }) => {
      if (init.method === 'POST') {
        writes.push('POST');
        started.resolve();
        await release.promise;
        return json({});
      }
      fetchedMember.resolve();
      return member();
    }),
  );
  // Occupy the same library route independently of ChannelCommands' guild lane.
  const occupying = rest.post(`/guilds/${guildId}/channels`, {
    body: { name: 'occupant', type: 0 },
  });
  await started.promise;
  const result = commands.execute(command());
  await fetchedMember.promise;
  await vi.waitFor(() => expect(state.freshMember).toHaveResolved());
  // A timer turn lets mutate enter the actual REST queue behind occupying.
  await new Promise<void>((resolve) => setImmediate(resolve));
  read.member = {
    kind: 'present',
    member: { userId, roleIds: [], pending: true, communicationDisabledUntil: null },
  };
  release.resolve();
  await occupying;
  expect(await result).toMatchObject({
    result: { status: 'rejected', code: 'CHANNEL_MEMBER_FORBIDDEN' },
  });
  expect(writes).toEqual(['POST']); // Only the deliberate queue occupant; zero command writes.
  rest.clearHashSweeper();
  rest.clearHandlerSweeper();
});

it('dispatches a 500 once and returns uncertain without replay', async () => {
  const { commands, rest } = fixture();
  const writes: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { method?: string }) => {
      if (init.method === 'GET') return member();
      writes.push(init.method!);
      return json({}, 500);
    }),
  );
  const input = command();
  const result = await commands.execute(input);
  expect(result).toMatchObject({ result: { status: 'uncertain' } });
  expect(await commands.execute(input)).toEqual(result);
  expect(writes).toEqual(['POST']);
  rest.clearHashSweeper();
  rest.clearHandlerSweeper();
});

it('keeps confirmed 2xx applied when the following state read fails', async () => {
  const { commands, rest, state } = fixture();
  const writes: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { method?: string }) => {
      if (init.method === 'GET') return member();
      writes.push(init.method!);
      return json(
        { id: '100000000000000004', name: 'test', type: 0, permission_overwrites: [] },
        201,
      );
    }),
  );
  state.reconcile.mockImplementation(async () => {
    state.current.mockImplementation(() => {
      throw new LiveStateError();
    });
  });
  expect(await commands.execute(command())).toMatchObject({
    result: { status: 'applied', view: null },
    read: null,
  });
  expect(writes).toEqual(['POST']);
  rest.clearHashSweeper();
  rest.clearHandlerSweeper();
});
