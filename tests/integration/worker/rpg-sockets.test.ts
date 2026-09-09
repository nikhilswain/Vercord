import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createD1AuthRepository } from '../../../worker/auth/repository';
import { createD1WorldRepository } from '../../../worker/worlds/repository';
import { WorldInstanceStore } from '../../../worker/worlds/instance-store';
import { ContinuousTownStore } from '../../../worker/worlds/continuous-town-store';
import { HouseInteriorStore } from '../../../worker/worlds/house-store';
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
      'x-dmap-avatar-url': encodeURIComponent(
        `https://cdn.discordapp.com/avatars/${member.userId}/invented_avatar.png?size=128`,
      ),
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
                roleIds: command.userId === actor.userId ? [TEST_IDS.botRole] : [],
                pending: false,
                communicationDisabledUntil: null,
              },
            },
          },
        }
      : command.type === 'message-read'
        ? {
            type: 'message-history-result',
            requestId: crypto.randomUUID(),
            result: {
              roomKey: command.roomKey,
              messages: [],
              canRead: true,
              canSend: false,
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
      self: {
        ...town.document.scenes.overworld.spawn,
        appearance: 'rowan',
        avatarUrl: `https://cdn.discordapp.com/avatars/${actor.userId}/invented_avatar.png?size=128`,
      },
      players: [],
    },
  });
});

it('lazily opens a persistent house without changing its saved town and isolates its peers', async () => {
  const { stub, partition, town } = await setup();
  const house = town.bindings[0]!.landmarkId;
  const request = () =>
    new Request('https://presence.dmap/internal/rpg-world', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actor, theme: partition.theme, house }),
    });
  const first = await stub.fetch(request());
  expect(first.status).toBe(200);
  const saved = await first.json<{
    checksum: string;
    interior: { worldId: string; landmarkId: string; scene: { spawn: { x: number; y: number } } };
  }>();
  expect(saved.checksum).toBe(partition.checksum);
  expect(saved.interior).toMatchObject({ worldId: partition.worldId, landmarkId: house });
  const again = await stub.fetch(request());
  expect(await again.json()).toEqual({ ...town, interior: saved.interior });
  const outside = await open(stub, other, partition);
  const inside = await open(stub, actor, { ...partition, scene: house as RpgPartition['scene'] });
  expect(inside.messages[0]).toMatchObject({
    rpg: { scene: house, self: saved.interior.scene.spawn, players: [] },
  });
  expect(outside.messages.filter((message) => message.type === 'rpg-player')).toEqual([]);
});

it.each([false, true])(
  'returns outside the bookmarked house after leaving (previous house=%s)',
  async (visitFirstHouse) => {
    const { stub, partition, town } = await setup();
    const oldOutside = await open(stub, actor, partition);
    const firstHouse = town.bindings[0]!.landmarkId as RpgPartition['scene'];
    const targetHouse = town.bindings[1]!.landmarkId as RpgPartition['scene'];
    if (visitFirstHouse) await open(stub, actor, { ...partition, scene: firstHouse });
    const inside = await open(stub, actor, { ...partition, scene: targetHouse });
    const door = town.document.scenes.overworld.landmarks.find(
      (landmark) => landmark.id === targetHouse,
    )!;
    const progressKey = `rpgProgress:${partition.worldId}:${actor.userId}:overworld`;
    oldOutside.socket.close();
    inside.socket.close();
    await vi.waitFor(async () => {
      const progress = await runInDurableObject(stub, async (_, state) =>
        state.storage.get(progressKey),
      );
      expect(progress).toMatchObject({ x: door.x, y: door.y });
    });
    const returned = await open(stub, actor, partition);
    expect(returned.messages[0]).toMatchObject({
      rpg: { self: { x: door.x, y: door.y, scene: 'overworld' } },
    });
  },
);

it('rejects another member from a cached private house and revokes entry when room access changes', async () => {
  const { stub, partition, town } = await setup();
  const house = town.bindings.find(
    (binding) => binding.rooms[0]?.label === 'bot-private',
  )!.landmarkId;
  const housePartition = { ...partition, scene: house as RpgPartition['scene'] };
  const owner = await open(stub, actor, housePartition);
  const denied = await stub.fetch(connectRequest(other, housePartition));
  expect(denied.status).toBe(403);
  expect(denied.webSocket).toBeNull();
  const request = (member = other) =>
    new Request('https://presence.dmap/internal/rpg-world', {
      method: 'POST',
      body: JSON.stringify({ actor: member, theme: partition.theme, house }),
    });
  expect((await stub.fetch(request())).status).toBe(403);
  const revoked = await stub.fetch(
    new Request('https://presence.dmap/internal/live-frame', {
      method: 'POST',
      body: JSON.stringify({
        bridgeEpoch: 0,
        message: {
          type: 'world-member',
          serviceSessionId: streamId,
          guildKey: `g_${'a'.repeat(43)}`,
          cursor: { streamId, sequence: 2 },
          member: {
            kind: 'present',
            member: {
              userId: actor.userId,
              roleIds: [],
              pending: false,
              communicationDisabledUntil: null,
            },
          },
        },
      }),
    }),
  );
  expect(revoked.status).toBe(204);
  await vi.waitFor(() => expect(owner.socket.readyState).not.toBe(WebSocket.OPEN));
  expect((await stub.fetch(request(actor))).status).toBe(403);
  expect((await stub.fetch(connectRequest(actor, housePartition))).status).toBe(403);
});

