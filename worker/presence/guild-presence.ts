import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

import { isAvatarId } from '../../src/domain/avatar/identity';
import {
  channelKeySchema,
  channelMutationInputSchema,
  worldSyncSchema,
  worldViewVersionSchema,
  type WorldSync,
  type WorldView,
} from '../../src/domain/channels/protocol';
import { LiveStructureCache } from '../channels/live-structure';
import { logChannelFailure } from '../channels/diagnostics';
import { liveFrameSchema, LIVE_FRAME_MAX_BYTES } from '../../src/domain/discord/live-protocol';
import { snowflakeSchema } from '../../src/domain/discord/source-schema';
import {
  clientPresenceMessageSchema,
  presencePlayerSchema,
  type PresencePlayer,
  type ServerPresenceMessage,
} from '../../src/domain/presence/protocol';
import {
  gatewayBridgeMessageSchema,
  voiceServiceStatusSchema,
  voiceStateSchema,
  type VoiceServiceStatus,
  type VoiceState,
} from '../../src/domain/voice/protocol';
import { LiveWorldCoordinator, WorldAccessError } from '../live-world/coordinator';
import { sessionIsCurrent, type WorldActor } from '../live-world/session-access';
import { sendDiscordGatewayCommand } from '../voice/bridge-client';

const MAX_CONNECTIONS = 200;
const MAX_MESSAGE_BYTES = 1_024;
const MAX_INTERNAL_BODY_BYTES = 8 * 1_024;
const WORLD_VIEW_EPOCH_KEY = 'worldViewEpoch';
const digestSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
const subscriptionIdSchema = z.uuid();
const safeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const bridgeEpochSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const internalVoiceMessageSchema = z.strictObject({
  bridgeEpoch: bridgeEpochSchema,
  message: gatewayBridgeMessageSchema,
});
const internalVoiceServiceSchema = z.strictObject({
  bridgeEpoch: bridgeEpochSchema,
  service: voiceServiceStatusSchema,
});
const worldActorSchema = z.strictObject({
  guildId: snowflakeSchema,
  userId: snowflakeSchema,
  sessionHash: digestSchema,
});
const internalLiveFrameSchema = z.strictObject({
  bridgeEpoch: bridgeEpochSchema,
  message: liveFrameSchema,
});
const internalLiveServiceSchema = z.strictObject({
  bridgeEpoch: bridgeEpochSchema,
  service: z.enum(['online', 'offline']),
});
const internalWorldViewSchema = z.strictObject({
  actor: worldActorSchema,
  subscriptionId: subscriptionIdSchema.optional(),
  watch: z.enum(['lease', 'connected']).optional(),
});
const internalWorldMutateSchema = z.strictObject({
  actor: worldActorSchema,
  input: channelMutationInputSchema,
});
const internalVoiceDestinationSchema = z.strictObject({
  actor: worldActorSchema,
  roomKey: channelKeySchema,
});
const MIN_MESSAGE_INTERVAL_MS = 25;

const socketAttachmentSchema = presencePlayerSchema.extend({
  active: z.boolean(),
  lastMessageAt: safeIntegerSchema,
  seq: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER),
  voiceState: voiceStateSchema.nullable(),
  guildId: snowflakeSchema,
  userId: snowflakeSchema,
  sessionHash: digestSchema,
  sessionExpiresAt: safeIntegerSchema,
  subscriptionId: subscriptionIdSchema,
  viewVersion: worldViewVersionSchema.nullable(),
});

type SocketAttachment = z.infer<typeof socketAttachmentSchema>;

interface ConnectionAdmission {
  actor: WorldActor;
  sessionExpiresAt: number;
  subscriptionId: string;
  presenceId: string;
  displayName: string;
  avatarId: SocketAttachment['avatarId'];
}

