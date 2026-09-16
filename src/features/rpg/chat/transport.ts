import { chatEventSchema, type ChatCommand, type ChatEvent } from '../../../domain/chat/protocol';

export type ChatConnection = 'connecting' | 'online' | 'reconnecting' | 'offline' | 'denied';
export interface ChatTransport {
  start(receive: (event: ChatEvent) => void, status: (state: ChatConnection) => void): void;
  send(command: ChatCommand): boolean;
  stop(): void;
  resume(): void;
}

/** A single socket across game scenes. Backoff, heartbeat and cancellation belong here. */
export class SocketChatTransport implements ChatTransport {
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private stopped = true;
  private attempt = 0;
  private lastReceived = 0;
  private receive: (event: ChatEvent) => void = () => {};
  private status: (state: ChatConnection) => void = () => {};
  constructor(
    private readonly guildId: string,
    private readonly socketFactory = (url: string) => new WebSocket(url),
  ) {}
  start(receive: (event: ChatEvent) => void, status: (state: ChatConnection) => void): void {
    this.receive = receive;
    this.status = status;
    this.stopped = false;
    this.connect();
  }
  private connect(): void {
    if (this.stopped) return;
    this.status(this.attempt ? 'reconnecting' : 'connecting');
    const url = new URL(`/api/auth/guilds/${this.guildId}/game-chat`, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = this.socketFactory(url.href);
    this.socket = socket;
    this.lastReceived = Date.now();
    let welcomed = false;
    socket.onmessage = (event) => {
      if (
        this.stopped ||
        this.socket !== socket ||
        typeof event.data !== 'string' ||
        event.data.length > 1_000_000
      )
        return;
      let value: unknown;
      try {
        value = JSON.parse(event.data);
      } catch {
        socket.close(4002, 'Invalid chat event');
        return;
      }
      const parsed = chatEventSchema.safeParse(value);
      if (!parsed.success) {
        socket.close(4002, 'Invalid chat event');
        return;
      }
      this.lastReceived = Date.now();
      if (parsed.data.type === 'welcome') {
        welcomed = true;
        this.attempt = 0;
        this.status('online');
      }
      this.receive(parsed.data);
    };
    socket.onclose = (event) => {
      if (this.stopped || this.socket !== socket) return;
      clearInterval(this.heartbeat);
      this.socket = null;
      if (event.code === 1008) {
        this.status('denied');
        return;
      }
      if (this.attempt >= 8) {
        this.status('offline');
        return;
      }
      this.status('reconnecting');
      const wait = Math.min(15_000, 750 * 2 ** this.attempt++) + Math.random() * 400;
      this.timer = setTimeout(() => this.connect(), wait);
    };
    socket.onerror = () => {
      if (socket.readyState === WebSocket.OPEN) socket.close();
    };
    this.heartbeat = setInterval(() => {
      if (this.socket !== socket) return;
      if (Date.now() - this.lastReceived > (welcomed ? 40_000 : 12_000)) {
        socket.close();
        return;
      }
      if (welcomed) this.send({ type: 'ping' });
    }, 10_000);
  }
  send(command: ChatCommand): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 64 * 1024)
      return false;
    try {
      this.socket.send(JSON.stringify(command));
      return true;
    } catch {
      return false;
    }
  }
  resume(): void {
    if (this.stopped) return;
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    const previous = this.socket;
    this.socket = null;
    previous?.close();
    this.attempt = 0;
    this.connect();
  }
  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'Left game');
  }
}
