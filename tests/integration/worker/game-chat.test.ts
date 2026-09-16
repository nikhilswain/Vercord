import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  chatEventSchema,
  CHAT_RETENTION_MS,
  type ChatEvent,
  type ChatCommand,
  type ChatPerson,
} from '../../../src/domain/chat/protocol';
import { createD1AuthRepository } from '../../../worker/auth/repository';
import { hashOpaqueToken } from '../../../worker/auth/crypto';
import { readAuthorizedWorld } from '../../../worker/live-world/service';
import { handleGameChat } from '../../../worker/http/game-chat';
import { WorldAccessError } from '../../../worker/live-world/coordinator';
import authMigration from '../../../migrations/0001_auth.sql?raw';

vi.mock('../../../worker/live-world/service', () => ({
  readAuthorizedWorld: vi.fn(async () => ({})),
}));
const people = ['a', 'b', 'c', 'd', 'e'].map((letter, index) => ({
  person: {
    id: `p_${letter.repeat(43)}`,
    name: ['Rowan', 'Ash', 'Tamsin', 'Mira', 'Kael'][index]!,
  },
  userId: `${300000000000000001n + BigInt(index)}`,
  sessionHash: letter.repeat(43),
}));
const sockets: WebSocket[] = [];
const guildId = '100000000000000001';
type Stub = DurableObjectStub<import('../../../worker/chat/game-chat').GameChat>;
function request(index: number, guild = guildId) {
  const member = people[index]!;
  return new Request('https://chat.dmap/connect', {
    headers: {
      upgrade: 'websocket',
      'x-chat-guild': guild,
      'x-chat-user': member.userId,
      'x-chat-session': member.sessionHash,
      'x-chat-expires': '2000000000',
      'x-chat-person': JSON.stringify(member.person),
    },
  });
}
beforeEach(async () => {
  for (const sql of authMigration
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await env.AUTH_DB.prepare(sql).run();
  await env.AUTH_DB.exec('DELETE FROM sessions');
  for (const p of people)
    await createD1AuthRepository(env.AUTH_DB).createSession({
      idHash: p.sessionHash,
      userId: p.userId,
      username: p.person.name,
      displayName: p.person.name,
      avatarHash: null,
      accessTokenCiphertext: 'test',
      accessTokenIv: 'test',
      refreshTokenCiphertext: null,
      refreshTokenIv: null,
      tokenType: 'Bearer',
      scope: 'identify',
      tokenExpiresAt: 2_000_000_000,
      sessionExpiresAt: 2_000_000_000,
      createdAt: 0,
      lastSeenAt: 0,
    });
  vi.mocked(readAuthorizedWorld)
    .mockReset()
    .mockResolvedValue({} as Awaited<ReturnType<typeof readAuthorizedWorld>>);
});
afterEach(() => {
  sockets.splice(0).forEach((socket) => socket.close());
});
async function open(stub: Stub, index: number) {
  const response = await stub.fetch(request(index));
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  sockets.push(socket);
  const events: ChatEvent[] = [];
  socket.addEventListener('message', (event) => {
    events.push(chatEventSchema.parse(JSON.parse(event.data as string)));
  });
  socket.accept();
  const wait = async (type: ChatEvent['type'], requestId?: string) => {
    await vi.waitFor(() =>
      expect(
        events.some(
          (event) =>
            event.type === type &&
            (!requestId || ('requestId' in event && event.requestId === requestId)),
        ),
      ).toBe(true),
    );
    return events.find(
      (event) =>
        event.type === type &&
        (!requestId || ('requestId' in event && event.requestId === requestId)),
    )!;
  };
  await wait('welcome');
  return {
    socket,
    events,
    wait,
    send: (command: ChatCommand) => socket.send(JSON.stringify(command)),
  };
}
const command = (
  roomId = 'global',
  body = 'Hello from the forest',
): Extract<ChatCommand, { type: 'send' }> => ({
  type: 'send',
  requestId: crypto.randomUUID(),
  roomId,
  body,
});

it('delivers global messages through the native socket, acknowledges once and recovers persisted history', async () => {
  const stub = env.GAME_CHAT.getByName(crypto.randomUUID());
  const a = await open(stub, 0),
    b = await open(stub, 1);
  const isolated = await open(env.GAME_CHAT.getByName(crypto.randomUUID()), 2);
  const send = command();
  a.send(send);
  await a.wait('ack', send.requestId);
  await b.wait('message');
  a.send(send);
  await vi.waitFor(() => expect(a.events.filter((e) => e.type === 'ack')).toHaveLength(2));
  expect(b.events.filter((e) => e.type === 'message')).toHaveLength(1);
  expect(isolated.events.filter((e) => e.type === 'message')).toHaveLength(0);
  const replay = await open(stub, 0),
    requestId = crypto.randomUUID();
  replay.send({ type: 'history', requestId, roomId: 'global' });
  const history = await replay.wait('history', requestId);
  expect(history.type === 'history' && history.messages.map((m) => m.body)).toEqual([send.body]);
  // Normal message delivery has no Discord read/send request.
  expect(readAuthorizedWorld).toHaveBeenCalledTimes(4);
});

it('keeps direct and party messages and history away from a third player', async () => {
  const stub = env.GAME_CHAT.getByName(crypto.randomUUID());
  const a = await open(stub, 0),
    b = await open(stub, 1),
    c = await open(stub, 2);
  const requestId = crypto.randomUUID();
  a.send({ type: 'direct', requestId, peerId: people[1]!.person.id });
  const direct = await a.wait('history', requestId);
  if (direct.type !== 'history') throw new Error('history');
  const partyId = `party:${crypto.randomUUID()}`;
  await runInDurableObject(stub, (instance) =>
    instance.store.setParty(
      partyId,
      'Trail party',
      people.slice(0, 2).map((p) => p.person),
    ),
  );
  for (const roomId of [direct.room.id, partyId]) {
    const send = command(roomId, `Private ${roomId}`);
    a.send(send);
    await a.wait('ack', send.requestId);
    await vi.waitFor(() =>
      expect(
        b.events.some((e) => e.type === 'message' && e.message.requestId === send.requestId),
      ).toBe(true),
    );
    const readId = crypto.randomUUID();
    c.send({ type: 'history', requestId: readId, roomId });
    expect(await c.wait('error', readId)).toMatchObject({ code: 'NOT_ALLOWED' });
    const forged = command(roomId, 'Intrusion');
    c.send(forged);
    expect(await c.wait('error', forged.requestId)).toMatchObject({ code: 'NOT_ALLOWED' });
  }
  expect(c.events.filter((e) => e.type === 'message')).toHaveLength(0);
  await runInDurableObject(stub, (instance) =>
    instance.store.setParty(partyId, 'Trail party', [people[0]!.person]),
  );
  const removed = command(partyId);
  b.send(removed);
  expect(await b.wait('error', removed.requestId)).toMatchObject({ code: 'NOT_ALLOWED' });
  b.send({ type: 'ping' });
  await vi.waitFor(() =>
    expect(
      b.events.some((e) => e.type === 'rooms' && !e.rooms.some((room) => room.id === partyId)),
    ).toBe(true),
  );
});

it('rejects cross-guild admission, revoked sessions and changed guild access', async () => {
  const stub = env.GAME_CHAT.getByName(crypto.randomUUID());
  const a = await open(stub, 0);
  expect((await stub.fetch(request(1, '100000000000000002'))).status).toBe(403);
  await createD1AuthRepository(env.AUTH_DB).deleteSession(people[0]!.sessionHash);
  await runInDurableObject(stub, (_instance, ctx) => {
    for (const socket of ctx.getWebSockets())
      socket.serializeAttachment({ ...socket.deserializeAttachment(), authorizedUntil: 0 });
  });
  a.send(command());
  await vi.waitFor(() =>
    expect(a.events.some((e) => e.type === 'error' && e.code === 'SESSION_EXPIRED')).toBe(true),
  );
  vi.mocked(readAuthorizedWorld).mockRejectedValue(new WorldAccessError('WORLD_FORBIDDEN', 403));
  expect((await stub.fetch(request(1))).status).toBe(403);
});

it('rejects request-id reuse with different content and rate limits messages across tabs', async () => {
  const stub = env.GAME_CHAT.getByName(crypto.randomUUID());
  const a = await open(stub, 0),
    same = await open(stub, 0);
  const first = command();
  a.send(first);
  await a.wait('ack', first.requestId);
  same.send({ ...first, body: 'Different message' });
  expect(await same.wait('error', first.requestId)).toMatchObject({ code: 'CONFLICT' });
  for (let i = 0; i < 21; i++) (i % 2 ? a : same).send(command());
  await vi.waitFor(() =>
    expect(
      [...a.events, ...same.events].some((e) => e.type === 'error' && e.code === 'RATE_LIMITED'),
    ).toBe(true),
  );
});

it('bounds history, uses cursor pagination and expires old messages', async () => {
  const stub = env.GAME_CHAT.getByName(crypto.randomUUID());
  await runInDurableObject(stub, (instance) => {
    const person: ChatPerson = people[0]!.person;
    for (let i = 0; i < 505; i++)
      instance.store.append(person, 'global', crypto.randomUUID(), `Message ${i}`);
    const recent = instance.store.history('global');
    expect(recent.messages).toHaveLength(50);
    expect(recent.hasMore).toBe(true);
    expect(recent.messages.at(-1)?.body).toBe('Message 504');
    const earlier = instance.store.history('global', recent.messages[0]!.sequence);
    expect(earlier.messages.at(-1)?.sequence).toBeLessThan(recent.messages[0]!.sequence);
    instance.store.prune(Date.now() + CHAT_RETENTION_MS + 1);
    expect(instance.store.history('global').messages).toHaveLength(0);
  });
});

it('does not accept browser identity headers or cross-origin websocket requests', async () => {
  const url = `https://dmap.test/api/auth/guilds/${guildId}/game-chat`;
  expect(
    (
      await handleGameChat(
        new Request(url, { headers: { origin: 'https://elsewhere.test', upgrade: 'websocket' } }),
        env,
        guildId,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await handleGameChat(
        new Request(url, {
          headers: {
            origin: 'https://dmap.test',
            upgrade: 'websocket',
            'x-chat-user': people[0]!.userId,
          },
        }),
        env,
        guildId,
      )
    ).status,
  ).toBe(401);
});

it('derives identity from the login cookie and transports Unicode names safely', async () => {
  const cookie = 't'.repeat(43),
    hash = await hashOpaqueToken(cookie);
  await env.AUTH_DB.prepare('UPDATE sessions SET id_hash=?,display_name=? WHERE id_hash=?')
    .bind(hash, '旅人 Rowan', people[0]!.sessionHash)
    .run();
  const response = await handleGameChat(
    new Request(`https://dmap.test/api/auth/guilds/${guildId}/game-chat`, {
      headers: {
        origin: 'https://dmap.test',
        upgrade: 'websocket',
        cookie: `__Host-dmap_session=${cookie}`,
        'x-chat-person': JSON.stringify(people[2]!.person),
      },
    }),
    env,
    guildId,
  );
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  sockets.push(socket);
  const welcome = new Promise<ChatEvent>((resolve) =>
    socket.addEventListener('message', (event) => {
      const parsed = chatEventSchema.parse(JSON.parse(event.data as string));
      if (parsed.type === 'welcome') resolve(parsed);
    }),
  );
  socket.accept();
  expect(await welcome).toMatchObject({ type: 'welcome', self: { name: '旅人 Rowan' } });
});

it('projects socket metadata into the real world authority wire contract', async () => {
  vi.mocked(readAuthorizedWorld).mockImplementationOnce(async (_env, actor) => {
    // Exercise the actual GuildPresence parser, not a mock accepting arbitrary metadata.
    const response = await env.WORLD_PRESENCE.getByName(crypto.randomUUID()).fetch(
      'https://presence.dmap/internal/world-view',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actor }),
      },
    );
    expect(response.status).not.toBe(400);
    expect(Object.keys(actor).sort()).toEqual(['guildId', 'sessionHash', 'userId']);
    return {} as Awaited<ReturnType<typeof readAuthorizedWorld>>;
  });
  await open(env.GAME_CHAT.getByName(crypto.randomUUID()), 0);
});

