import WebSocket, { type RawData } from 'ws';

import {
  gatewayCommandSchema,
  type GatewayBridgeMessage,
  type GatewayCommand,
  type GatewayCommandResult,
} from '../../../src/domain/voice/protocol';
import type { GatewayConfig } from './config';

const HEARTBEAT_INTERVAL_MS = 25_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

interface WorkerBridgeHandlers {
  onConnected(send: (message: GatewayBridgeMessage) => boolean): Promise<void>;
  onCommand(command: GatewayCommand): Promise<GatewayCommandResult>;
}

export class WorkerBridge {
  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private awaitingPong = false;

  public constructor(
    private readonly config: GatewayConfig,
    private readonly handlers: WorkerBridgeHandlers,
  ) {}

  public start(): void {
    this.stopping = false;
    this.open();
  }

  public stop(): void {
    this.stopping = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.socket?.close(1001, 'Gateway stopping');
    this.socket = null;
  }

  private send(message: GatewayBridgeMessage): boolean {
    const socket = this.socket;
    return socket === null ? false : this.sendOn(socket, message);
  }

  private sendOn(socket: WebSocket, message: GatewayBridgeMessage): boolean {
    if (socket !== this.socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  private open(): void {
    if (this.stopping) return;
    const socket = new WebSocket(this.config.bridgeUrl, {
      headers: { Authorization: `Bearer ${this.config.bridgeSecret}` },
      handshakeTimeout: 10_000,
      maxPayload: 768 * 1_024,
    });
    this.socket = socket;
    socket.on('open', () => {
      this.awaitingPong = false;
      this.startHeartbeat(socket);
      void this.handlers
        .onConnected((message) => this.sendOn(socket, message))
        .then(() => {
          if (socket === this.socket) this.reconnectAttempt = 0;
        })
        .catch(() => socket.close(1011, 'Initialization failed'));
    });
    socket.on('message', (raw) => void this.receive(socket, raw));
    socket.on('pong', () => {
      this.awaitingPong = false;
    });
    socket.on('error', () => undefined);
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
      if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.scheduleReconnect();
    });
  }

  private async receive(socket: WebSocket, raw: RawData): Promise<void> {
    if (socket !== this.socket) return;
    let value: unknown;
    try {
      value = JSON.parse(raw.toString()) as unknown;
    } catch {
      socket.close(1007, 'Invalid command');
      return;
    }
    const parsed = gatewayCommandSchema.safeParse(value);
    if (!parsed.success) {
      socket.close(1007, 'Invalid command');
      return;
    }
    let result: GatewayCommandResult;
    try {
      result = await this.handlers.onCommand(parsed.data);
    } catch {
      console.error(JSON.stringify({ service: 'dmap-gateway', event: 'voice_command_failed' }));
      result = {
        type: 'command-result',
        requestId: parsed.data.requestId,
        ok: false,
        errorCode: 'DISCORD_ERROR',
      };
    }
    if (socket === this.socket) this.send(result);
  }

  private startHeartbeat(socket: WebSocket): void {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.awaitingPong) {
        socket.terminate();
        return;
      }
      this.awaitingPong = true;
      socket.ping();
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref();
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer !== null) return;
    const exponential = Math.min(MAX_RECONNECT_DELAY_MS, 1_000 * 2 ** this.reconnectAttempt);
    const delay = Math.round(exponential * (0.8 + Math.random() * 0.4));
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
    this.reconnectTimer.unref();
  }
}
