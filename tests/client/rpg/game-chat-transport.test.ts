import { afterEach, expect, it, vi } from 'vitest';
import { SocketChatTransport } from '../../../src/features/rpg/chat/transport';
import { GLOBAL_CHAT } from '../../../src/domain/chat/protocol';

class Socket {
  readyState = 1;
  bufferedAmount = 0;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closeCode: number | undefined;
  send(value: string) {
    this.sent.push(value);
  }
  close(code = 1000) {
    if (code !== 1000 && (code < 3000 || code > 4999))
      throw new Error('Browser rejects this close code');
    this.closeCode = code;
    this.drop(code);
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  receive(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
const transports: SocketChatTransport[] = [];
afterEach(() => {
  transports.splice(0).forEach((t) => t.stop());
  vi.useRealTimers();
});
function setup() {
  vi.useFakeTimers();
  const sockets: Socket[] = [];
  const transport = new SocketChatTransport('123', () => {
    const s = new Socket();
    sockets.push(s);
    return s as unknown as WebSocket;
  });
  transports.push(transport);
  const status = vi.fn(),
    receive = vi.fn();
  transport.start(receive, status);
  return { transport, sockets, status, receive };
}
const welcome = {
  type: 'welcome',
  self: { id: `p_${'a'.repeat(43)}`, name: 'Rowan' },
  people: [],
  rooms: [GLOBAL_CHAT],
};
it('backs off after a dropped connection and ignores events from the old socket', () => {
  const { sockets, transport, status, receive } = setup();
  sockets[0]!.receive(welcome);
  expect(status).toHaveBeenLastCalledWith('online');
  sockets[0]!.drop();
  expect(status).toHaveBeenLastCalledWith('reconnecting');
  vi.advanceTimersByTime(1200);
  expect(sockets).toHaveLength(2);
  const count = receive.mock.calls.length;
  sockets[0]!.receive(welcome);
  expect(receive).toHaveBeenCalledTimes(count);
  transport.stop();
  vi.advanceTimersByTime(120_000);
  expect(sockets).toHaveLength(2);
});
it('reconnects when a welcomed socket stops responding and refuses buffered sends', () => {
  const { sockets, transport } = setup();
  sockets[0]!.receive(welcome);
  sockets[0]!.bufferedAmount = 70_000;
  expect(transport.send({ type: 'ping' })).toBe(false);
  vi.advanceTimersByTime(52_000);
  expect(sockets.length).toBeGreaterThan(1);
});
it('rejects malformed server data using a browser-valid close code', () => {
  const { sockets } = setup();
  expect(() => sockets[0]!.receive({ type: 'invented' })).not.toThrow();
  expect(sockets[0]!.closeCode).toBe(4002);
});
