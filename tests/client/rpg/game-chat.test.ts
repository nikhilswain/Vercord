import { afterEach, expect, it, vi } from 'vitest';
import { GameChatClient } from '../../../src/features/rpg/chat/client';
import {
  GLOBAL_CHAT,
  type ChatCommand,
  type ChatEvent,
  type ChatMessage,
} from '../../../src/domain/chat/protocol';
import type { ChatConnection, ChatTransport } from '../../../src/features/rpg/chat/transport';
const self = { id: `p_${'a'.repeat(43)}`, name: 'Rowan' };
class Transport implements ChatTransport {
  commands: ChatCommand[] = [];
  receive: (event: ChatEvent) => void = () => {};
  status: (state: ChatConnection) => void = () => {};
  start(receive: (event: ChatEvent) => void, status: (state: ChatConnection) => void) {
    this.receive = receive;
    this.status = status;
  }
  send(command: ChatCommand) {
    this.commands.push(command);
    return true;
  }
  stop() {}
  resume() {}
}
const clients: GameChatClient[] = [];
function setup() {
  const transport = new Transport(),
    client = new GameChatClient(transport);
  clients.push(client);
  client.start();
  transport.status('online');
  transport.receive({ type: 'welcome', self, people: [self], rooms: [GLOBAL_CHAT] });
  return { client, transport };
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.stop());
  vi.useRealTimers();
});
function message(requestId: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    requestId,
    sequence: 1,
    roomId: 'global',
    sender: self,
    body: 'Hello',
    sentAt: Date.now(),
  };
}
it('merges acknowledgement, broadcast and replay into a single message', () => {
  const { client, transport } = setup();
  expect(client.send('Hello')).toBe(true);
  const sent = transport.commands.at(-1)!;
  if (sent.type !== 'send') throw new Error('send');
  const m = message(sent.requestId);
  transport.receive({ type: 'ack', requestId: sent.requestId, message: m });
  transport.receive({ type: 'message', room: GLOBAL_CHAT, message: m });
  client.history('global');
  const history = transport.commands.at(-1)!;
  if (history.type !== 'history') throw new Error('history');
  transport.receive({
    type: 'history',
    requestId: history.requestId,
    room: GLOBAL_CHAT,
    messages: [m],
    hasMore: false,
  });
  expect(client.snapshot().messages.global).toHaveLength(1);
  expect(client.snapshot().messages.global![0]?.delivery).toBe('sent');
});
it('marks an uncertain send and retries with the same id after reconnect', () => {
  vi.useFakeTimers();
  const { client, transport } = setup();
  client.send('Hello');
  const send = transport.commands.at(-1)!;
  vi.advanceTimersByTime(10_001);
  const entry = client.snapshot().messages.global![0]!;
  expect(entry.delivery).toBe('failed');
  transport.status('reconnecting');
  expect(client.send('Offline')).toBe(false);
  transport.status('online');
  client.retry(entry);
  expect(transport.commands.at(-1)).toEqual(send);
  if (send.type !== 'send') throw new Error('send');
  transport.receive({ type: 'ack', requestId: send.requestId, message: message(send.requestId) });
  expect(client.snapshot().messages.global).toHaveLength(1);
  expect(client.snapshot().messages.global![0]?.delivery).toBe('sent');
});
it('ignores a stale history response after a user switches conversations', () => {
  const { client, transport } = setup();
  const old = transport.commands.at(-1)!;
  if (old.type !== 'history') throw new Error('history');
  client.select('direct-list');
  transport.receive({
    type: 'history',
    requestId: old.requestId,
    room: GLOBAL_CHAT,
    messages: [message(crypto.randomUUID())],
    hasMore: false,
  });
  expect(client.snapshot().active).toBe('direct-list');
  expect(client.snapshot().messages.global).toBeUndefined();
});
it('counts remote messages once and clears cached private content when access is removed', () => {
  const { client, transport } = setup();
  const room = {
    id: `party:${crypto.randomUUID()}`,
    name: 'Trail party',
    kind: 'party' as const,
    members: [self],
  };
  const m = {
    ...message(crypto.randomUUID()),
    roomId: room.id,
    sender: { id: `p_${'b'.repeat(43)}`, name: 'Ash' },
  };
  transport.receive({ type: 'message', room, message: m });
  transport.receive({ type: 'message', room, message: m });
  expect(client.snapshot().unread[room.id]).toBe(1);
  transport.receive({ type: 'rooms', rooms: [GLOBAL_CHAT] });
  expect(client.snapshot().messages[room.id]).toBeUndefined();
  expect(client.snapshot().unread[room.id]).toBeUndefined();
});

it('handles unsolicited social snapshots and settles party actions only for their own response', () => {
  const { client, transport } = setup();
  transport.receive({ type: 'social', invitations: [] });
  expect(client.snapshot().socialPending).toBe(false);
  client.invite(`p_${'b'.repeat(43)}`);
  const invite = transport.commands.at(-1)!;
  if (invite.type !== 'party-invite') throw new Error('invite');
  expect(client.snapshot().socialPending).toBe(true);
  client.invite(`p_${'c'.repeat(43)}`);
  expect(transport.commands.at(-1)).toBe(invite);
  transport.receive({ type: 'social', invitations: [] });
  expect(client.snapshot().socialPending).toBe(true);
  transport.receive({ type: 'error', requestId: invite.requestId, code: 'PARTY_FULL' });
  expect(client.snapshot()).toMatchObject({
    socialPending: false,
    error: 'That party is full. Up to four travelers can join.',
  });
});

it('keeps party failures recoverable and advertises the latest area on reconnect', () => {
  vi.useFakeTimers();
  const { client, transport } = setup();
  client.presence('Old Forest', true);
  expect(transport.commands.at(-1)).toEqual({ type: 'presence', area: 'Old Forest', away: true });
  client.invite(`p_${'b'.repeat(43)}`);
  vi.advanceTimersByTime(10_001);
  expect(client.snapshot().socialPending).toBe(false);
  expect(client.snapshot().error).toContain('not confirmed');
  transport.receive({ type: 'welcome', self, people: [self], rooms: [GLOBAL_CHAT] });
  expect(transport.commands.filter((c) => c.type === 'presence').at(-1)).toEqual({
    type: 'presence',
    area: 'Old Forest',
    away: true,
  });
  expect(client.snapshot().error).toBeNull();
});
