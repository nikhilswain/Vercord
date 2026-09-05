import { DurableObject } from 'cloudflare:workers';
import { createIdentifierFactory } from '../../src/domain/discord/identifiers';
import {
  LIVE_COMMAND_MAX_BYTES,
  LIVE_FRAME_MAX_BYTES,
  LIVE_MUTATION_MAX_BYTES,
  liveCommandSchema,
  serverBridgeMessageSchema,
  type LiveCommand,
  type LiveCommandResult,
  type LiveRead,
  type ServerBridgeMessage,
} from '../../src/domain/discord/live-protocol';
import { gatewayCommandSchema, type GatewayCommandResult } from '../../src/domain/voice/protocol';
import { decodeBase64UrlSecret } from '../config/runtime';

const COMMAND_TIMEOUT_MS = 8_000;
const HEARTBEAT_STALE_MS = 75_000;
const ACTIVE_KEY = 'active-bridge-v2';
const EPOCH_KEY = 'bridge-epoch';
const OFFLINE_KEY = 'undelivered-live-offline';
const encoder = new TextEncoder();
interface GatewayAttachment {
  ready: boolean;
  epoch: number;
  serviceSessionId: string | null;
  protocolVersion: 1 | 2;
  capabilities: string[];
}
interface ActiveBridge extends GatewayAttachment {
  guildKeys: string[];
  lastHeartbeat: number;
}
interface PendingVoice {
  epoch: number;
  resolve(result: GatewayCommandResult | null): void;
  timeout: ReturnType<typeof setTimeout>;
}
interface PendingLive {
  epoch: number;
  command: LiveCommand;
  sent: boolean;
  resolve(result: LiveCommandResult): void;
  timeout: ReturnType<typeof setTimeout>;
}
function attachmentOf(socket: WebSocket): GatewayAttachment {
  const value = socket.deserializeAttachment() as Partial<GatewayAttachment> | null;
  return {
    ready: value?.ready === true,
    epoch: value?.epoch ?? -1,
    serviceSessionId: value?.serviceSessionId ?? null,
    protocolVersion: value?.protocolVersion === 2 ? 2 : 1,
    capabilities: value?.capabilities ?? [],
  };
}
function unavailable(command: LiveCommand, sent = false): LiveCommandResult {
  if (command.type === 'channel-mutate' && sent)
    return {
      type: 'channel-result',
      requestId: command.requestId,
      read: null,
      result: {
        status: 'uncertain',
        requestId: command.requestId,
        code: 'CHANNEL_ACTION_UNCERTAIN',
      },
    };
  return {
    type: 'live-error',
    requestId: command.requestId,
    error: { code: 'WORLD_SOURCE_UNAVAILABLE', status: 503 },
  };
}
function readMatches(read: LiveRead, command: LiveCommand): boolean {
  const userId = read.member.kind === 'present' ? read.member.member.userId : read.member.userId;
  return (
    read.guildId === command.guildId &&
    read.source.guild.id === command.guildId &&
    userId === command.userId
  );
}

export class DiscordGatewayBridge extends DurableObject<Env> {
  private readonly pending = new Map<string, PendingVoice>();
  private readonly livePending = new Map<string, PendingLive>();
  private readonly deliveries = new Map<string, Promise<void>>();
  private active: ActiveBridge | null = null;
  private epoch = 0;
  private offline: Record<string, number> = {};