function readIdentityHeader(request: Request, name: string, maximumLength: number): string | null {
  const encoded = request.headers.get(name);
  if (encoded === null || encoded.length > maximumLength * 12) return null;
  try {
    const value = decodeURIComponent(encoded);
    // Discord display names must not inject C0/DEL controls into presence payloads.
    // eslint-disable-next-line no-control-regex
    if (value.length < 1 || value.length > maximumLength || /[\u0000-\u001f\u007f]/u.test(value)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function attachmentOf(socket: WebSocket): SocketAttachment | null {
  const parsed = socketAttachmentSchema.safeParse(socket.deserializeAttachment());
  return parsed.success ? parsed.data : null;
}

function playerFromAttachment(attachment: SocketAttachment): PresencePlayer {
  return {
    id: attachment.id,
    displayName: attachment.displayName,
    avatarId: attachment.avatarId,
    x: attachment.x,
    y: attachment.y,
    direction: attachment.direction,
    moving: attachment.moving,
    scene: attachment.scene,
  };
}

function actorFromAttachment(attachment: SocketAttachment): WorldActor {
  return {
    guildId: attachment.guildId,
    userId: attachment.userId,
    sessionHash: attachment.sessionHash,
  };
}

function roomKeyForScene(scene: string): string | null {
  return scene.startsWith('room:') ? scene.slice('room:'.length) : null;
}

function worldIncludesScene(view: WorldView, scene: string): boolean {
  const roomKey = roomKeyForScene(scene);
  return (
    roomKey === null ||
    view.snapshot.areas.some((area) => area.rooms.some((room) => room.key === roomKey))
  );
}

function worldSyncMessage(sync: WorldSync): ServerPresenceMessage {
  return { type: 'world-sync', sync: worldSyncSchema.parse(sync) };
}

export class GuildPresence extends DurableObject<Env> {
  private voiceService: VoiceServiceStatus = 'offline';
  private voiceBridgeEpoch = 0;
  private readonly liveStructure: LiveStructureCache;
  private coordinator!: LiveWorldCoordinator;
  private restoration: Promise<void> | null = null;
  private readonly initialVoiceQueries = new Map<string, Promise<VoiceState | null>>();

  public constructor(
    private readonly state: DurableObjectState,
    env: Env,
  ) {
    super(state, env);
    this.liveStructure = new LiveStructureCache(env);
    state.blockConcurrencyWhile(async () => {
      const [voiceService, voiceBridgeEpoch, previousWorldViewEpoch] = await Promise.all([
        state.storage.get<VoiceServiceStatus>('voiceService'),
        state.storage.get<number>('voiceBridgeEpoch'),
        state.storage.get<number>(WORLD_VIEW_EPOCH_KEY),
      ]);
      this.voiceService = voiceService ?? 'offline';
      this.voiceBridgeEpoch = voiceBridgeEpoch ?? 0;
      const worldViewEpoch = (previousWorldViewEpoch ?? 0) + 1;
      if (!Number.isSafeInteger(worldViewEpoch)) throw new Error('WORLD_VIEW_EPOCH_EXHAUSTED');
      await state.storage.put(WORLD_VIEW_EPOCH_KEY, worldViewEpoch);
      this.coordinator = new LiveWorldCoordinator(env, worldViewEpoch, (userId, view, sync) =>
        this.deliverWorld(userId, view, sync),
      );
    });
  }

  public async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/internal/channel-state') {
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      try {
        const text = await request.text();
        if (text.length > 128) return new Response(null, { status: 413 });
        const parsed = z.strictObject({ guildId: snowflakeSchema }).safeParse(JSON.parse(text));
        if (!parsed.success) return new Response(null, { status: 400 });
        return Response.json(await this.liveStructure.read(parsed.data.guildId), {
          headers: { 'cache-control': 'no-store' },
        });
      } catch (error) {
        logChannelFailure('live-structure', error);
        return new Response(null, { status: 503 });
      }
    }
    if (pathname === '/internal/channels-changed') {
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      // Protocol-v1 gateways still emit this. The v2 live owner advances only from live frames.
      return new Response(null, { status: 204 });
    }
    if (pathname === '/internal/live-frame') return this.receiveLiveFrame(request);
    if (pathname === '/internal/live-service') return this.receiveLiveService(request);
    if (pathname === '/internal/world-view') return this.readWorldView(request);
    if (pathname === '/internal/world-mutate') return this.mutateWorld(request);
    if (pathname === '/internal/voice-destination') return this.readVoiceDestination(request);
    if (pathname === '/internal/voice') return this.receiveVoice(request);
    if (pathname === '/internal/voice-service') return this.receiveVoiceService(request);
    if (pathname !== '/connect') return new Response(null, { status: 404 });
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    if (this.state.getWebSockets().length >= MAX_CONNECTIONS) {
      return new Response('This world is full.', { status: 503 });
    }

    const admission = this.readAdmission(request);
    if (admission === null) return new Response('Missing player identity.', { status: 401 });
    this.startRestoration();

    let view: WorldView;
    try {
      view = await this.coordinator.read(
        admission.actor,
        admission.subscriptionId,
        request.headers.get('upgrade')?.toLowerCase() === 'websocket' ? 'connected' : 'lease',
      );
    } catch (error) {
      return this.worldError(error);
    }
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ view }, { headers: { 'cache-control': 'no-store' } });
    }
    let voiceState = this.latestVoiceState(admission.presenceId, view);
    if (voiceState === null) {
      voiceState = await this.initialVoiceState(admission.actor, view);
      if (
        admission.sessionExpiresAt <= Math.floor(Date.now() / 1_000) ||
        !(await sessionIsCurrent(this.env, admission.actor, Date.now())) ||
        this.coordinator.currentView(admission.actor) !== view
      ) {
        await this.demoteFailedAdmission(admission);
        return this.worldError(new WorldAccessError('UNAUTHENTICATED', 401));
      }
    }
    if (this.state.getWebSockets().length >= MAX_CONNECTIONS) {
      await this.demoteFailedAdmission(admission);
      return new Response('This world is full.', { status: 503 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment: SocketAttachment = {
      id: admission.presenceId,
      displayName: admission.displayName,
      avatarId: admission.avatarId,
      x: 0,
      y: 0,
      direction: 'down',
      moving: false,
      scene: 'exterior',
      active: false,
      lastMessageAt: 0,
      seq: -1,
      voiceState,
      ...admission.actor,
      sessionExpiresAt: admission.sessionExpiresAt,
      subscriptionId: admission.subscriptionId,
      viewVersion: view.version,
    };

    try {
      this.state.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      this.send(server, {
        type: 'welcome',
        selfId: attachment.id,
        selfAvatarId: attachment.avatarId,
        players: this.activePlayers(attachment, view),
        voiceService: this.voiceService,
        voiceState: attachment.voiceState,
        worldView: view,
      });
    } catch {
      await this.demoteFailedAdmission(admission);
      throw new Error('SOCKET_ADMISSION_FAILED');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  public webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): void {
    if (typeof raw !== 'string') {
      socket.close(1003, 'Text messages only');
      return;
    }
    if (raw.length > MAX_MESSAGE_BYTES) {
      socket.close(1009, 'Message too large');
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      socket.close(1007, 'Invalid message');
      return;
    }
    const parsed = clientPresenceMessageSchema.safeParse(value);
    if (!parsed.success) {
      socket.close(1007, 'Invalid message');
      return;
    }

    let previous = attachmentOf(socket);
    if (previous === null) {
      socket.close(1011, 'Missing connection state');
      return;
    }
    const view = this.authorizeSocket(socket, previous);
    if (view === null || !worldIncludesScene(view, parsed.data.scene)) return;
    previous = attachmentOf(socket);
    if (previous === null) return;
    const now = Date.now();
    if (parsed.data.seq <= previous.seq || now - previous.lastMessageAt < MIN_MESSAGE_INTERVAL_MS) {
      return;
    }

    const next: SocketAttachment = {
      ...previous,
      x: parsed.data.x,
      y: parsed.data.y,
      direction: parsed.data.direction,
      moving: parsed.data.moving,
      scene: parsed.data.scene,
      active: true,
      lastMessageAt: now,
      seq: parsed.data.seq,
    };
    socket.serializeAttachment(next);
    this.broadcast(
      {
        type: 'player',
        player: playerFromAttachment(next),
      },
      socket,
      next.scene,
    );
  }

  public webSocketClose(socket: WebSocket): void {
    this.broadcastLeave(socket);
    this.releaseSocket(socket);
  }

  public webSocketError(socket: WebSocket): void {
    this.broadcastLeave(socket);
    this.releaseSocket(socket);
  }

  private activePlayers(recipient: SocketAttachment, view: WorldView): PresencePlayer[] {
    const latestByMember = new Map<string, SocketAttachment>();
    for (const socket of this.state.getWebSockets()) {
      const attachment = attachmentOf(socket);
      const candidateView =
        attachment === null ? null : this.coordinator.currentView(actorFromAttachment(attachment));
      if (
        !attachment?.active ||
        attachment.id === recipient.id ||
        !this.attachmentExpiryIsCurrent(attachment) ||
        candidateView === null ||
        !worldIncludesScene(candidateView, attachment.scene) ||
        !worldIncludesScene(view, attachment.scene)
      )
        continue;
      const current = latestByMember.get(attachment.id);
      if (!current || attachment.lastMessageAt >= current.lastMessageAt) {
        latestByMember.set(attachment.id, attachment);
      }
    }
    return [...latestByMember.values()].map(playerFromAttachment);
  }

  private broadcastLeave(socket: WebSocket): void {
    const attachment = attachmentOf(socket);
    if (!attachment?.active) return;
    const replacement = this.latestActiveConnection(attachment.id, socket);
    this.broadcast(
      replacement
        ? { type: 'player', player: playerFromAttachment(replacement) }
        : { type: 'leave', id: attachment.id },
      socket,
      replacement?.scene,
    );
  }

  private latestActiveConnection(
    memberId: string,
    excludedSocket: WebSocket,
  ): SocketAttachment | null {
    let latest: SocketAttachment | null = null;
    for (const socket of this.state.getWebSockets()) {
      if (socket === excludedSocket) continue;
      const attachment = attachmentOf(socket);
      const view =
        attachment === null ? null : this.coordinator.currentView(actorFromAttachment(attachment));
      if (
        !attachment?.active ||
        attachment.id !== memberId ||
        !this.attachmentExpiryIsCurrent(attachment) ||
        view === null ||
        !worldIncludesScene(view, attachment.scene)
      )
        continue;
      if (!latest || attachment.lastMessageAt >= latest.lastMessageAt) latest = attachment;
    }
    return latest;
  }

  private latestVoiceState(memberId: string, view: WorldView): VoiceState | null {
    let latest: VoiceState | null = null;
    for (const socket of this.state.getWebSockets()) {
      const attachment = attachmentOf(socket);
      const state = attachment?.voiceState;
      if (
        attachment?.id !== memberId ||
        state === null ||
        state === undefined ||
        !this.voiceStateIsAllowed(attachment, view, state)
      )
        continue;
      if (
        latest === null ||
        latest.serviceSessionId !== state.serviceSessionId ||
        state.revision >= latest.revision
      ) {
        latest = state;
      }
    }
    return latest;
  }

  private async initialVoiceState(actor: WorldActor, view: WorldView): Promise<VoiceState | null> {
    const key = `${actor.guildId}:${actor.userId}`;
    let pending = this.initialVoiceQueries.get(key);
    if (pending === undefined) {
      pending = sendDiscordGatewayCommand(this.env, {
        type: 'voice-query',
        guildId: actor.guildId,
        userId: actor.userId,
      })
        .then((outcome) =>
          outcome.service === 'online' && outcome.result?.ok === true ? outcome.result.state : null,
        )
        .catch(() => null);
      this.initialVoiceQueries.set(key, pending);
      void pending.finally(() => {
        if (this.initialVoiceQueries.get(key) === pending) this.initialVoiceQueries.delete(key);
      });
    }
    const state = await pending;
    if (state === null || this.voiceStateIsAllowedFor(actor, view, state)) return state;
    return { ...state, channelKey: null };
  }

  private readAdmission(request: Request): ConnectionAdmission | null {
    const displayName = readIdentityHeader(request, 'x-dmap-display-name', 100);
    const avatarId = readIdentityHeader(request, 'x-dmap-avatar-id', 32);
    const presenceId = readIdentityHeader(request, 'x-dmap-presence-id', 64);
    const parsed = z
      .strictObject({
        guildId: snowflakeSchema,
        userId: snowflakeSchema,
        sessionHash: digestSchema,
        sessionExpiresAt: safeIntegerSchema,
        subscriptionId: subscriptionIdSchema.optional(),
      })
      .safeParse({
        guildId: request.headers.get('x-dmap-guild-id'),
        userId: request.headers.get('x-dmap-user-id'),
        sessionHash: request.headers.get('x-dmap-session-hash'),
        sessionExpiresAt: this.readIntegerHeader(request, 'x-dmap-session-expires-at'),
        subscriptionId: request.headers.get('x-dmap-subscription-id') ?? undefined,
      });
    if (
      displayName === null ||
      avatarId === null ||
      !isAvatarId(avatarId) ||
      presenceId === null ||
      !/^p_[A-Za-z0-9_-]{43}$/u.test(presenceId) ||
      !parsed.success ||
      parsed.data.sessionExpiresAt <= Math.floor(Date.now() / 1_000)
    )
      return null;
    const actor = {
      guildId: parsed.data.guildId,
      userId: parsed.data.userId,
      sessionHash: parsed.data.sessionHash,
    };
    return {
      actor,
      sessionExpiresAt: parsed.data.sessionExpiresAt,
      subscriptionId:
        parsed.data.subscriptionId ?? this.coordinator.subscriptionId(parsed.data.userId),
      presenceId,
      displayName,
      avatarId,
    };
  }

  private readIntegerHeader(request: Request, name: string): number | null {
    const value = request.headers.get(name);
    if (value === null || !/^(?:0|[1-9]\d{0,15})$/u.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  private async readJson(request: Request, maximumBytes: number): Promise<unknown | null> {
    if (request.method !== 'POST') return null;
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > maximumBytes) return null;
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return null;
    }
  }

  private async receiveLiveFrame(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const value = await this.readJson(request, LIVE_FRAME_MAX_BYTES + 1_024);
    const parsed = internalLiveFrameSchema.safeParse(value);
    if (!parsed.success) return new Response(null, { status: 400 });
    this.startRestoration();
    await this.coordinator.accept(parsed.data.message, parsed.data.bridgeEpoch);
    this.state.waitUntil(this.coordinator.pendingWork());
    return new Response(null, { status: 204 });
  }

  private async receiveLiveService(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const value = await this.readJson(request, 1_024);
    const parsed = internalLiveServiceSchema.safeParse(value);
    if (!parsed.success) return new Response(null, { status: 400 });
    this.startRestoration();
    await this.coordinator.service(parsed.data.service === 'online', parsed.data.bridgeEpoch);
    this.state.waitUntil(this.coordinator.pendingWork());
    return new Response(null, { status: 204 });
  }

  private async readWorldView(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const value = await this.readJson(request, MAX_INTERNAL_BODY_BYTES);
    const parsed = internalWorldViewSchema.safeParse(value);
    if (!parsed.success) return new Response(null, { status: 400 });
    try {
      const subscriptionId =
        parsed.data.subscriptionId ?? this.coordinator.subscriptionId(parsed.data.actor.userId);
      const view = await this.coordinator.read(
        parsed.data.actor,
        subscriptionId,
        parsed.data.watch,
      );
      return Response.json({ view }, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      return this.worldError(error);
    }
  }

  private async mutateWorld(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const value = await this.readJson(request, MAX_INTERNAL_BODY_BYTES);
    const parsed = internalWorldMutateSchema.safeParse(value);
    if (!parsed.success) return new Response(null, { status: 400 });
    try {
      return Response.json(await this.coordinator.mutate(parsed.data.actor, parsed.data.input), {
        headers: { 'cache-control': 'no-store' },
      });
    } catch (error) {
      return this.worldError(error);
    }
  }

  private async readVoiceDestination(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const value = await this.readJson(request, MAX_INTERNAL_BODY_BYTES);
    const parsed = internalVoiceDestinationSchema.safeParse(value);
    if (!parsed.success) return new Response(null, { status: 400 });
    try {
      return Response.json(
        await this.coordinator.voiceDestination(parsed.data.actor, parsed.data.roomKey),
        { headers: { 'cache-control': 'no-store' } },
      );
    } catch (error) {
      return this.worldError(error);
    }
  }

  private worldError(error: unknown): Response {
    const failure =
      error instanceof WorldAccessError
        ? error
        : new WorldAccessError('WORLD_SOURCE_UNAVAILABLE', 503);
    return Response.json(
      {
        error: {
          code: failure.code,
          ...(failure.retryAt === undefined ? {} : { retryAt: failure.retryAt }),
          ...(failure.scope === undefined ? {} : { scope: failure.scope }),
        },
      },
      { status: failure.status, headers: { 'cache-control': 'no-store' } },
    );
  }

  private startRestoration(): void {
    if (this.restoration !== null) return;
    const groups = new Map<string, Array<{ socket: WebSocket; attachment: SocketAttachment }>>();
    for (const socket of this.state.getWebSockets()) {
      const attachment = attachmentOf(socket);
      if (attachment === null) {
        socket.close(1008, 'Invalid connection state');
        continue;
      }
      const key = `${attachment.guildId}:${attachment.userId}:${attachment.subscriptionId}`;
      const group = groups.get(key) ?? [];
      group.push({ socket, attachment });
      groups.set(key, group);
    }
    const restoration = Promise.all(
      [...groups.values()].map((connections) => this.restoreSubscription(connections)),
    ).then(() => undefined);
    this.restoration = restoration;
    this.state.waitUntil(restoration);
  }

  private async restoreSubscription(
    connections: Array<{ socket: WebSocket; attachment: SocketAttachment }>,
  ): Promise<void> {
    for (const { socket, attachment } of connections) {
      if (!this.attachmentExpiryIsCurrent(attachment)) {
        this.denySocket(socket, 'UNAUTHENTICATED');
        continue;
      }
      const actor = actorFromAttachment(attachment);
      if (!(await sessionIsCurrent(this.env, actor, Date.now()))) {
        if (attachmentOf(socket)?.sessionHash === attachment.sessionHash)
          this.denySocket(socket, 'UNAUTHENTICATED');
        continue;
      }
      try {
        const view = await this.coordinator.read(actor, attachment.subscriptionId, 'connected');
        await this.deliverWorld(attachment.userId, view, { state: 'ready' });
        return;
      } catch (error) {
        const sync = this.syncForError(error);
        if (sync.state === 'denied') this.denySocket(socket, sync.code);
        else if (socket.readyState === WebSocket.OPEN) this.send(socket, worldSyncMessage(sync));
      }
    }
  }

  private syncForError(error: unknown): WorldSync {
    if (error instanceof WorldAccessError) {
      if (error.code === 'UNAUTHENTICATED' || error.code === 'GUILD_MEMBERSHIP_REQUIRED')
        return { state: 'denied', code: error.code };
      if (error.retryAt !== undefined)
        return {
          state: 'cooldown',
          scope: error.scope ?? 'admission',
          retryAt: error.retryAt,
          code: error.code,
        };
      if (error.code === 'GATEWAY_UPDATE_REQUIRED')
        return { state: 'offline', code: 'GATEWAY_UPDATE_REQUIRED' };
    }
    return { state: 'recovering', code: 'WORLD_SOURCE_UNAVAILABLE' };
  }

  private authorizeSocket(socket: WebSocket, attachment: SocketAttachment): WorldView | null {
    this.startRestoration();
    if (!this.attachmentExpiryIsCurrent(attachment)) {
      this.denySocket(socket, 'UNAUTHENTICATED');
      return null;
    }
    // Movement never initiates a gateway read. Cold restoration and live recovery are coalesced.
    return this.coordinator.currentView(actorFromAttachment(attachment));
  }

  private async deliverWorld(
    userId: string,
    view: WorldView | null,
    sync: WorldSync,
  ): Promise<void> {
    const sockets = this.state
      .getWebSockets()
      .filter((socket) => attachmentOf(socket)?.userId === userId);
    for (const socket of sockets) {
      const attachment = attachmentOf(socket);
      if (attachment === null) continue;
      const actor = actorFromAttachment(attachment);
      if (
        !this.attachmentExpiryIsCurrent(attachment) ||
        !(await sessionIsCurrent(this.env, actor, Date.now()))
      ) {
        const latest = attachmentOf(socket);
        if (latest?.sessionHash === attachment.sessionHash)
          this.denySocket(socket, 'UNAUTHENTICATED');
        continue;
      }
      const latest = attachmentOf(socket);
      if (
        latest === null ||
        latest.sessionHash !== attachment.sessionHash ||
        this.coordinator.currentView(actor) !== view
      )
        continue;
      let next = latest;
      if (view !== null) {
        if (!worldIncludesScene(view, next.scene)) {
          if (next.active) this.broadcastLeave(socket);
          next = { ...next, scene: 'exterior', active: false };
        }
        if (next.voiceState !== null && !this.voiceStateIsAllowed(next, view, next.voiceState)) {
          const cleared = { ...next.voiceState, channelKey: null };
          next = { ...next, voiceState: cleared };
          if (socket.readyState === WebSocket.OPEN)
            this.send(socket, { type: 'voice-state', state: cleared });
        }
        const sameVersion =
          next.viewVersion?.epoch === view.version.epoch &&
          next.viewVersion.revision === view.version.revision;
        next = { ...next, viewVersion: view.version };
        socket.serializeAttachment(next);
        if (!sameVersion && socket.readyState === WebSocket.OPEN)
          this.send(socket, { type: 'world-view', view });
      } else {
        if (next.active) this.broadcastLeave(socket);
        next = { ...next, viewVersion: null, voiceState: null, active: false, scene: 'exterior' };
        socket.serializeAttachment(next);
      }
      if (socket.readyState === WebSocket.OPEN) this.send(socket, worldSyncMessage(sync));
      if (sync.state === 'denied') socket.close(1008, sync.code);
    }
  }

  private denySocket(
    socket: WebSocket,
    code: 'UNAUTHENTICATED' | 'GUILD_MEMBERSHIP_REQUIRED',
  ): void {
    if (socket.readyState === WebSocket.OPEN)
      this.send(socket, { type: 'world-sync', sync: { state: 'denied', code } });
    socket.close(1008, code);
  }

  private attachmentExpiryIsCurrent(attachment: SocketAttachment): boolean {
    return attachment.sessionExpiresAt > Math.floor(Date.now() / 1_000);
  }

  private attachmentIsLocallyCurrent(attachment: SocketAttachment): boolean {
    return (
      this.attachmentExpiryIsCurrent(attachment) &&
      this.coordinator.currentView(actorFromAttachment(attachment)) !== null
    );
  }

  private async demoteFailedAdmission(admission: ConnectionAdmission): Promise<void> {
    const retained = this.state.getWebSockets().some((socket) => {
      if (socket.readyState !== WebSocket.OPEN) return false;
      const attachment = attachmentOf(socket);
      return (
        attachment?.userId === admission.actor.userId &&
        attachment.guildId === admission.actor.guildId &&
        attachment.subscriptionId === admission.subscriptionId
      );
    });
    if (!retained) await this.coordinator.release(admission.actor.userId, admission.subscriptionId);
  }

  private releaseSocket(socket: WebSocket): void {
    const attachment = attachmentOf(socket);
    if (attachment === null) return;
    const retained = this.state.getWebSockets().some((candidate) => {
      if (candidate === socket || candidate.readyState !== WebSocket.OPEN) return false;
      const other = attachmentOf(candidate);
      return (
        other?.guildId === attachment.guildId &&
        other.userId === attachment.userId &&
        other.subscriptionId === attachment.subscriptionId
      );
    });
    if (!retained)
      this.state.waitUntil(this.coordinator.release(attachment.userId, attachment.subscriptionId));
  }

  private voiceStateIsAllowed(
    attachment: SocketAttachment,
    view: WorldView,
    state: VoiceState,
  ): boolean {
    return this.voiceStateIsAllowedFor(actorFromAttachment(attachment), view, state);
  }

  private voiceStateIsAllowedFor(actor: WorldActor, view: WorldView, state: VoiceState): boolean {
    return (
      state.channelKey === null ||
      (worldIncludesScene(view, `room:${state.channelKey}`) &&
        this.coordinator.canOccupyRoom(actor, state.channelKey))
    );
  }

  private async receiveVoice(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const body = await request.text();
    if (body.length > 768 * 1_024) return new Response(null, { status: 413 });
    let value: unknown;
    try {
      value = JSON.parse(body) as unknown;
    } catch {
      return new Response(null, { status: 400 });
    }
    const parsed = internalVoiceMessageSchema.safeParse(value);
    if (
      !parsed.success ||
      (parsed.data.message.type !== 'voice-state' && parsed.data.message.type !== 'voice-snapshot')
    ) {
      return new Response(null, { status: 400 });
    }
    this.startRestoration();
    if (parsed.data.bridgeEpoch < this.voiceBridgeEpoch) {
      return new Response(null, { status: 204 });
    }
    if (parsed.data.bridgeEpoch > this.voiceBridgeEpoch) {
      await this.setVoiceService('online', parsed.data.bridgeEpoch);
    } else if (this.voiceService === 'offline') {
      return new Response(null, { status: 204 });
    }

    const message = parsed.data.message;
    if (message.type === 'voice-state') {
      this.applyVoiceState(message.presenceId, message.state);
    } else {
      const byPresence = new Map(
        message.states.map(({ presenceId, state }) => [presenceId, state]),
      );
      for (const socket of this.state.getWebSockets()) {
        const attachment = attachmentOf(socket);
        if (attachment === null) continue;
        const next = byPresence.get(attachment.id) ?? {
          serviceSessionId: message.serviceSessionId,
          revision: message.revision,
          channelKey: null,
          selfMute: false,
          selfDeaf: false,
          serverMute: false,
          serverDeaf: false,
          suppress: false,
        };
        this.applyVoiceStateToSocket(socket, attachment, next);
      }
    }
    return new Response(null, { status: 204 });
  }

  private async receiveVoiceService(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    let value: unknown;
    try {
      value = (await request.json()) as unknown;
    } catch {
      return new Response(null, { status: 400 });
    }
    const parsed = internalVoiceServiceSchema.safeParse(value);
    if (!parsed.success) return new Response(null, { status: 400 });
    this.startRestoration();
    if (parsed.data.bridgeEpoch < this.voiceBridgeEpoch) {
      return new Response(null, { status: 204 });
    }
    if (
      parsed.data.bridgeEpoch === this.voiceBridgeEpoch &&
      this.voiceService === 'offline' &&
      parsed.data.service === 'online'
    ) {
      return new Response(null, { status: 204 });
    }
    await this.setVoiceService(parsed.data.service, parsed.data.bridgeEpoch);
    return new Response(null, { status: 204 });
  }

  private async setVoiceService(service: VoiceServiceStatus, bridgeEpoch: number): Promise<void> {
    const changed = service !== this.voiceService || bridgeEpoch !== this.voiceBridgeEpoch;
    this.voiceService = service;
    this.voiceBridgeEpoch = bridgeEpoch;
    await this.state.storage.put({ voiceService: service, voiceBridgeEpoch: bridgeEpoch });
    if (changed) this.broadcast({ type: 'voice-service', service });
  }

  private applyVoiceState(presenceId: string, next: VoiceState): void {
    for (const socket of this.state.getWebSockets()) {
      const attachment = attachmentOf(socket);
      if (attachment?.id === presenceId) this.applyVoiceStateToSocket(socket, attachment, next);
    }
  }

  private applyVoiceStateToSocket(
    socket: WebSocket,
    attachment: SocketAttachment,
    next: VoiceState,
  ): void {
    const view = this.coordinator.currentView(actorFromAttachment(attachment));
    if (!this.attachmentExpiryIsCurrent(attachment) || view === null) {
      if (attachment.voiceState !== null)
        socket.serializeAttachment({ ...attachment, voiceState: null });
      return;
    }
    const previous = attachment.voiceState;
    if (
      previous !== null &&
      previous.serviceSessionId === next.serviceSessionId &&
      previous.revision >= next.revision
    ) {
      return;
    }
    if (!this.voiceStateIsAllowed(attachment, view, next)) {
      const cleared = { ...next, channelKey: null };
      socket.serializeAttachment({ ...attachment, voiceState: cleared });
      if (socket.readyState === WebSocket.OPEN)
        this.send(socket, { type: 'voice-state', state: cleared });
      return;
    }
    socket.serializeAttachment({ ...attachment, voiceState: next });
    if (socket.readyState === WebSocket.OPEN)
      this.send(socket, { type: 'voice-state', state: next });
  }

  private broadcast(
    message: ServerPresenceMessage,
    excluded?: WebSocket,
    requiredScene?: string,
  ): void {
    const encoded = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (socket === excluded || socket.readyState !== WebSocket.OPEN) continue;
      const attachment = attachmentOf(socket);
      if (attachment === null || !this.attachmentIsLocallyCurrent(attachment)) continue;
      const view = this.coordinator.currentView(actorFromAttachment(attachment));
      if (
        view === null ||
        (requiredScene !== undefined && !worldIncludesScene(view, requiredScene))
      )
        continue;
      try {
        socket.send(encoded);
      } catch {
        // A close/error callback will clean up the peer for the remaining clients.
      }
    }
  }

  private send(socket: WebSocket, message: ServerPresenceMessage): void {
    socket.send(JSON.stringify(message));
  }
}