it('allows house chat only for its bound channel and corrects movement using its interior', async () => {
  const { stub, partition, town } = await setup();
  const binding = town.bindings.find((candidate) => candidate.rooms[0]?.label === 'general')!;
  const otherBinding = town.bindings.find(
    (candidate) => candidate.landmarkId !== binding.landmarkId,
  )!;
  const roomKey = binding.rooms[0]!.key;
  const house = { ...partition, scene: binding.landmarkId as RpgPartition['scene'] };
  const first = await open(stub, actor, house);
  const peer = await open(stub, other, house);
  const anotherHouse = await open(stub, actor, {
    ...partition,
    scene: otherBinding.landmarkId as RpgPartition['scene'],
  });
  expect(peer.messages[0]).toMatchObject({ rpg: { players: [{ id: `p_${'a'.repeat(43)}` }] } });
  expect(anotherHouse.messages[0]).toMatchObject({ rpg: { players: [] } });
  const history = await receive(first.socket, 'message-history', () =>
    first.socket.send(
      JSON.stringify({
        type: 'message-read',
        requestId: crypto.randomUUID(),
        roomKey,
      }),
    ),
  );
  expect(history).toMatchObject({ result: { roomKey, messages: [] } });
  const denied = await receive(first.socket, 'message-read-error', () =>
    first.socket.send(
      JSON.stringify({
        type: 'message-read',
        requestId: crypto.randomUUID(),
        roomKey: otherBinding.rooms[0]!.key,
      }),
    ),
  );
  expect(denied).toMatchObject({ code: 'MESSAGE_MEMBER_FORBIDDEN' });
  expect(
    vi.mocked(sendLiveCommand).mock.calls.filter(([, command]) => command.type === 'message-read'),
  ).toHaveLength(1);
  const welcome = first.messages[0];
  if (welcome?.type !== 'welcome' || !welcome.rpg) throw new Error('Expected house welcome');
  const correction = await receive(first.socket, 'rpg-position', () =>
    first.socket.send(
      JSON.stringify({
        type: 'rpg-move',
        seq: 1,
        scene: house.scene,
        x: 0,
        y: 0,
        direction: 'up',
        action: 'walk',
      }),
    ),
  );
  expect(correction).toMatchObject({
    player: { x: welcome.rpg.self.x, y: welcome.rpg.self.y, scene: house.scene },
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

it.each(['http', 'socket'] as const)(
  'rechecks the session after asynchronous %s house loading',
  async (transport) => {
    const { stub, partition, town } = await setup();
    const house = town.bindings[0]!.landmarkId;
    const load = HouseInteriorStore.prototype.load;
    vi.spyOn(HouseInteriorStore.prototype, 'load').mockImplementationOnce(async function (
      this: HouseInteriorStore,
      ...args
    ) {
      const interior = await load.apply(this, args);
      await createD1AuthRepository(env.AUTH_DB).deleteSession(actor.sessionHash);
      return interior;
    });
    const request =
      transport === 'socket'
        ? connectRequest(actor, { ...partition, scene: house as RpgPartition['scene'] })
        : new Request('https://presence.dmap/internal/rpg-world', {
            method: 'POST',
            body: JSON.stringify({ actor, theme: partition.theme, house }),
          });
    const response = await stub.fetch(request);
    expect(response.status).toBe(401);
    expect(response.webSocket).toBeNull();
    expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  },
);

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

it('accepts bunched movement and sends one correction for an obsolete in-flight chain', async () => {
  const { stub, partition, town } = await setup();
  const first = await open(stub, actor, partition);
  await runInDurableObject(stub, async (instance, state) => {
    const socket = state.getWebSockets()[0]!;
    const previous = socket.deserializeAttachment() as { lastMessageAt: number };
    const now = previous.lastMessageAt + 100;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const move = {
      type: 'rpg-move',
      seq: 1,
      revision: 0,
      ...town.document.scenes.overworld.spawn,
      y: town.document.scenes.overworld.spawn.y + 8,
      direction: 'down',
      action: 'run',
      scene: 'overworld',
    };
    await instance.webSocketMessage(socket, JSON.stringify(move));
    vi.spyOn(Date, 'now').mockReturnValue(now + 1);
    await instance.webSocketMessage(socket, JSON.stringify({ ...move, seq: 2, y: move.y + 8 }));
    expect(socket.deserializeAttachment()).toMatchObject({ seq: 2, rpg: { y: move.y + 8 } });
    await instance.webSocketMessage(socket, JSON.stringify({ ...move, seq: 3, x: 0, y: 0 }));
    await instance.webSocketMessage(socket, JSON.stringify({ ...move, seq: 4, x: 0, y: 0 }));
    await instance.webSocketMessage(socket, JSON.stringify({ ...move, seq: 5, x: 0, y: 0 }));
    expect(socket.deserializeAttachment()).toMatchObject({ seq: 3, rpg: { revision: 1 } });
    await instance.webSocketMessage(
      socket,
      JSON.stringify({ ...move, seq: 6, revision: 1, y: move.y + 9 }),
    );
    expect(socket.deserializeAttachment()).toMatchObject({
      seq: 6,
      rpg: { revision: 1, y: move.y + 9 },
    });
    vi.restoreAllMocks();
  });
  await vi.waitFor(() =>
    expect(first.messages.filter((message) => message.type === 'rpg-position')).toHaveLength(1),
  );
  expect(first.messages.find((message) => message.type === 'rpg-position')).toMatchObject({
    seq: 3,
    revision: 1,
  });
});
