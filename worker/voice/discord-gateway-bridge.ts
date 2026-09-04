import { DurableObject } from 'cloudflare:workers';

import {
  gatewayBridgeMessageSchema,
  gatewayCommandSchema,
  type GatewayBridgeMessage,
  type GatewayCommandResult,
} from '../../src/domain/voice/protocol';

const MAX_MESSAGE_BYTES = 768 * 1_024;
const COMMAND_TIMEOUT_MS = 8_000;

interface GatewayAttachment {
  ready: boolean;
  serviceSessionId: string | null;
}

const ACTIVE_SESSION_KEY = 'active-service-session';
const ACTIVE_GUILD_KEYS_KEY = 'active-guild-keys';
const BRIDGE_EPOCH_KEY = 'bridge-epoch';

interface PendingCommand {
  resolve(result: CommandResolution): void;
  timeout: ReturnType<typeof setTimeout>;
}

type CommandResolution =
  { kind: 'result'; result: GatewayCommandResult } | { kind: 'timeout' } | { kind: 'unavailable' };

function attachmentOf(socket: WebSocket): GatewayAttachment {
  const value = socket.deserializeAttachment() as Partial<GatewayAttachment> | null;
  return {
    ready: value?.ready === true,
    serviceSessionId: typeof value?.serviceSessionId === 'string' ? value.serviceSessionId : null,
  };
}

export class DiscordGatewayBridge extends DurableObject<Env> {
  private readonly pending = new Map<string, PendingCommand>();

  public constructor(
    private readonly state: DurableObjectState,
    env: Env,
  ) {
    super(state, env);
  }

