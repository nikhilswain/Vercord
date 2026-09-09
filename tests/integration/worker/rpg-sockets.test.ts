import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createD1AuthRepository } from '../../../worker/auth/repository';
import { createD1WorldRepository } from '../../../worker/worlds/repository';
import { WorldInstanceStore } from '../../../worker/worlds/instance-store';
import { ContinuousTownStore } from '../../../worker/worlds/continuous-town-store';
import { sendLiveCommand } from '../../../worker/live-world/bridge-client';
import type { WorldView } from '../../../src/domain/channels/protocol';
import {
  serverPresenceMessageSchema,
  type ServerPresenceMessage,
} from '../../../src/domain/presence/protocol';
import type { RpgPartition } from '../../../worker/presence/rpg-state';
import { createValidatedDiscordSourceFixture, TEST_IDS } from '../../fixtures/discord/guild-source';
import authMigration from '../../../migrations/0001_auth.sql?raw';
import migration from '../../../migrations/0003_world_instances.sql?raw';
import townMigration from '../../../migrations/0004_world_neighborhoods.sql?raw';
import continuousMigration from '../../../migrations/0005_continuous_towns.sql?raw';
import compressedMigration from '../../../migrations/0006_compressed_town_documents.sql?raw';

vi.mock('../../../worker/live-world/bridge-client', () => ({ sendLiveCommand: vi.fn() }));
vi.mock('../../../worker/voice/bridge-client', () => ({
  sendDiscordGatewayCommand: vi.fn(async () => ({ service: 'offline' })),
}));
const streamId = 'e5c87579-ec50-4325-a4af-7c5927cd94cf';
const actor = {
  guildId: TEST_IDS.guild,
  userId: '300000000000000003',
  sessionHash: 'a'.repeat(43),
};
const other = { ...actor, userId: '300000000000000004', sessionHash: 'b'.repeat(43) };
let source = createValidatedDiscordSourceFixture();
const sockets: WebSocket[] = [];

function connectRequest(member = actor, partition?: RpgPartition, upgrade = true): Request {
  const url = new URL('https://presence.dmap/connect');
  if (partition)
    for (const [key, value] of Object.entries(partition)) url.searchParams.set(key, value);
  return new Request(url, {
    headers: {
      ...(upgrade ? { upgrade: 'websocket' } : {}),
      'x-dmap-guild-id': member.guildId,
      'x-dmap-user-id': member.userId,
      'x-dmap-session-hash': member.sessionHash,
      'x-dmap-session-expires-at': '2000000000',
      'x-dmap-presence-id': `p_${(member.userId === actor.userId ? 'a' : 'b').repeat(43)}`,
      'x-dmap-avatar-id': 'avatar-01',
      'x-dmap-display-name': 'Traveler',
    },
  });
}

beforeEach(async () => {
  source = createValidatedDiscordSourceFixture();
  await env.AUTH_DB.exec(
    'CREATE TABLE IF NOT EXISTS worlds (guild_id TEXT PRIMARY KEY,map_slug TEXT UNIQUE,visibility TEXT,created_at INTEGER,updated_at INTEGER,last_synced_at INTEGER)',
  );
  for (const sql of (
    authMigration +
    '\n' +
    migration +
    '\n' +
    townMigration +
    '\n' +
    continuousMigration
  )
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean))
    await env.AUTH_DB.prepare(sql).run();
  const columns = await env.AUTH_DB.prepare('PRAGMA table_info(world_towns)').all<{
    name: string;
  }>();
  if (!columns.results.some((column) => column.name === 'document_gzip'))
    await env.AUTH_DB.prepare(compressedMigration).run();
  await env.AUTH_DB.exec('DELETE FROM sessions');
  await createD1WorldRepository(env.AUTH_DB).recordSync(actor.guildId, 'rpg-socket-test', 0);
  for (const member of [actor, other])
    await createD1AuthRepository(env.AUTH_DB).createSession({
      idHash: member.sessionHash,
      userId: member.userId,
      username: 'traveler',
      displayName: 'Traveler',
      avatarHash: null,
      accessTokenCiphertext: 'invented',
      accessTokenIv: 'invented',
      refreshTokenCiphertext: null,
      refreshTokenIv: null,
      tokenType: 'Bearer',
      scope: 'identify',
      tokenExpiresAt: 2_000_000_000,
      sessionExpiresAt: 2_000_000_000,
      createdAt: 0,
      lastSeenAt: 0,
    });
  vi.mocked(sendLiveCommand).mockReset();
  vi.mocked(sendLiveCommand).mockImplementation(async (_env, command) =>
    command.type === 'world-read'
      ? {
          type: 'world-result',
          requestId: crypto.randomUUID(),
          result: {
            guildId: actor.guildId,
            cursor: { streamId, sequence: 1 },
            source: structuredClone(source),
            member: {
              kind: 'present',
              member: {
                userId: command.userId,
                roleIds: [TEST_IDS.botRole],
                pending: false,
                communicationDisabledUntil: null,
              },
            },
          },
        }
      : { type: 'release-result', requestId: crypto.randomUUID() },
  );
});
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
  vi.restoreAllMocks();
});

