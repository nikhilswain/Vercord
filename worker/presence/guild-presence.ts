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
import { liveFrameSchema, LIVE_FRAME_MAX_BYTES } from '../../src/domain/discord/live-protocol';
import {
  messageErrorCodeSchema,
  roomMessageSchema,
  messageSlowmodeObservationSchema,
  type MessageErrorCode,
} from '../../src/domain/messages/protocol';
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
import { MemberSlowmode } from '../messages/member-slowmode';
import {
  worldThemeIdSchema,
  streetSelectionSchema,
  houseSceneIdSchema,
  type WorldBindings,
} from '../../src/domain/world/protocol';
import { isHouseSceneId, type HouseSceneId } from '../../src/domain/world/catalog/scenes';
import type { WorldDocument } from '../../src/domain/world/document';
import type { HouseInterior } from '../../src/domain/world/interiors';
import { WorldInstanceStore } from '../worlds/instance-store';
import { ContinuousTownStore } from '../worlds/continuous-town-store';
import { HouseInteriorStore } from '../worlds/house-store';
import { WorldSaveError } from '../worlds/save-error';
import { rpgPlayerSchema, type RpgPresencePlayer } from '../../src/domain/presence/rpg-protocol';
import {
  RpgPresenceState,
  appearanceFitsTheme,
  readRpgPartition,
  rpgSocketSchema,
  sameRpgPartition,
  type RpgPartition,
  type RpgSocket,
} from './rpg-state';

const MAX_CONNECTIONS = 200;
const MAX_MESSAGE_BYTES = 16 * 1_024;
const MAX_INTERNAL_BODY_BYTES = 32 * 1_024;
const WORLD_VIEW_EPOCH_KEY = 'worldViewEpoch';
const MESSAGE_COVERAGE_KEY = 'messageCoverage';
type MessageCoverage = {
  epoch: number;
  online: boolean;
  streamId: string | null;
  sequence: number;
};
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
const internalRpgWorldSchema = z.strictObject({
  actor: worldActorSchema,
  theme: worldThemeIdSchema,
  street: streetSelectionSchema,
  house: houseSceneIdSchema.optional(),
});
const internalLiveFrameSchema = z.strictObject({
  bridgeEpoch: bridgeEpochSchema,
  message: liveFrameSchema,
});
const internalLiveServiceSchema = z.strictObject({
  bridgeEpoch: bridgeEpochSchema,
  service: z.enum(['online', 'offline']),
});
const internalRoomMessageSchema = z.strictObject({
  bridgeEpoch: bridgeEpochSchema,
  message: roomMessageSchema,
  slowmode: messageSlowmodeObservationSchema.optional(),
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
  rpg: rpgSocketSchema.optional(),
  avatarUrl: rpgPlayerSchema.shape.avatarUrl,
});

type SocketAttachment = z.infer<typeof socketAttachmentSchema>;

