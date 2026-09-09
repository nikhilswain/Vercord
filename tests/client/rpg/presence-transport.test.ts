import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  WorldPresenceClient,
  type WorldPresenceCallbacks,
  type RpgPresenceOptions,
} from '../../../src/features/world/presence/world-presence-client';
import type { WorldView } from '../../../src/domain/channels/protocol';
import type { RpgPresencePlayer } from '../../../src/domain/presence/rpg-protocol';

class Socket extends EventTarget {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static sockets: Socket[] = [];
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  closeCode?: number;
  constructor(public url: string) {
    super();
    Socket.sockets.push(this);
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  receive(value: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }));
  }
  send(value: string) {
    this.sent.push(JSON.parse(value) as Record<string, unknown>);
  }
  close(code?: number) {
    this.closeCode = code;
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
}
const worldId = 'd782f567-f5b7-4bb8-8b72-8a337cda20f0';
const roomKey = `c_${'a'.repeat(43)}`;
const view: WorldView = {
  version: { epoch: 1, revision: 1 },
  snapshot: {
    schemaVersion: 1,
    slug: 'garden',
    generatedAt: '2026-09-09T00:00:00.000Z',
    server: { displayName: 'Garden' },
    areas: [],
  },
  controls: { canCreateRoot: false, categories: [], manageableKeys: [] },
};
const self: RpgPresencePlayer = {
  id: `p_${'a'.repeat(43)}`,
  displayName: 'Alice',
  appearance: 'ash',
  x: 100,
  y: 100,
  direction: 'down',
  action: 'idle',
  scene: 'overworld',
};
function callbacks(): WorldPresenceCallbacks {
  return {
    onPlayers: vi.fn(),
    onSelfAvatar: vi.fn(),
    onState: vi.fn(),
    onVoiceState: vi.fn(),
    onVoiceService: vi.fn(),
    onWorldView: vi.fn(),
    onWorldSync: vi.fn(),
  };
}
function options(): RpgPresenceOptions {
  return {
    admission: { theme: 'village', worldId, checksum: 'a'.repeat(64), scene: 'overworld' },
    onWelcome: vi.fn(),
    onPlayers: vi.fn(),
    onPosition: vi.fn(),
  };
}
const welcome = () => ({
  type: 'welcome',
  selfId: self.id,
  selfAvatarId: 'avatar-01',
  players: [],
  voiceService: 'online',
  voiceState: null,
  worldView: view,
});
async function connect(rpg?: RpgPresenceOptions) {
  const client = new WorldPresenceClient('123', callbacks(), rpg);
  client.connect();
  await vi.advanceTimersByTimeAsync(1);
  const socket = Socket.sockets.at(-1)!;
  socket.open();
  return { client, socket };
}
beforeEach(() => {
  vi.useFakeTimers();
  Socket.sockets = [];
  vi.stubGlobal('WebSocket', Socket);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('waits for matching RPG admission, isolates peers and sends a final idle without waiting for another frame', async () => {
  const rpg = options();
  const { client, socket } = await connect(rpg);
  client.updateRpgLocation({ ...self, action: 'run' });
  expect(socket.sent).toEqual([]);
  expect(new URL(socket.url).searchParams.get('worldId')).toBe(worldId);
  socket.receive({ ...welcome(), rpg: { ...rpg.admission, theme: undefined, self, players: [] } });
  expect(rpg.onWelcome).toHaveBeenCalledOnce();
  client.updateRpgLocation({
    x: 110,
    y: 100,
    direction: 'right',
    action: 'run',
    scene: 'overworld',
  });
  await vi.advanceTimersByTimeAsync(100);
  expect(socket.sent.at(-1)?.action).toBe('run');
  client.updateRpgLocation({
    x: 111,
    y: 100,
    direction: 'right',
    action: 'idle',
    scene: 'overworld',
  });
  expect(socket.sent.at(-1)).toMatchObject({ type: 'rpg-move', x: 111, action: 'idle' });
  socket.receive({
    type: 'rpg-player',
    player: { ...self, id: `p_${'b'.repeat(43)}`, scene: 'dungeon' },
  });
  expect(rpg.onPlayers).toHaveBeenLastCalledWith([]);
  socket.receive({ type: 'rpg-position', player: { ...self, x: 108 } });
  expect(rpg.onPosition).toHaveBeenCalledWith({ ...self, x: 108 });
  client.disconnect();
});

it('rejects a welcome for different saved geometry before exposing or sending a player', async () => {
  const rpg = options();
  const { client, socket } = await connect(rpg);
  socket.receive({
    ...welcome(),
    rpg: { worldId, checksum: 'b'.repeat(64), scene: 'overworld', self, players: [] },
  });
  expect(socket.closeCode).toBe(1007);
  expect(rpg.onWelcome).not.toHaveBeenCalled();
  expect(socket.sent).toEqual([]);
  client.disconnect();
});

it('preserves intermediate turns across coalesced updates and flushes a final stop once', async () => {
  const rpg = options();
  const { client, socket } = await connect(rpg);
  socket.receive({ ...welcome(), rpg: { ...rpg.admission, theme: undefined, self, players: [] } });
  let now = 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  client.updateRpgLocation({ ...self, x: 110, action: 'run', revision: 0 });
  now += 10;
  client.updateRpgLocation({
    ...self,
    x: 112,
    y: 110,
    action: 'run',
    revision: 0,
    via: [{ x: 112, y: 100 }],
  });
  now += 10;
  client.updateRpgLocation({
    ...self,
    x: 120,
    y: 112,
    action: 'run',
    revision: 0,
    via: [{ x: 120, y: 110 }],
  });
  client.pauseRpgMovement();
  expect(socket.sent.at(-1)).toMatchObject({
    x: 120,
    y: 112,
    action: 'idle',
    via: [
      { x: 112, y: 100 },
      { x: 112, y: 110 },
      { x: 120, y: 110 },
    ],
  });
  expect(socket.sent).toHaveLength(2);
  client.pauseRpgMovement();
  expect(socket.sent).toHaveLength(2);
  client.disconnect();
});

it('waits for the corrected simulation revision and ignores delayed old movement and duplicate corrections', async () => {
  const rpg = options();
  const { client, socket } = await connect(rpg);
  socket.receive({ ...welcome(), rpg: { ...rpg.admission, theme: undefined, self, players: [] } });
  client.updateRpgLocation({ ...self, x: 110, action: 'idle', revision: 0 });
  socket.receive({ type: 'rpg-position', player: self, seq: 1, revision: 1 });
  client.updateRpgLocation({ ...self, x: 115, action: 'idle', revision: 0 });
  expect(socket.sent).toHaveLength(1);
  client.updateRpgLocation({ ...self, x: 101, action: 'idle', revision: 1 });
  expect(socket.sent.at(-1)).toMatchObject({ x: 101, revision: 1 });
  socket.receive({ type: 'rpg-position', player: self, seq: 1, revision: 1 });
  expect(rpg.onPosition).toHaveBeenCalledExactlyOnceWith(self, 1);
  client.disconnect();
});

it('updates an appearance acknowledgement without replacing predicted movement', async () => {
  const rpg = { ...options(), onAppearance: vi.fn() };
  const { client, socket } = await connect(rpg);
  socket.receive({ ...welcome(), rpg: { ...rpg.admission, theme: undefined, self, players: [] } });
  socket.receive({
    type: 'rpg-position',
    player: { ...self, appearance: 'rowan' },
    appearanceOnly: true,
  });
  expect(rpg.onPosition).not.toHaveBeenCalled();
  expect(rpg.onAppearance).toHaveBeenCalledWith({ ...self, appearance: 'rowan' });
  client.disconnect();
});

it('preserves legacy movement and settles shared chat requests without RPG admission', async () => {
  const { client, socket } = await connect();
  expect(new URL(socket.url).search).toBe('');
  socket.receive(welcome());
  client.updateLocation({ x: 10, y: 20, moving: true, direction: 'right', scene: 'exterior' });
  await vi.advanceTimersByTimeAsync(100);
  expect(socket.sent.at(-1)).toMatchObject({ type: 'move', moving: true, scene: 'exterior' });
  const history = client.readMessages(roomKey);
  const request = socket.sent.at(-1)!;
  socket.receive({
    type: 'message-history',
    requestId: request.requestId,
    result: { roomKey, messages: [], canRead: true, canSend: false },
  });
  await expect(history).resolves.toMatchObject({ roomKey, canSend: false });
  client.disconnect();
});