it('keeps invitations private, requires the recipient to accept and revokes chat on leaving', async () => {
  const stub = env.GAME_CHAT.getByName(crypto.randomUUID()),
    a = await open(stub, 0),
    b = await open(stub, 1),
    c = await open(stub, 2);
  const invitationId = crypto.randomUUID();
  a.send({ type: 'party-invite', requestId: invitationId, peerId: people[1]!.person.id });
  await a.wait('social', invitationId);
  await vi.waitFor(() =>
    expect(
      b.events.some((e) => e.type === 'social' && e.invitations.some((i) => i.id === invitationId)),
    ).toBe(true),
  );
  expect(
    c.events
      .filter((e) => e.type === 'social')
      .every((e) => e.type === 'social' && e.invitations.length === 0),
  ).toBe(true);
  const forged = crypto.randomUUID();
  c.send({ type: 'party-answer', requestId: forged, invitationId, accept: true });
  expect(await c.wait('error', forged)).toMatchObject({ code: 'NOT_ALLOWED' });
  const accept = crypto.randomUUID();
  b.send({ type: 'party-answer', requestId: accept, invitationId, accept: true });
  await b.wait('social', accept);
  const party = await runInDurableObject(stub, (instance) =>
    instance.store.party(people[1]!.person.id),
  );
  expect(party?.members).toHaveLength(2);
  const message = command(party!.id, 'A private party message');
  a.send(message);
  await b.wait('message');
  expect(c.events.some((e) => e.type === 'message')).toBe(false);
  // A repeated acceptance does not duplicate members.
  const repeated = crypto.randomUUID();
  b.send({ type: 'party-answer', requestId: repeated, invitationId, accept: true });
  await b.wait('social', repeated);
  expect(
    await runInDurableObject(stub, (i) => i.store.party(people[1]!.person.id)?.members.length),
  ).toBe(2);
  const leave = crypto.randomUUID();
  b.send({ type: 'party-leave', requestId: leave });
  await b.wait('social', leave);
  const historyId = crypto.randomUUID();
  b.send({ type: 'history', roomId: party!.id, requestId: historyId });
  expect(await b.wait('error', historyId)).toMatchObject({ code: 'NOT_ALLOWED' });
  expect(await runInDurableObject(stub, (i) => i.store.party(people[1]!.person.id))).toBeNull();
});