interface ConnectionAdmission {
  actor: WorldActor;
  sessionExpiresAt: number;
  subscriptionId: string;
  presenceId: string;
  displayName: string;
  avatarId: SocketAttachment['avatarId'];
  avatarUrl?: string;
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

function rpgPlayerFromAttachment(
  attachment: SocketAttachment & { rpg: RpgSocket },
): RpgPresencePlayer {
  const { x, y, direction, action, scene, appearance } = attachment.rpg;
  return {
    id: attachment.id,
    displayName: attachment.displayName,
    x,
    y,
    direction,
    action,
    scene,
    appearance,
    ...(attachment.avatarUrl ? { avatarUrl: attachment.avatarUrl } : {}),
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
  private coordinator!: LiveWorldCoordinator;
  private readonly slowmode: MemberSlowmode;
  private readonly worldInstances: WorldInstanceStore;
  private readonly towns: ContinuousTownStore;
  private readonly houses: HouseInteriorStore;
  private readonly rpgPresence: RpgPresenceState;
  private readonly rpgSessionChecks = new WeakMap<WebSocket, number>();
  private messageCoverage: MessageCoverage = {
    epoch: 0,
    online: false,
    streamId: null,
    sequence: -1,
  };
  private restoration: Promise<void> | null = null;
  private readonly initialVoiceQueries = new Map<string, Promise<VoiceState | null>>();

  public constructor(
    private readonly state: DurableObjectState,
    env: Env,
  ) {
    super(state, env);
    this.slowmode = new MemberSlowmode(state.storage);
    this.worldInstances = new WorldInstanceStore(env.AUTH_DB);
    this.towns = new ContinuousTownStore(env.AUTH_DB);
    this.houses = new HouseInteriorStore(state.storage);
    this.rpgPresence = new RpgPresenceState(state.storage, (job) => state.waitUntil(job));
    state.blockConcurrencyWhile(async () => {
      const [voiceService, voiceBridgeEpoch, previousWorldViewEpoch, messageCoverage] =
        await Promise.all([
          state.storage.get<VoiceServiceStatus>('voiceService'),
          state.storage.get<number>('voiceBridgeEpoch'),
          state.storage.get<number>(WORLD_VIEW_EPOCH_KEY),
          state.storage.get<MessageCoverage>(MESSAGE_COVERAGE_KEY),
        ]);
      this.voiceService = voiceService ?? 'offline';
      this.voiceBridgeEpoch = voiceBridgeEpoch ?? 0;
      this.messageCoverage = messageCoverage ?? this.messageCoverage;
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
    if (pathname === '/internal/channels-changed') {
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      // Protocol-v1 gateways still emit this. The v2 live owner advances only from live frames.
      return new Response(null, { status: 204 });
    }
    if (pathname === '/internal/live-frame') return this.receiveLiveFrame(request);
    if (pathname === '/internal/live-service') return this.receiveLiveService(request);
    if (pathname === '/internal/message') return this.receiveRoomMessage(request);
    if (pathname === '/internal/world-view') return this.readWorldView(request);
    if (pathname === '/internal/rpg-world') return this.readRpgWorld(request);
    if (pathname === '/internal/world-mutate') return this.mutateWorld(request);
    if (pathname === '/internal/voice-destination') return this.readVoiceDestination(request);
    if (pathname === '/internal/voice') return this.receiveVoice(request);
    if (pathname === '/internal/voice-service') return this.receiveVoiceService(request);
    if (pathname !== '/connect') return new Response(null, { status: 404 });
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    const partition = readRpgPartition(new URL(request.url).searchParams);
    if (partition === null) return this.worldError(new WorldAccessError('INVALID_REQUEST', 400));
    const websocketUpgrade = request.headers.get('upgrade')?.toLowerCase() === 'websocket';
    if (this.state.getWebSockets().length >= MAX_CONNECTIONS) {
      return this.worldError(new WorldAccessError('WORLD_SOURCE_UNAVAILABLE', 503));
    }

    const admission = this.readAdmission(request, websocketUpgrade);
    if (admission === null) return this.worldError(new WorldAccessError('UNAUTHENTICATED', 401));
    this.startRestoration();

    let view: WorldView;
    try {
      // A socket starts as an expiring lease. It is promoted only after the
      // Durable Object has accepted, attached, and welcomed the WebSocket.
      view = await this.coordinator.read(admission.actor, admission.subscriptionId, 'lease');
      if (partition)
        view = await this.loadRpgPresence(
          admission.actor,
          admission.subscriptionId,
          partition,
          view,
        );
    } catch (error) {
      if (websocketUpgrade) await this.releaseFailedAdmission(admission);
      return this.worldError(error);
    }
    if (!websocketUpgrade) {
      return Response.json({ view }, { headers: { 'cache-control': 'no-store' } });
    }

    let admittedServer: WebSocket | null = null;
    try {
      const rpg = partition
        ? await this.rpgPresence.restore(partition, admission.actor.userId, Date.now())
        : undefined;
      let voiceState = this.latestVoiceState(admission.presenceId, view);
      if (voiceState === null) {
        voiceState = await this.initialVoiceState(admission.actor, view);
      }
      const rpgPlayers = rpg ? await this.activeRpgPlayers({ id: admission.presenceId, rpg }) : [];
      // Progress/geometry and voice admission both await external state.
      if (
        admission.sessionExpiresAt <= Math.floor(Date.now() / 1_000) ||
        !(await sessionIsCurrent(this.env, admission.actor, Date.now())) ||
        this.coordinator.currentView(admission.actor) !== view
      ) {
        throw new WorldAccessError('UNAUTHENTICATED', 401);
      }
      if (this.state.getWebSockets().length >= MAX_CONNECTIONS) {
        throw new WorldAccessError('WORLD_SOURCE_UNAVAILABLE', 503);
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      admittedServer = server;
      const attachment: SocketAttachment = {
        id: admission.presenceId,
        displayName: admission.displayName,
        avatarId: admission.avatarId,
        ...(admission.avatarUrl ? { avatarUrl: admission.avatarUrl } : {}),
        x: 0,
        y: 0,
        direction: 'down',
        moving: false,
        scene: 'exterior',
        active: rpg !== undefined,
        lastMessageAt: rpg ? Date.now() : 0,
        seq: -1,
        voiceState,
        ...admission.actor,
        sessionExpiresAt: admission.sessionExpiresAt,
        subscriptionId: admission.subscriptionId,
        viewVersion: view.version,
        ...(rpg ? { rpg } : {}),
      };

      this.state.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      if (rpg) this.rpgSessionChecks.set(server, Date.now());
      this.send(server, {
        type: 'welcome',
        selfId: attachment.id,
        selfAvatarId: attachment.avatarId,
        players: rpg ? [] : this.activePlayers(attachment, view),
        voiceService: this.voiceService,
        voiceState: attachment.voiceState,
        worldView: view,
        ...(rpg
          ? {
              rpg: {
                worldId: rpg.worldId,
                checksum: rpg.checksum,
                scene: rpg.scene,
                self: rpgPlayerFromAttachment({ ...attachment, rpg }),
                players: rpgPlayers,
              },
            }
          : {}),
      });

      const promotedView = await this.coordinator.read(
        admission.actor,
        admission.subscriptionId,
        'connected',
      );
      if (rpg) {
        if (
          !(await sessionIsCurrent(this.env, admission.actor, Date.now())) ||
          this.coordinator.currentView(admission.actor) !== promotedView
        )
          throw new WorldAccessError('UNAUTHENTICATED', 401);
        this.broadcastRpg(
          { type: 'rpg-player', player: rpgPlayerFromAttachment({ ...attachment, rpg }) },
          rpg,
          server,
        );
      }
      if (
        promotedView.version.epoch !== view.version.epoch ||
        promotedView.version.revision !== view.version.revision
      ) {
        server.serializeAttachment({ ...attachment, viewVersion: promotedView.version });
        this.send(server, { type: 'world-view', view: promotedView });
      }
      return new Response(null, { status: 101, webSocket: client });
    } catch (error) {
      if (admittedServer !== null) {
        this.broadcastLeave(admittedServer);
        try {
          admittedServer.close(1011, 'Socket admission failed');
        } catch {
          /* The pair may have failed before becoming closable. */
        }
      }
      await this.releaseFailedAdmission(admission, admittedServer);
      return this.worldError(error);
    }
  }

  public async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
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
    if (view === null) return;
    if (parsed.data.type === 'rpg-move' || parsed.data.type === 'rpg-appearance') {
      if (!previous.rpg) {
        socket.close(1008, 'RPG admission required');
        return;
      }
      await this.handleRpgCommand(socket, previous, parsed.data);
      return;
    }
    if (parsed.data.type === 'move' && previous.rpg) {
      socket.close(1008, 'RPG movement required');
      return;
    }
    if (parsed.data.type !== 'move') {
      await this.handleMessageCommand(socket, previous, parsed.data);
      return;
    }
    if (!worldIncludesScene(view, parsed.data.scene)) return;
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

  private async handleMessageCommand(
    socket: WebSocket,
    attachment: SocketAttachment,
    command: Extract<
      z.infer<typeof clientPresenceMessageSchema>,
      { type: 'message-read' | 'message-send' }
    >,
  ): Promise<void> {
    const roomKey = command.type === 'message-read' ? command.roomKey : command.input.roomKey;
    if (!this.socketCanUseRoom(attachment, roomKey)) {
      this.sendMessageFailure(socket, command.type, command.requestId, 'MESSAGE_MEMBER_FORBIDDEN');
      return;
    }
    try {
      const actor = actorFromAttachment(attachment);
      if (command.type === 'message-read') {
        const result = await this.coordinator.readMessages(
          actor,
          attachment.subscriptionId,
          roomKey,
        );
        if (
          this.messageReplyIsCurrent(socket, attachment, roomKey) &&
          socket.readyState === WebSocket.OPEN
        ) {
          this.send(socket, { type: 'message-history', requestId: command.requestId, result });
        }
        return;
      }
      const policy = await this.coordinator.messageSlowmodePolicy(
        actor,
        attachment.subscriptionId,
        roomKey,
      );
      const result = await this.slowmode.run(policy, () =>
        this.coordinator.sendMessage(actor, attachment.subscriptionId, command.input),
      );
      if (
        !this.messageReplyIsCurrent(socket, attachment, roomKey) ||
        socket.readyState !== WebSocket.OPEN
      )
        return;
      this.send(socket, {
        type: 'message-send-result',
        requestId: command.requestId,
        ...(result.status === 'applied'
          ? { status: 'applied' as const, message: result.message }
          : { status: 'uncertain' as const, code: result.code }),
      });
    } catch (error) {
      const parsedCode = messageErrorCodeSchema.safeParse(
        error instanceof WorldAccessError ? error.code : 'WORLD_SOURCE_UNAVAILABLE',
      );
      this.sendMessageFailure(
        socket,
        command.type,
        command.requestId,
        parsedCode.success ? parsedCode.data : 'WORLD_SOURCE_UNAVAILABLE',
        error instanceof WorldAccessError ? error.retryAt : undefined,
      );
    }
  }

  private async loadRpgPresence(
    actor: WorldActor,
    subscriptionId: string,
    partition: RpgPartition,
    initial: WorldView,
  ): Promise<WorldView> {
    try {
      const saved = await this.worldInstances.load(actor.guildId, partition.theme);
      const prepared = await this.towns.prepare(saved, initial.snapshot);
      const view = await this.coordinator.read(actor, subscriptionId);
      if (
        !(await sessionIsCurrent(this.env, actor, Date.now())) ||
        this.coordinator.currentView(actor) !== view
      )
        throw new WorldAccessError('UNAUTHENTICATED', 401);
      const town = prepared.project(view.snapshot);
      if (town.document.worldId !== partition.worldId || town.checksum !== partition.checksum)
        throw new WorldAccessError('WORLD_SOURCE_UNAVAILABLE', 409);
      const interior = isHouseSceneId(partition.scene)
        ? await this.loadHouse(town, partition.scene)
        : undefined;
      if (
        !(await sessionIsCurrent(this.env, actor, Date.now())) ||
        this.coordinator.currentView(actor) !== view
      )
        throw new WorldAccessError('UNAUTHENTICATED', 401);
      this.invalidateStaleRpgSockets(town.document.worldId, town.checksum);
      this.rpgPresence.register({ ...town, ...(interior ? { interior } : {}) });
      return view;
    } catch (error) {
      throw error instanceof WorldSaveError
        ? new WorldAccessError(error.code, error.status)
        : error;
    }
  }

  private async loadHouse(
    saved: { document: WorldDocument; bindings: WorldBindings },
    house: HouseSceneId,
  ): Promise<HouseInterior> {
    // This is the caller's freshly projected binding, never another member's geometry cache.
    const binding = saved.bindings.find((candidate) => candidate.landmarkId === house);
    const room = binding?.rooms[0];
    if (!room) throw new WorldAccessError('CHANNEL_MEMBER_FORBIDDEN', 403);
    if (!saved.document.scenes.overworld.landmarks.some((landmark) => landmark.id === house))
      throw new WorldAccessError('CHANNEL_NOT_FOUND', 404);
    return this.houses.load(saved.document, house, room.type);
  }

  private async rpgSessionIsCurrent(
    socket: WebSocket,
    attachment: SocketAttachment,
    force = false,
  ): Promise<boolean> {
    if (!this.attachmentIsLocallyCurrent(attachment) || socket.readyState !== WebSocket.OPEN)
      return false;
    if (force || Date.now() - (this.rpgSessionChecks.get(socket) ?? 0) >= 10_000) {
      if (!(await sessionIsCurrent(this.env, actorFromAttachment(attachment), Date.now()))) {
        this.denySocket(socket, 'UNAUTHENTICATED');
        return false;
      }
      this.rpgSessionChecks.set(socket, Date.now());
    }
    const latest = attachmentOf(socket);
    return (
      latest !== null &&
      latest.sessionHash === attachment.sessionHash &&
      this.attachmentIsLocallyCurrent(latest) &&
      socket.readyState === WebSocket.OPEN
    );
  }

  private async handleRpgCommand(
    socket: WebSocket,
    attachment: SocketAttachment,
    command: Extract<
      z.infer<typeof clientPresenceMessageSchema>,
      { type: 'rpg-move' | 'rpg-appearance' }
    >,
  ): Promise<void> {
    if (!(await this.rpgSessionIsCurrent(socket, attachment))) return;
    let previous = attachmentOf(socket);
    if (!previous?.rpg) return;
    if (!this.rpgPresence.has(previous.rpg)) {
      const actor = actorFromAttachment(previous);
      const view = this.coordinator.currentView(actor);
      if (!view) return;
      try {
        await this.loadRpgPresence(actor, previous.subscriptionId, previous.rpg, view);
      } catch {
        this.refreshRpgSocket(socket);
        return;
      }
      previous = attachmentOf(socket);
      if (!previous?.rpg || !this.attachmentIsLocallyCurrent(previous)) return;
    }
    const now = Date.now();
    if (command.type === 'rpg-move' && command.seq <= previous.seq) return;
    // Blur/hidden can send the final stop immediately after a moving frame.
    if (
      now - previous.lastMessageAt < MIN_MESSAGE_INTERVAL_MS &&
      command.type === 'rpg-move' &&
      command.action !== 'idle'
    )
      return;
    let rpg = previous.rpg;
    let corrected = command.type === 'rpg-appearance';
    if (command.type === 'rpg-move') {
      const movement = this.rpgPresence.move(rpg, command, now);
      rpg = movement.next;
      corrected = !movement.accepted;
    } else if (appearanceFitsTheme(command.appearance, rpg.theme)) {
      rpg = {
        ...rpg,
        appearance: command.appearance,
        appearanceUpdatedAt: Math.max(now, (rpg.appearanceUpdatedAt ?? 0) + 1),
      };
    }
    const next = {
      ...previous,
      rpg,
      active: true,
      lastMessageAt: now,
      seq: command.type === 'rpg-move' ? command.seq : previous.seq,
    };
    socket.serializeAttachment(next);
    const player = rpgPlayerFromAttachment(next);
    if (corrected) this.send(socket, { type: 'rpg-position', player });
    this.broadcastRpg({ type: 'rpg-player', player }, rpg, socket);
    if (
      command.type === 'rpg-appearance' &&
      rpg.appearanceUpdatedAt !== previous.rpg.appearanceUpdatedAt
    ) {
      for (const candidate of this.state.getWebSockets()) {
        if (candidate === socket || candidate.readyState !== WebSocket.OPEN) continue;
        const other = attachmentOf(candidate);
        if (
          !other?.rpg ||
          other.userId !== previous.userId ||
          other.rpg.worldId !== rpg.worldId ||
          !this.attachmentIsLocallyCurrent(other)
        )
          continue;
        const updated = {
          ...other,
          rpg: {
            ...other.rpg,
            appearance: rpg.appearance,
            appearanceUpdatedAt: rpg.appearanceUpdatedAt,
          },
        };
        candidate.serializeAttachment(updated);
        this.send(candidate, { type: 'rpg-position', player: rpgPlayerFromAttachment(updated) });
        this.broadcastRpg(
          { type: 'rpg-player', player: rpgPlayerFromAttachment(updated) },
          updated.rpg,
          candidate,
        );
      }
    }
    const changed =
      rpg.x !== previous.rpg.x ||
      rpg.y !== previous.rpg.y ||
      rpg.direction !== previous.rpg.direction ||
      rpg.appearance !== previous.rpg.appearance ||
      rpg.appearanceUpdatedAt !== previous.rpg.appearanceUpdatedAt;
    const stopped = rpg.action === 'idle' && previous.rpg.action !== 'idle';
    if (changed || stopped)
      await this.rpgPresence.save(
        previous.userId,
        rpg,
        now,
        stopped || command.type === 'rpg-appearance',
      );
  }

  private socketCanUseRoom(attachment: SocketAttachment, roomKey: string): boolean {
    const view = this.coordinator.currentView(actorFromAttachment(attachment));
    if (view === null || !worldIncludesScene(view, `room:${roomKey}`)) return false;
    return attachment.rpg
      ? this.rpgPresence.has(attachment.rpg) && this.rpgPresence.canUseRoom(attachment.rpg, roomKey)
      : attachment.scene === `room:${roomKey}`;
  }

  private messageReplyIsCurrent(
    socket: WebSocket,
    before: SocketAttachment,
    roomKey: string,
  ): boolean {
    const current = attachmentOf(socket);
    return (
      current !== null &&
      current.sessionHash === before.sessionHash &&
      this.attachmentIsLocallyCurrent(current) &&
      this.socketCanUseRoom(current, roomKey)
    );
  }

  private latestActiveRpgConnection(
    memberId: string,
    partition: RpgPartition,
    excluded?: WebSocket,
  ): SocketAttachment | null {
    let latest: SocketAttachment | null = null;
    for (const socket of this.state.getWebSockets()) {
      if (socket === excluded || socket.readyState !== WebSocket.OPEN) continue;
      const attachment = attachmentOf(socket);
      if (
        !attachment?.active ||
        !attachment.rpg ||
        attachment.id !== memberId ||
        !sameRpgPartition(attachment.rpg, partition) ||
        !this.attachmentIsLocallyCurrent(attachment)
      )
        continue;
      if (!latest || attachment.lastMessageAt >= latest.lastMessageAt) latest = attachment;
    }
    return latest;
  }

  private async activeRpgPlayers(recipient: {
    id: string;
    rpg: RpgSocket;
  }): Promise<RpgPresencePlayer[]> {
    const latest = new Map<string, SocketAttachment & { rpg: RpgSocket }>();
    for (const socket of this.state.getWebSockets()) {
      const attachment = attachmentOf(socket);
      if (
        !attachment?.rpg ||
        !attachment.active ||
        attachment.id === recipient.id ||
        !sameRpgPartition(attachment.rpg, recipient.rpg) ||
        !(await this.rpgSessionIsCurrent(socket, attachment, true))
      )
        continue;
      const current = attachmentOf(socket);
      if (!current?.rpg || !current.active || !this.attachmentIsLocallyCurrent(current)) continue;
      const previous = latest.get(current.id);
      if (!previous || current.lastMessageAt >= previous.lastMessageAt)
        latest.set(current.id, { ...current, rpg: current.rpg });
    }
    return [...latest.values()]
      .filter((attachment) => this.attachmentIsLocallyCurrent(attachment))
      .map(rpgPlayerFromAttachment);
  }

  private broadcastRpg(
    message: Extract<ServerPresenceMessage, { type: 'rpg-player' | 'rpg-leave' }>,
    partition: RpgPartition,
    excluded?: WebSocket,
  ): void {
    const encoded = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (socket === excluded || socket.readyState !== WebSocket.OPEN) continue;
      const attachment = attachmentOf(socket);
      if (
        !attachment?.rpg ||
        !sameRpgPartition(attachment.rpg, partition) ||
        !this.attachmentExpiryIsCurrent(attachment)
      )
        continue;
      // A leave also clears previous presence during permission recovery.
      if (message.type !== 'rpg-leave' && !this.attachmentIsLocallyCurrent(attachment)) continue;
      try {
        socket.send(encoded);
      } catch {
        /* The close callback owns cleanup. */
      }
    }
  }

  private sendMessageFailure(
    socket: WebSocket,
    commandType: 'message-read' | 'message-send',
    requestId: string,
    code: MessageErrorCode,
    retryAt?: number,
  ): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    this.send(
      socket,
      commandType === 'message-read'
        ? { type: 'message-read-error', requestId, code }
        : {
            type: 'message-send-result',
            requestId,
            status: 'rejected',
            code,
            ...(retryAt === undefined ? {} : { retryAt }),
          },
    );
  }

  public webSocketClose(socket: WebSocket): void {
    this.saveRpgSocket(socket);
    this.broadcastLeave(socket);
    this.releaseSocket(socket);
  }

  public webSocketError(socket: WebSocket): void {
    this.saveRpgSocket(socket);
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
        attachment.rpg !== undefined ||
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
    if (attachment.rpg) {
      const replacement = this.latestActiveRpgConnection(attachment.id, attachment.rpg, socket);
      this.broadcastRpg(
        replacement?.rpg
          ? {
              type: 'rpg-player',
              player: rpgPlayerFromAttachment({ ...replacement, rpg: replacement.rpg }),
            }
          : { type: 'rpg-leave', id: attachment.id },
        attachment.rpg,
        socket,
      );
      return;
    }
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
        attachment.rpg !== undefined ||
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

  private readAdmission(request: Request, socketOwner: boolean): ConnectionAdmission | null {
    const displayName = readIdentityHeader(request, 'x-dmap-display-name', 100);
    const avatarId = readIdentityHeader(request, 'x-dmap-avatar-id', 32);
    const presenceId = readIdentityHeader(request, 'x-dmap-presence-id', 64);
    const avatarUrl = rpgPlayerSchema.shape.avatarUrl.safeParse(
      readIdentityHeader(request, 'x-dmap-avatar-url', 512) ?? undefined,
    );
    const parsed = z
      .strictObject({
        guildId: snowflakeSchema,
        userId: snowflakeSchema,
        sessionHash: digestSchema,
        sessionExpiresAt: safeIntegerSchema,
      })
      .safeParse({
        guildId: request.headers.get('x-dmap-guild-id'),
        userId: request.headers.get('x-dmap-user-id'),
        sessionHash: request.headers.get('x-dmap-session-hash'),
        sessionExpiresAt: this.readIntegerHeader(request, 'x-dmap-session-expires-at'),
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
      subscriptionId: socketOwner
        ? crypto.randomUUID()
        : this.coordinator.subscriptionId(parsed.data.userId),
      presenceId,
      displayName,
      avatarId,
      ...(avatarUrl.success && avatarUrl.data ? { avatarUrl: avatarUrl.data } : {}),
    };
  }

  private readIntegerHeader(request: Request, name: string): number | null {
    const value = request.headers.get(name);
    if (value === null || !/^(?:0|[1-9]\d{0,15})$/u.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  public alarm(): Promise<void> {
    return this.slowmode.prune();
  }

  private async trackMessageService(online: boolean, epoch: number): Promise<void> {
    const previous = this.messageCoverage;
    if (epoch < previous.epoch || (epoch === previous.epoch && !previous.online && online)) return;
    if (epoch > previous.epoch) await this.slowmode.setCoverage(false);
    if (epoch !== previous.epoch || online !== previous.online) {
      await this.slowmode.setCoverage(online);
      this.messageCoverage = {
        epoch,
        online,
        streamId: epoch === previous.epoch ? previous.streamId : null,
        sequence: epoch === previous.epoch ? previous.sequence : -1,
      };
      await this.state.storage.put(MESSAGE_COVERAGE_KEY, this.messageCoverage);
    }
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
    const { bridgeEpoch, message } = parsed.data;
    if (bridgeEpoch > this.messageCoverage.epoch) await this.trackMessageService(true, bridgeEpoch);
    if (bridgeEpoch === this.messageCoverage.epoch && this.messageCoverage.online) {
      const coverage = this.messageCoverage;
      if (
        message.cursor.streamId !== coverage.streamId ||
        message.cursor.sequence > coverage.sequence
      ) {
        if (coverage.streamId !== null && message.cursor.streamId !== coverage.streamId)
          await this.slowmode.setCoverage(false);
        if (message.type === 'world-health') await this.slowmode.setCoverage(message.ready);
        this.messageCoverage = {
          ...coverage,
          streamId: message.cursor.streamId,
          sequence: message.cursor.sequence,
        };
        await this.state.storage.put(MESSAGE_COVERAGE_KEY, this.messageCoverage);
      }
    }
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
    await this.trackMessageService(parsed.data.service === 'online', parsed.data.bridgeEpoch);
    this.startRestoration();
    await this.coordinator.service(parsed.data.service === 'online', parsed.data.bridgeEpoch);
    this.state.waitUntil(this.coordinator.pendingWork());
    return new Response(null, { status: 204 });
  }

  private async receiveRoomMessage(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const value = await this.readJson(request, MAX_INTERNAL_BODY_BYTES);
    const parsed = internalRoomMessageSchema.safeParse(value);
    if (!parsed.success) return new Response(null, { status: 400 });
    this.startRestoration();
    if (parsed.data.bridgeEpoch !== this.messageCoverage.epoch || !this.messageCoverage.online) {
      return new Response(null, { status: 204 });
    }

    if (parsed.data.slowmode !== undefined) {
      await this.slowmode.observe(
        parsed.data.slowmode.actorKey,
        parsed.data.message.roomKey,
        parsed.data.slowmode.nextAllowedAt,
      );
    }

    const scene = `room:${parsed.data.message.roomKey}`;
    const encoded = JSON.stringify({
      type: 'room-message',
      message: parsed.data.message,
    } satisfies ServerPresenceMessage);
    for (const socket of this.state.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const attachment = attachmentOf(socket);
      if (
        attachment === null ||
        !this.socketCanUseRoom(attachment, parsed.data.message.roomKey) ||
        !this.attachmentIsLocallyCurrent(attachment)
      ) {
        continue;
      }
      const view = this.coordinator.currentView(actorFromAttachment(attachment));
      if (view === null || !worldIncludesScene(view, scene)) continue;
      try {
        socket.send(encoded);
      } catch {
        // The close/error callback owns cleanup.
      }
    }
    return new Response(null, { status: 204 });
  }

  private async readRpgWorld(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const parsed = internalRpgWorldSchema.safeParse(
      await this.readJson(request, MAX_INTERNAL_BODY_BYTES),
    );
    if (!parsed.success) return new Response(null, { status: 400 });
    const { actor, theme, street, house } = parsed.data;
    try {
      const subscriptionId = this.coordinator.subscriptionId(actor.userId);
      // Membership is checked before reserving any persistent map.
      const initial = await this.coordinator.read(actor, subscriptionId);
      const saved = await this.worldInstances.load(actor.guildId, theme);
      const town = await this.towns.prepare(saved, initial.snapshot, street);
      const view = await this.coordinator.read(actor, subscriptionId);
      if (!(await sessionIsCurrent(this.env, actor, Date.now())))
        throw new WorldAccessError('UNAUTHENTICATED', 401);
      if (this.coordinator.currentView(actor) !== view) throw new WorldAccessError();
      const projected = town.project(view.snapshot);
      const interior = house ? await this.loadHouse(projected, house) : undefined;
      if (
        !(await sessionIsCurrent(this.env, actor, Date.now())) ||
        this.coordinator.currentView(actor) !== view
      )
        throw new WorldAccessError('UNAUTHENTICATED', 401);
      this.invalidateStaleRpgSockets(projected.document.worldId, projected.checksum);
      return Response.json(
        { ...projected, ...(interior ? { interior } : {}) },
        {
          headers: { 'cache-control': 'no-store' },
        },
      );
    } catch (error) {
      console.warn(
        JSON.stringify({
          service: 'dmap',
          event: 'town_load_failed',
          code:
            error instanceof WorldSaveError || error instanceof WorldAccessError
              ? error.code
              : 'WORLD_SOURCE_UNAVAILABLE',
        }),
      );
      return this.worldError(
        error instanceof WorldSaveError ? new WorldAccessError(error.code, error.status) : error,
      );
    }
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
    const response = Response.json(
      {
        error: {
          code: failure.code,
          ...(failure.retryAt === undefined ? {} : { retryAt: failure.retryAt }),
          ...(failure.scope === undefined ? {} : { scope: failure.scope }),
        },
      },
      { status: failure.status, headers: { 'cache-control': 'no-store' } },
    );
    if (failure.retryAt !== undefined && failure.retryAt > Date.now()) {
      response.headers.set(
        'retry-after',
        String(Math.max(1, Math.ceil((failure.retryAt - Date.now()) / 1_000))),
      );
    }
    return response;
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
        let view = await this.coordinator.read(actor, attachment.subscriptionId, 'connected');
        if (attachment.rpg) {
          view = await this.loadRpgPresence(actor, attachment.subscriptionId, attachment.rpg, view);
          this.rpgSessionChecks.set(socket, Date.now());
        }
        await this.deliverWorld(attachment.userId, view, { state: 'ready' });
        return;
      } catch (error) {
        if (attachment.rpg && error instanceof WorldAccessError && error.status === 409) {
          this.refreshRpgSocket(socket);
          continue;
        }
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
    const view = this.coordinator.currentView(actorFromAttachment(attachment));
    if (view && !this.attachmentSceneIsAllowed(attachment, view)) {
      this.refreshRpgSocket(socket);
      return null;
    }
    return view;
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
        if (
          next.rpg &&
          next.viewVersion?.epoch === view.version.epoch &&
          next.viewVersion.revision !== view.version.revision
        ) {
          this.refreshRpgSocket(socket);
          continue;
        }
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
        this.saveRpgSocket(socket);
        if (next.active) this.broadcastLeave(socket);
        next = { ...next, viewVersion: null, voiceState: null, active: false, scene: 'exterior' };
        socket.serializeAttachment(next);
        if (next.rpg && socket.readyState === WebSocket.OPEN) {
          this.send(socket, worldSyncMessage(sync));
          socket.close(sync.state === 'denied' ? 1008 : 1012, 'RPG access requires readmission');
          continue;
        }
      }
      if (socket.readyState === WebSocket.OPEN) this.send(socket, worldSyncMessage(sync));
      if (sync.state === 'denied') socket.close(1008, sync.code);
    }
  }

  private denySocket(
    socket: WebSocket,
    code: 'UNAUTHENTICATED' | 'GUILD_MEMBERSHIP_REQUIRED',
  ): void {
    this.saveRpgSocket(socket);
    this.broadcastLeave(socket);
    const attachment = attachmentOf(socket);
    if (attachment) socket.serializeAttachment({ ...attachment, active: false, viewVersion: null });
    if (socket.readyState === WebSocket.OPEN)
      this.send(socket, { type: 'world-sync', sync: { state: 'denied', code } });
    socket.close(1008, code);
  }

  private saveRpgSocket(socket: WebSocket): void {
    const attachment = attachmentOf(socket);
    if (!attachment?.rpg) return;
    const replacement = this.latestActiveRpgConnection(attachment.id, attachment.rpg, socket);
    if (replacement && replacement.lastMessageAt > attachment.lastMessageAt) return;
    this.state.waitUntil(
      this.rpgPresence.save(attachment.userId, attachment.rpg, attachment.lastMessageAt, true),
    );
  }

  private refreshRpgSocket(socket: WebSocket): void {
    this.saveRpgSocket(socket);
    this.broadcastLeave(socket);
    const attachment = attachmentOf(socket);
    if (attachment) socket.serializeAttachment({ ...attachment, active: false, viewVersion: null });
    if (socket.readyState === WebSocket.OPEN) {
      this.send(socket, {
        type: 'world-sync',
        sync: { state: 'recovering', code: 'WORLD_SOURCE_UNAVAILABLE' },
      });
      socket.close(1012, 'Saved town changed');
    }
  }

  private invalidateStaleRpgSockets(worldId: string, checksum: string): void {
    for (const socket of this.state.getWebSockets()) {
      const attachment = attachmentOf(socket);
      if (attachment?.rpg?.worldId === worldId && attachment.rpg.checksum !== checksum)
        this.refreshRpgSocket(socket);
    }
  }

  private attachmentExpiryIsCurrent(attachment: SocketAttachment): boolean {
    return attachment.sessionExpiresAt > Math.floor(Date.now() / 1_000);
  }

  private attachmentIsLocallyCurrent(attachment: SocketAttachment): boolean {
    const view = this.coordinator.currentView(actorFromAttachment(attachment));
    return (
      this.attachmentExpiryIsCurrent(attachment) &&
      view !== null &&
      this.attachmentSceneIsAllowed(attachment, view)
    );
  }

  private attachmentSceneIsAllowed(attachment: SocketAttachment, view: WorldView): boolean {
    return (
      !attachment.rpg ||
      this.rpgPresence.canOccupyScene(
        attachment.rpg,
        view.snapshot.areas.flatMap((area) => area.rooms.map((room) => room.key)),
      )
    );
  }

  private async releaseFailedAdmission(
    admission: ConnectionAdmission,
    failedSocket: WebSocket | null = null,
  ): Promise<void> {
    const retained = this.state.getWebSockets().some((socket) => {
      if (socket === failedSocket) return false;
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
      if ((message.type === 'player' || message.type === 'leave') && attachment.rpg) continue;
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