async function setup() {
  const stub = env.WORLD_PRESENCE.getByName(crypto.randomUUID());
  const response = await runInDurableObject(stub, (instance) =>
    instance.fetch(connectRequest(actor, undefined, false)),
  );
  expect(response.status).toBe(200);
  const { view } = await response.json<{ view: WorldView }>();
  const saved = await new WorldInstanceStore(env.AUTH_DB).load(actor.guildId, 'village');
  const town = (await new ContinuousTownStore(env.AUTH_DB).prepare(saved, view.snapshot)).project(
    view.snapshot,
  );
  const partition: RpgPartition = {
    theme: 'village',
    worldId: town.document.worldId,
    checksum: town.checksum,
    scene: 'overworld',
  };
  return { stub, partition, town };
}
async function open(
  stub: DurableObjectStub<import('../../../worker/presence/guild-presence').GuildPresence>,
  member = actor,
  partition?: RpgPartition,
) {
  const response = await stub.fetch(connectRequest(member, partition));
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  sockets.push(socket);
  const messages: ServerPresenceMessage[] = [];
  let ready!: () => void;
  const welcome = new Promise<void>((resolve) => {
    ready = resolve;
  });
  socket.addEventListener('message', (event) => {
    const message = serverPresenceMessageSchema.parse(JSON.parse(String(event.data)));
    messages.push(message);
    if (message.type === 'welcome') ready();
  });
  socket.accept();
  await welcome;
  return { socket, messages };
}
async function receive(socket: WebSocket, type: ServerPresenceMessage['type'], send: () => void) {
  const result = new Promise<ServerPresenceMessage>((resolve) => {
    const handler = (event: MessageEvent) => {
      const message = serverPresenceMessageSchema.parse(JSON.parse(String(event.data)));
      if (message.type === type) {
        socket.removeEventListener('message', handler);
        resolve(message);
      }
    };
    socket.addEventListener('message', handler);
  });
  send();
  return result;
}

it('admits the saved town and rejects mismatched geometry before socket acceptance', async () => {
  const { stub, partition, town } = await setup();
  const stale = await runInDurableObject(stub, (instance) =>
    instance.fetch(connectRequest(actor, { ...partition, checksum: '0'.repeat(64) })),
  );
  expect(stale.status).toBe(409);
  const connected = await open(stub, actor, partition);
  expect(connected.messages[0]).toMatchObject({
    type: 'welcome',
    players: [],
    rpg: {
      ...{ worldId: partition.worldId, checksum: partition.checksum, scene: partition.scene },
      self: { ...town.document.scenes.overworld.spawn, appearance: 'rowan' },
      players: [],
    },
  });
});

it('keeps legacy and dungeon peers out of the overworld roster and removes revoked members', async () => {
  const { stub, partition } = await setup();
  const first = await open(stub, actor, partition);
  const peer = await open(stub, other, partition);
  expect(peer.messages.find((message) => message.type === 'welcome')).toMatchObject({
    rpg: { players: [{ id: `p_${'a'.repeat(43)}` }] },
  });
  const dungeon = await open(stub, actor, { ...partition, scene: 'dungeon' });
  expect(dungeon.messages.find((message) => message.type === 'welcome')).toMatchObject({
    rpg: { players: [] },
  });
  const legacy = await open(stub, other);
  expect(legacy.messages.find((message) => message.type === 'welcome')).toMatchObject({
    players: [],
  });
  await createD1AuthRepository(env.AUTH_DB).deleteSession(actor.sessionHash);
  const refreshed = await open(stub, other, partition);
  expect(refreshed.messages.find((message) => message.type === 'welcome')).toMatchObject({
    rpg: { players: [] },
  });
  expect(first.socket.readyState).not.toBe(WebSocket.OPEN);
});