  public constructor(
    private readonly state: DurableObjectState,
    env: Env,
  ) {
    super(state, env);
    void state.blockConcurrencyWhile(async () => {
      this.active = (await state.storage.get<ActiveBridge>(ACTIVE_KEY)) ?? null;
      this.epoch = (await state.storage.get<number>(EPOCH_KEY)) ?? 0;
      this.offline = (await state.storage.get<Record<string, number>>(OFFLINE_KEY)) ?? {};
    });
  }
  public async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/connect') return this.acceptGateway(request);
    if (pathname === '/command') return this.command(request);
    if (pathname === '/live-command') return this.liveCommand(request);
    return new Response(null, { status: 404 });
  }
  public async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || encoder.encode(raw).byteLength > LIVE_FRAME_MAX_BYTES) {
      await this.rejectSocket(socket, typeof raw === 'string' ? 1009 : 1003);
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      await this.rejectSocket(socket, 1007);
      return;
    }
    const parsed = serverBridgeMessageSchema.safeParse(value);
    if (!parsed.success) {
      await this.rejectSocket(socket, 1007);
      return;
    }
    const message = parsed.data;
    if (message.type === 'hello') {
      if (attachmentOf(socket).epoch >= 0 && !this.isActive(socket)) {
        socket.close(1008, 'Gateway superseded');
        return;
      }
      await this.activate(socket, message);
      return;
    }
    if (!this.isActive(socket)) {
      socket.close(1008, 'Gateway superseded');
      return;
    }
    const active = this.active!;
    if (active.protocolVersion === 2 && Date.now() - active.lastHeartbeat >= HEARTBEAT_STALE_MS) {
      await this.rejectSocket(socket, 1012);
      return;
    }
    if (message.type === 'command-result') {
      const pending = this.pending.get(message.requestId);
      if (pending?.epoch === active.epoch) {
        clearTimeout(pending.timeout);
        this.pending.delete(message.requestId);
        pending.resolve(message);
      }
      return;
    }
    if (message.type === 'live-command-result') {
      if (!this.supportsLive(active)) {
        await this.rejectSocket(socket, 1008);
        return;
      }
      const pending = this.livePending.get(message.result.requestId);
      if (pending === undefined || pending.epoch !== active.epoch) return;
      const command = pending.command;
      const result = message.result;
      const expectedType =
        command.type === 'world-read'
          ? 'world-result'
          : command.type === 'world-release'
            ? 'release-result'
            : 'channel-result';
      if (
        message.guildId !== command.guildId ||
        message.userId !== command.userId ||
        message.commandType !== command.type ||
        (result.type !== 'live-error' && result.type !== expectedType) ||
        (result.type === 'world-result' && !readMatches(result.result, command)) ||
        (result.type === 'channel-result' &&
          (result.result.requestId !== command.requestId ||
            (result.read !== null && !readMatches(result.read, command))))
      ) {
        await this.rejectSocket(socket, 1008);
        return;
      }
      // Once known, a confirmed write remains applied even if subsequent delivery fails.
      clearTimeout(pending.timeout);
      this.livePending.delete(result.requestId);
      pending.resolve(result);
      return;
    }
    const sessionId =
      message.type === 'voice-state' ? message.state.serviceSessionId : message.serviceSessionId;
    if (sessionId !== active.serviceSessionId) {
      await this.rejectSocket(socket, 1008);
      return;
    }
    if (message.type === 'live-heartbeat') {
      if (!this.supportsLive(active)) {
        await this.rejectSocket(socket, 1008);
        return;
      }
      active.lastHeartbeat = Date.now();
      await this.state.storage.put(ACTIVE_KEY, active);
      await this.scheduleAlarm();
      return;
    }
    if (!active.guildKeys.includes(message.guildKey)) {
      await this.rejectSocket(socket, 1008);
      return;
    }
    if (
      message.type === 'world-source' ||
      message.type === 'world-member' ||
      message.type === 'world-health'
    ) {
      if (!this.supportsLive(active)) {
        await this.rejectSocket(socket, 1008);
        return;
      }
      await this.ordered(message.guildKey, async () => {
        if (!this.isActive(socket) || this.active?.epoch !== active.epoch) return;
        try {
          if (
            message.type === 'world-source' &&
            (await this.guildKey(message.source.guild.id)) !== message.guildKey
          )
            throw new Error('LIVE_GUILD_MISMATCH');
          if (!this.isActive(socket) || this.active?.epoch !== active.epoch) return;
          await this.post(message.guildKey, '/internal/live-frame', {
            bridgeEpoch: active.epoch,
            message,
          });
        } catch {
          // Revoke synchronously before a later sequence is eligible in this lane.
          this.state.waitUntil(this.deactivate(socket));
          socket.close(1011, 'Live delivery unavailable');
        }
      });
      return;
    }
    if (message.type === 'guild-structure-changed') {
      await this.post(message.guildKey, '/internal/channels-changed');
      return;
    }
    await this.post(message.guildKey, '/internal/voice', { bridgeEpoch: active.epoch, message });
  }
  public async webSocketClose(socket: WebSocket): Promise<void> {
    await this.deactivate(socket);
  }
  public async webSocketError(socket: WebSocket): Promise<void> {
    await this.deactivate(socket);
  }
  public async alarm(): Promise<void> {
    const socket = this.readySocket();
    if (
      this.active?.protocolVersion === 2 &&
      Date.now() - this.active.lastHeartbeat >= HEARTBEAT_STALE_MS
    ) {
      if (socket !== null) {
        await this.deactivate(socket);
        socket.close(1012, 'Live heartbeat expired');
      } else await this.deactivateActive();
    }
    await Promise.all(
      Object.entries(this.offline).map(([guildKey, epoch]) =>
        this.ordered(guildKey, () => this.deliverOffline(guildKey, epoch)),
      ),
    );
    await this.scheduleAlarm();
  }
  private acceptGateway(request: Request): Response {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({
      ready: false,
      epoch: -1,
      serviceSessionId: null,
      protocolVersion: 1,
      capabilities: [],
    } satisfies GatewayAttachment);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  private async command(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const body = await request.text();
    if (encoder.encode(body).byteLength > 2_048) return new Response(null, { status: 413 });
    let value: unknown;
    try {
      value = JSON.parse(body) as unknown;
    } catch {
      return new Response(null, { status: 400 });
    }
    const parsed = gatewayCommandSchema.safeParse(value);
    if (!parsed.success) return new Response(null, { status: 400 });
    const socket = this.readySocket();
    if (
      socket === null ||
      this.pending.size + this.livePending.size >= 200 ||
      this.pending.has(parsed.data.requestId) ||
      this.livePending.has(parsed.data.requestId)
    )
      return Response.json({ errorCode: 'GATEWAY_UNAVAILABLE' }, { status: 503 });
    let timedOut = false;
    const result = await new Promise<GatewayCommandResult | null>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(parsed.data.requestId);
        timedOut = true;
        resolve(null);
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(parsed.data.requestId, { resolve, timeout, epoch: this.active!.epoch });
      try {
        socket.send(JSON.stringify(parsed.data));
      } catch {
        clearTimeout(timeout);
        this.pending.delete(parsed.data.requestId);
        resolve(null);
      }
    });
    if (result === null)
      return Response.json(
        { errorCode: timedOut ? 'ACTION_TIMEOUT' : 'GATEWAY_UNAVAILABLE' },
        { status: timedOut ? 504 : 503 },
      );
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  }
  private async liveCommand(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const body = await request.text();
    if (encoder.encode(body).byteLength > LIVE_COMMAND_MAX_BYTES)
      return new Response(null, { status: 413 });
    let value: unknown;
    try {
      value = JSON.parse(body) as unknown;
    } catch {
      return new Response(null, { status: 400 });
    }
    const parsed = liveCommandSchema.safeParse(value);
    if (!parsed.success) return new Response(null, { status: 400 });
    const command = parsed.data;
    if (
      command.type === 'channel-mutate' &&
      encoder.encode(JSON.stringify(command.input)).byteLength > LIVE_MUTATION_MAX_BYTES
    )
      return new Response(null, { status: 413 });
    const socket = this.readySocket();
    const active = this.active;
    if (socket !== null && active !== null && !this.supportsLive(active))
      return Response.json({ error: { code: 'GATEWAY_UPDATE_REQUIRED' } }, { status: 503 });
    if (socket === null || active === null) return Response.json(unavailable(command));
    if (Date.now() - active.lastHeartbeat >= HEARTBEAT_STALE_MS) {
      await this.rejectSocket(socket, 1012);
      return Response.json(unavailable(command));
    }
    const guildKey = await this.guildKey(command.guildId);
    if (
      !this.isActive(socket) ||
      this.active?.epoch !== active.epoch ||
      !active.guildKeys.includes(guildKey) ||
      command.expiresAt <= Date.now() ||
      command.expiresAt > Date.now() + 6_000 ||
      this.pending.size + this.livePending.size >= 200 ||
      [...this.livePending.values()].filter(
        (pending) => pending.command.guildId === command.guildId,
      ).length >= 20 ||
      this.pending.has(command.requestId) ||
      this.livePending.has(command.requestId)
    )
      return Response.json(unavailable(command));
    const result = await new Promise<LiveCommandResult>((resolve) => {
      const pending: PendingLive = {
        epoch: active.epoch,
        command,
        sent: false,
        resolve,
        timeout: setTimeout(() => {
          this.livePending.delete(command.requestId);
          resolve(unavailable(command, pending.sent));
        }, COMMAND_TIMEOUT_MS),
      };
      this.livePending.set(command.requestId, pending);
      try {
        socket.send(JSON.stringify(command));
        pending.sent = true;
      } catch {
        clearTimeout(pending.timeout);
        this.livePending.delete(command.requestId);
        resolve(unavailable(command));
      }
    });
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  }
  private supportsLive(attachment: GatewayAttachment): boolean {
    return attachment.protocolVersion === 2 && attachment.capabilities.includes('live-world-v1');
  }
  private isActive(socket: WebSocket): boolean {
    const attachment = attachmentOf(socket);
    return (
      this.active !== null &&
      attachment.ready &&
      attachment.epoch === this.active.epoch &&
      attachment.serviceSessionId === this.active.serviceSessionId
    );
  }
  private readySocket(): WebSocket | null {
    return (
      this.state
        .getWebSockets()
        .find((socket) => socket.readyState === WebSocket.OPEN && this.isActive(socket)) ?? null
    );
  }
  private async activate(
    socket: WebSocket,
    message: Extract<ServerBridgeMessage, { type: 'hello' }>,
  ): Promise<void> {
    const previous = this.active;
    const epoch = ++this.epoch;
    if (!Number.isSafeInteger(epoch)) {
      socket.close(1011, 'Bridge generation exhausted');
      return;
    }
    this.failPendingCommands();
    for (const existing of this.state.getWebSockets()) {
      if (existing !== socket && attachmentOf(existing).ready) {
        existing.serializeAttachment({ ...attachmentOf(existing), ready: false });
        existing.close(1012, 'Gateway replaced');
      }
    }
    const active: ActiveBridge = {
      ready: true,
      epoch,
      serviceSessionId: message.serviceSessionId,
      protocolVersion: message.protocolVersion,
      capabilities: message.protocolVersion === 2 ? message.capabilities : [],
      guildKeys: message.guildKeys,
      lastHeartbeat: Date.now(),
    };
    this.active = active;
    socket.serializeAttachment(active);
    // Reserve each guild's lane before awaiting storage or network operations.
    const deliveries: Promise<unknown>[] = [];
    if (previous !== null && this.supportsLive(previous)) {
      for (const guildKey of previous.guildKeys) {
        this.offline[guildKey] = previous.epoch;
        deliveries.push(
          this.ordered(guildKey, () => this.deliverOffline(guildKey, previous.epoch)),
        );
      }
    }
    for (const guildKey of new Set([...(previous?.guildKeys ?? []), ...active.guildKeys])) {
      const service = active.guildKeys.includes(guildKey) ? 'online' : 'offline';
      deliveries.push(
        this.post(guildKey, '/internal/voice-service', { bridgeEpoch: epoch, service }).catch(
          () => undefined,
        ),
      );
      if (this.supportsLive(active) && service === 'online')
        deliveries.push(
          this.ordered(guildKey, async () => {
            if (!this.isActive(socket) || this.active?.epoch !== epoch) return;
            try {
              const missing = this.offline[guildKey];
              if (missing !== undefined) {
                await this.deliverOffline(guildKey, missing);
                if (this.offline[guildKey] !== undefined) throw new Error('LIVE_DELIVERY_FAILED');
              }
              await this.post(guildKey, '/internal/live-service', {
                bridgeEpoch: epoch,
                service: 'online',
              });
            } catch {
              this.state.waitUntil(this.deactivate(socket));
              socket.close(1011, 'Live delivery unavailable');
            }
          }),
        );
    }
    await this.state.storage.put({
      [ACTIVE_KEY]: active,
      [EPOCH_KEY]: epoch,
      [OFFLINE_KEY]: this.offline,
    });
    await Promise.all(deliveries);
    await this.scheduleAlarm();
  }
  private async rejectSocket(socket: WebSocket, code: number): Promise<void> {
    const lost = this.deactivate(socket);
    socket.close(code, 'Invalid or unavailable bridge');
    await lost;
  }
  private deactivate(socket: WebSocket): Promise<void> {
    if (!this.isActive(socket)) return Promise.resolve();
    socket.serializeAttachment({ ...attachmentOf(socket), ready: false });
    return this.deactivateActive();
  }
  private async deactivateActive(): Promise<void> {
    const previous = this.active;
    if (previous === null) return;
    this.active = null;
    this.failPendingCommands();
    const deliveries = previous.guildKeys.map((guildKey) => {
      const voice = this.post(guildKey, '/internal/voice-service', {
        bridgeEpoch: previous.epoch,
        service: 'offline',
      }).catch(() => undefined);
      if (!this.supportsLive(previous)) return voice;
      this.offline[guildKey] = previous.epoch;
      return Promise.all([
        voice,
        this.ordered(guildKey, () => this.deliverOffline(guildKey, previous.epoch)),
      ]);
    });
    await this.state.storage.put({ [ACTIVE_KEY]: null, [OFFLINE_KEY]: this.offline });
    await Promise.all(deliveries);
    await this.scheduleAlarm();
  }
  private async deliverOffline(guildKey: string, epoch: number): Promise<void> {
    if (this.offline[guildKey] !== epoch) return;
    try {
      await this.post(guildKey, '/internal/live-service', {
        bridgeEpoch: epoch,
        service: 'offline',
      });
      if (this.offline[guildKey] === epoch) delete this.offline[guildKey];
    } catch {
      /* Persist revocation for an alarm retry; never treat failure as delivered. */
    }
    await this.state.storage.put(OFFLINE_KEY, this.offline);
  }
  private async scheduleAlarm(): Promise<void> {
    const heartbeat =
      this.active?.protocolVersion === 2
        ? this.active.lastHeartbeat + HEARTBEAT_STALE_MS
        : Infinity;
    const retry = Object.keys(this.offline).length > 0 ? Date.now() + 25_000 : Infinity;
    const next = Math.min(heartbeat, retry);
    if (Number.isFinite(next)) await this.state.storage.setAlarm(Math.max(Date.now() + 1, next));
    else await this.state.storage.deleteAlarm();
  }
  private ordered(guildKey: string, action: () => Promise<void>): Promise<void> {
    const previous = this.deliveries.get(guildKey) ?? Promise.resolve();
    const next = previous.then(action);
    this.deliveries.set(guildKey, next);
    void next
      .finally(() => {
        if (this.deliveries.get(guildKey) === next) this.deliveries.delete(guildKey);
      })
      .catch(() => undefined);
    return next;
  }
  private async post(guildKey: string, path: string, body?: unknown): Promise<void> {
    const response = await this.env.WORLD_PRESENCE.getByName(guildKey).fetch(
      `https://presence.dmap${path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    if (!response.ok) throw new Error('BRIDGE_DELIVERY_FAILED');
  }
  private async guildKey(guildId: string): Promise<string> {
    const identifiers = await createIdentifierFactory(
      decodeBase64UrlSecret(this.env.SNAPSHOT_ID_SECRET),
    );
    return identifiers.for('guild', guildId);
  }
  private failPendingCommands(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.resolve(null);
    }
    this.pending.clear();
    for (const pending of this.livePending.values()) {
      clearTimeout(pending.timeout);
      pending.resolve(unavailable(pending.command, pending.sent));
    }
    this.livePending.clear();
  }
}
