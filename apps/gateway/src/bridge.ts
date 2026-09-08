import WebSocket, { type RawData } from 'ws';

import { type GatewayCommand, type GatewayCommandResult } from '../../../src/domain/voice/protocol';
import {
  LIVE_COMMAND_MAX_BYTES,
  LIVE_FRAME_MAX_BYTES,
  LIVE_MUTATION_MAX_BYTES,
  serverBridgeCommandSchema,
  serverBridgeMessageSchema,
  type LiveCommand,
  type LiveCommandResult,
  type ServerBridgeMessage,
} from '../../../src/domain/discord/live-protocol';
import type { GatewayConfig } from './config';

const HEARTBEAT_INTERVAL_MS = 25_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

interface WorkerBridgeHandlers {
  onConnected(send: (message: ServerBridgeMessage) => boolean): Promise<void>;
  onCommand(command: GatewayCommand): Promise<GatewayCommandResult>;
  onLiveCommand(command: LiveCommand): Promise<LiveCommandResult>;
  onDisconnected(): void;
}

export class WorkerBridge {
  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private awaitingPong = false;
  private serviceSessionId: string | null = null;

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
    if (this.socket !== null) {
      const socket = this.socket;
      this.disconnected(socket);
      socket.close(1001, 'Gateway stopping');
    }
  }

  private sendOn(socket: WebSocket, message: ServerBridgeMessage): boolean {
    if (socket !== this.socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      let body = JSON.stringify(message);
      const overflow =
        new TextEncoder().encode(body).byteLength > LIVE_FRAME_MAX_BYTES ||
        !serverBridgeMessageSchema.safeParse(message).success;
      if (
        overflow &&
        message.type === 'live-command-result' &&
        message.result.type === 'channel-result' &&
        message.result.result.status === 'applied'
      ) {
        message = { ...message, result: { ...message.result, read: null } };
        body = JSON.stringify(message);
      }
      if (
        new TextEncoder().encode(body).byteLength > LIVE_FRAME_MAX_BYTES ||
        !serverBridgeMessageSchema.safeParse(message).success
      ) {
        this.disconnected(socket);
        socket.close(1009, 'Invalid bridge payload');
        return false;
      }
      socket.send(body);
      if (overflow) {
        // Preserve the confirmed outcome, then revoke the oversized source stream.
        this.disconnected(socket);
        socket.close(1009, 'Live source exceeds bridge limit');
      }
      if (message.type === 'hello') this.serviceSessionId = message.serviceSessionId;
      return true;
    } catch {
      this.disconnected(socket);
      socket.terminate();
      return false;
    }
  }

  private open(): void {
    if (this.stopping) return;
    if (this.socket !== null) {
      const previous = this.socket;
      this.disconnected(previous);
      previous.close(1012, 'Gateway replaced');
    }
    const socket = new WebSocket(this.config.bridgeUrl, {
      headers: { Authorization: `Bearer ${this.config.bridgeSecret}` },
      handshakeTimeout: 10_000,
      maxPayload: 768 * 1_024,
    });
    this.socket = socket;
    socket.on('open', () => {
      if (socket !== this.socket) return;
      console.info(JSON.stringify({ service: 'dmap-gateway', event: 'bridge_connected' }));
      this.awaitingPong = false;
      this.startHeartbeat(socket);
      void this.handlers
        .onConnected((message) => this.sendOn(socket, message))
        .then(() => {
          if (socket === this.socket) this.reconnectAttempt = 0;
        })
        .catch(() => {
          this.disconnected(socket);
          socket.close(1011, 'Initialization failed');
        });
    });
    socket.on('message', (raw) => void this.receive(socket, raw));
    socket.on('pong', () => {
      if (socket === this.socket) this.awaitingPong = false;
    });
    socket.on('error', () => {
      console.error(
        JSON.stringify({
          service: 'dmap-gateway',
          event: 'bridge_connection_failed',
          origin: new URL(this.config.bridgeUrl).origin,
        }),
      );
      this.disconnected(socket);
      socket.terminate();
    });
    socket.on('close', () => this.disconnected(socket));
  }

  private disconnected(socket: WebSocket): void {
    if (socket !== this.socket) return;
    this.socket = null;
    this.serviceSessionId = null;
    this.awaitingPong = false;
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.handlers.onDisconnected();
    this.scheduleReconnect();
  }

  private async receive(socket: WebSocket, raw: RawData): Promise<void> {
    if (socket !== this.socket) return;
    if (new TextEncoder().encode(raw.toString()).byteLength > LIVE_COMMAND_MAX_BYTES) {
      this.disconnected(socket);
      socket.close(1009, 'Command too large');
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw.toString()) as unknown;
    } catch {
      this.disconnected(socket);
      socket.close(1007, 'Invalid command');
      return;
    }
    const parsed = serverBridgeCommandSchema.safeParse(value);
    if (!parsed.success) {
      this.disconnected(socket);
      socket.close(1007, 'Invalid command');
      return;
    }
    if (
      parsed.data.type === 'world-read' ||
      parsed.data.type === 'world-release' ||
      parsed.data.type === 'channel-mutate' ||
      parsed.data.type === 'message-read' ||
      parsed.data.type === 'message-send'
    ) {
      const command = parsed.data;
      if (
        command.type === 'channel-mutate' &&
        new TextEncoder().encode(JSON.stringify(command.input)).byteLength > LIVE_MUTATION_MAX_BYTES
      ) {
        this.disconnected(socket);
        socket.close(1009, 'Mutation too large');
        return;
      }
      let result: LiveCommandResult;
      try {
        result = await this.handlers.onLiveCommand(command);
      } catch {
        if (command.type === 'channel-mutate') {
          result = {
            type: 'channel-result',
            requestId: command.requestId,
            read: null,
            result: {
              status: 'uncertain',
              requestId: command.requestId,
              code: 'CHANNEL_ACTION_UNCERTAIN',
            },
          };
        } else if (command.type === 'message-send') {
          result = {
            type: 'message-send-result',
            requestId: command.requestId,
            status: 'uncertain',
            code: 'MESSAGE_ACTION_UNCERTAIN',
          };
        } else {
          result = {
            type: 'live-error',
            requestId: command.requestId,
            error: {
              code:
                command.type === 'message-read'
                  ? 'MESSAGE_READ_FAILED'
                  : 'WORLD_SOURCE_UNAVAILABLE',
              status: 503,
            },
          };
        }
      }
      this.sendOn(socket, {
        type: 'live-command-result',
        commandType: command.type,
        guildId: command.guildId,
        userId: command.userId,
        result,
      });
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
    this.sendOn(socket, result);
  }

  private startHeartbeat(socket: WebSocket): void {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (socket !== this.socket) return;
      if (this.awaitingPong) {
        this.disconnected(socket);
        socket.terminate();
        return;
      }
      this.awaitingPong = true;
      socket.ping();
      if (this.serviceSessionId !== null)
        this.sendOn(socket, { type: 'live-heartbeat', serviceSessionId: this.serviceSessionId });
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