it('acknowledges appearance, corrects unsafe movement, and restores progress after disconnect', async () => {
  const { stub, partition, town } = await setup();
  const first = await open(stub, actor, partition);
  const peer = await open(stub, other, partition);
  const legacy = await open(stub, actor);
  const dungeon = await open(stub, actor, { ...partition, scene: 'dungeon' });
  const ack = await receive(first.socket, 'rpg-position', () =>
    first.socket.send(JSON.stringify({ type: 'rpg-appearance', appearance: 'ash' })),
  );
  expect(ack).toMatchObject({ player: { appearance: 'ash' } });
  await runInDurableObject(stub, async (instance, state) => {
    const server = state.getWebSockets().find((socket) => {
      const attachment = socket.deserializeAttachment() as { userId: string; rpg?: RpgPartition };
      return attachment.userId === actor.userId && attachment.rpg?.scene === 'overworld';
    })!;
    const previous = server.deserializeAttachment() as { lastMessageAt: number };
    vi.spyOn(Date, 'now').mockReturnValue(previous.lastMessageAt + 100);
    await instance.webSocketMessage(
      server,
      JSON.stringify({
        type: 'rpg-move',
        seq: 1,
        x: 0,
        y: 0,
        scene: 'overworld',
        direction: 'down',
        action: 'walk',
      }),
    );
    vi.restoreAllMocks();
  });
  await vi.waitFor(() =>
    expect(first.messages.filter((message) => message.type === 'rpg-position')).toHaveLength(2),
  );
  expect(first.messages.filter((message) => message.type === 'rpg-position').at(-1)).toMatchObject({
    player: { ...town.document.scenes.overworld.spawn, appearance: 'ash' },
  });
  expect(
    peer.messages.some(
      (message) => message.type === 'rpg-player' && message.player.appearance === 'ash',
    ),
  ).toBe(true);
  expect(legacy.messages.some((message) => message.type.startsWith('rpg-'))).toBe(false);
  expect(
    dungeon.messages.some(
      (message) => message.type === 'rpg-player' && message.player.scene === 'overworld',
    ),
  ).toBe(false);
  first.socket.close();
  const reloaded = await open(stub, actor, partition);
  expect(reloaded.messages.find((message) => message.type === 'welcome')).toMatchObject({
    rpg: { self: { ...town.document.scenes.overworld.spawn, appearance: 'ash' } },
  });
});

it('rejects sessions revoked while asynchronous map admission is loading', async () => {
  const { stub, partition } = await setup();
  const original = ContinuousTownStore.prototype.prepare;
  vi.spyOn(ContinuousTownStore.prototype, 'prepare').mockImplementationOnce(async function (
    this: ContinuousTownStore,
    ...args
  ) {
    const prepared = await original.apply(this, args);
    await createD1AuthRepository(env.AUTH_DB).deleteSession(actor.sessionHash);
    return prepared;
  });
  const response = await stub.fetch(connectRequest(actor, partition));
  expect(response.status).toBe(401);
  expect(response.webSocket).toBeNull();
});

it('removes a member from RPG peers immediately when live membership is revoked', async () => {
  const { stub, partition } = await setup();
  const first = await open(stub, actor, partition);
  const peer = await open(stub, other, partition);
  const response = await stub.fetch(
    new Request('https://presence.dmap/internal/live-frame', {
      method: 'POST',
      body: JSON.stringify({
        bridgeEpoch: 0,
        message: {
          type: 'world-member',
          serviceSessionId: streamId,
          guildKey: `g_${'a'.repeat(43)}`,
          cursor: { streamId, sequence: 2 },
          member: { kind: 'absent', userId: actor.userId },
        },
      }),
    }),
  );
  expect(response.status).toBe(204);
  await vi.waitFor(() =>
    expect(peer.messages).toContainEqual({ type: 'rpg-leave', id: `p_${'a'.repeat(43)}` }),
  );
  expect(first.socket.readyState).not.toBe(WebSocket.OPEN);
  const denied = await stub.fetch(connectRequest(actor, partition));
  expect(denied.status).toBe(403);
});

it('publishes the final idle transition even immediately after a movement frame', async () => {
  const { stub, partition, town } = await setup();
  await open(stub, actor, partition);
  const peer = await open(stub, other, partition);
  await runInDurableObject(stub, async (instance, state) => {
    const socket = state
      .getWebSockets()
      .find(
        (candidate) =>
          (candidate.deserializeAttachment() as { userId: string }).userId === actor.userId,
      )!;
    const previous = socket.deserializeAttachment() as { lastMessageAt: number };
    vi.spyOn(Date, 'now').mockReturnValue(previous.lastMessageAt + 100);
    const move = {
      type: 'rpg-move',
      seq: 1,
      ...town.document.scenes.overworld.spawn,
      y: town.document.scenes.overworld.spawn.y + 8,
      direction: 'down',
      action: 'run',
      scene: 'overworld',
    };
    await instance.webSocketMessage(socket, JSON.stringify(move));
    vi.spyOn(Date, 'now').mockReturnValue(previous.lastMessageAt + 101);
    await instance.webSocketMessage(socket, JSON.stringify({ ...move, seq: 2, action: 'idle' }));
    expect(socket.deserializeAttachment()).toMatchObject({
      seq: 2,
      rpg: { action: 'idle', y: move.y },
    });
    vi.restoreAllMocks();
  });
  await vi.waitFor(() =>
    expect(peer.messages.filter((message) => message.type === 'rpg-player').at(-1)).toMatchObject({
      player: { action: 'idle' },
    }),
  );
});