  public async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/connect') return this.acceptGateway(request);
    if (pathname === '/command') return this.command(request);
    return new Response(null, { status: 404 });
  }

  public async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) {
      socket.close(typeof raw === 'string' ? 1009 : 1003, 'Invalid message');
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      socket.close(1007, 'Invalid message');
      return;
    }
    const parsed = gatewayBridgeMessageSchema.safeParse(value);
    if (!parsed.success) {
      socket.close(1007, 'Invalid message');
      return;
    }

    const message = parsed.data;
    if (message.type === 'hello') {
      await this.activate(socket, message);
      return;
    }
    const attachment = attachmentOf(socket);
    if (!attachment.ready) {
      socket.close(1008, 'Hello required');
      return;
    }
    const [activeSessionId, bridgeEpoch] = await Promise.all([
      this.state.storage.get<string>(ACTIVE_SESSION_KEY),
      this.state.storage.get<number>(BRIDGE_EPOCH_KEY),
    ]);
    if (attachment.serviceSessionId === null || attachment.serviceSessionId !== activeSessionId) {
      socket.close(1008, 'Gateway superseded');
      return;
    }
    if (bridgeEpoch === undefined) {
      socket.close(1011, 'Bridge state unavailable');
      return;
    }
    if (message.type === 'command-result') {
      const pending = this.pending.get(message.requestId);
      if (pending !== undefined) {
        clearTimeout(pending.timeout);
        this.pending.delete(message.requestId);
        pending.resolve({ kind: 'result', result: message });
      }
      return;
    }
    const messageSessionId =
      message.type === 'voice-state' ? message.state.serviceSessionId : message.serviceSessionId;
    if (messageSessionId !== attachment.serviceSessionId) {
      socket.close(1008, 'Session mismatch');
      return;
    }
    const guildKeys = (await this.state.storage.get<string[]>(ACTIVE_GUILD_KEYS_KEY)) ?? [];
    if (!guildKeys.includes(message.guildKey)) {
      socket.close(1008, 'Unknown guild');
      return;
    }
    await this.routeVoiceMessage(message, bridgeEpoch);
  }

  public async webSocketClose(socket: WebSocket): Promise<void> {
    await this.deactivate(socket);
  }

  public async webSocketError(socket: WebSocket): Promise<void> {
    await this.deactivate(socket);
  }

  private acceptGateway(request: Request): Response {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({
      ready: false,
      serviceSessionId: null,
    } satisfies GatewayAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async command(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const body = await request.text();
    if (body.length > 2_048) return new Response(null, { status: 413 });
    let value: unknown;
    try {
      value = JSON.parse(body) as unknown;
    } catch {
      return new Response(null, { status: 400 });
    }
    const parsed = gatewayCommandSchema.safeParse(value);
    if (!parsed.success) return new Response(null, { status: 400 });

    const socket = this.readySocket();
    if (socket === null)
      return Response.json({ errorCode: 'GATEWAY_UNAVAILABLE' }, { status: 503 });

    const resolution = await new Promise<CommandResolution>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(parsed.data.requestId);
        resolve({ kind: 'timeout' });
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(parsed.data.requestId, { resolve, timeout });
      try {
        socket.send(JSON.stringify(parsed.data));
      } catch {
        clearTimeout(timeout);
        this.pending.delete(parsed.data.requestId);
        resolve({ kind: 'unavailable' });
      }
    });
    if (resolution.kind === 'timeout') {
      return Response.json({ errorCode: 'ACTION_TIMEOUT' }, { status: 504 });
    }
    if (resolution.kind === 'unavailable') {
      return Response.json({ errorCode: 'GATEWAY_UNAVAILABLE' }, { status: 503 });
    }
    return Response.json(resolution.result, { headers: { 'cache-control': 'no-store' } });
  }

  private readySocket(): WebSocket | null {
    for (const socket of this.state.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN && attachmentOf(socket).ready) return socket;
    }
    return null;
  }

  private async activate(
    socket: WebSocket,
    message: Extract<GatewayBridgeMessage, { type: 'hello' }>,
  ): Promise<void> {
    const [storedGuildKeys, previousEpoch] = await Promise.all([
      this.state.storage.get<string[]>(ACTIVE_GUILD_KEYS_KEY),
      this.state.storage.get<number>(BRIDGE_EPOCH_KEY),
    ]);
    const previousGuildKeys = storedGuildKeys ?? [];
    const bridgeEpoch = (previousEpoch ?? 0) + 1;
    if (!Number.isSafeInteger(bridgeEpoch)) {
      socket.close(1011, 'Bridge generation exhausted');
      return;
    }
    this.failPendingCommands();
    for (const existing of this.state.getWebSockets()) {
      if (existing !== socket && attachmentOf(existing).ready) {
        existing.close(1012, 'Gateway replaced');
      }
    }
    const attachment: GatewayAttachment = {
      ready: true,
      serviceSessionId: message.serviceSessionId,
    };
    socket.serializeAttachment(attachment);
    await this.state.storage.put({
      [ACTIVE_SESSION_KEY]: message.serviceSessionId,
      [ACTIVE_GUILD_KEYS_KEY]: message.guildKeys,
      [BRIDGE_EPOCH_KEY]: bridgeEpoch,
    });
    const nextGuildKeys = new Set(message.guildKeys);
    const removedGuildKeys = previousGuildKeys.filter((guildKey) => !nextGuildKeys.has(guildKey));
    await Promise.allSettled([
      ...removedGuildKeys.map((guildKey) =>
        this.sendServiceStatus(guildKey, 'offline', bridgeEpoch),
      ),
      ...message.guildKeys.map((guildKey) =>
        this.sendServiceStatus(guildKey, 'online', bridgeEpoch),
      ),
    ]);
  }

  private async deactivate(socket: WebSocket): Promise<void> {
    const attachment = attachmentOf(socket);
    if (!attachment.ready || attachment.serviceSessionId === null) return;
    const [activeSessionId, bridgeEpoch] = await Promise.all([
      this.state.storage.get<string>(ACTIVE_SESSION_KEY),
      this.state.storage.get<number>(BRIDGE_EPOCH_KEY),
    ]);
    if (activeSessionId !== attachment.serviceSessionId) return;
    const replacement = this.state
      .getWebSockets()
      .some(
        (candidate) =>
          candidate !== socket &&
          candidate.readyState === WebSocket.OPEN &&
          attachmentOf(candidate).ready &&
          attachmentOf(candidate).serviceSessionId === activeSessionId,
      );
    if (replacement) return;
    const guildKeys = (await this.state.storage.get<string[]>(ACTIVE_GUILD_KEYS_KEY)) ?? [];
    await this.state.storage.delete([ACTIVE_SESSION_KEY, ACTIVE_GUILD_KEYS_KEY]);
    await Promise.allSettled(
      guildKeys.map((guildKey) => this.sendServiceStatus(guildKey, 'offline', bridgeEpoch ?? 0)),
    );
    this.failPendingCommands();
  }

  private async routeVoiceMessage(
    message: Exclude<GatewayBridgeMessage, { type: 'hello' | 'command-result' }>,
    bridgeEpoch: number,
  ): Promise<void> {
    const stub = this.env.WORLD_PRESENCE.getByName(message.guildKey);
    await stub.fetch('https://presence.dmap/internal/voice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bridgeEpoch, message }),
    });
  }

  private async sendServiceStatus(
    guildKey: string,
    service: 'online' | 'offline',
    bridgeEpoch: number,
  ): Promise<void> {
    const stub = this.env.WORLD_PRESENCE.getByName(guildKey);
    await stub.fetch('https://presence.dmap/internal/voice-service', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bridgeEpoch, service }),
    });
  }

  private failPendingCommands(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.resolve({ kind: 'unavailable' });
    }
    this.pending.clear();
  }
}