it('bounds parties, rejects expired invites, and resolves competing invitations atomically', async () => {
  const stub = env.GAME_CHAT.getByName(crypto.randomUUID());
  await Promise.all(people.map((_, index) => open(stub, index)));
  await runInDurableObject(stub, (instance, state) => {
    const ids = people.map((p) => p.person.id),
      first = crypto.randomUUID(),
      competing = crypto.randomUUID();
    expect(instance.store.invite(ids[0]!, ids[1]!, first)).toBeNull();
    expect(instance.store.invite(ids[2]!, ids[1]!, competing)).toBeNull();
    expect(instance.store.answer(ids[1]!, first, true)).toBeNull();
    expect(instance.store.answer(ids[1]!, competing, true)).toBe('CONFLICT');
    expect(instance.store.party(ids[2]!)).toBeNull();
    const expired = crypto.randomUUID();
    instance.store.invite(ids[0]!, ids[2]!, expired);
    state.storage.sql.exec(
      'UPDATE party_invitations SET expires=? WHERE id=?',
      Date.now() - 1,
      expired,
    );
    expect(instance.store.answer(ids[2]!, expired, true)).toBe('INVITATION_EXPIRED');
    for (const index of [2, 3]) {
      const invite = crypto.randomUUID();
      expect(instance.store.invite(ids[0]!, ids[index]!, invite)).toBeNull();
      expect(instance.store.answer(ids[index]!, invite, true)).toBeNull();
    }
    expect(instance.store.party(ids[0]!)?.members).toHaveLength(4);
    expect(instance.store.invite(ids[0]!, ids[4]!, crypto.randomUUID())).toBe('PARTY_FULL');
  });
});
