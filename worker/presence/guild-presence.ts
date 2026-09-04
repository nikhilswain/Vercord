import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

import { isAvatarId } from '../../src/domain/avatar/identity';
import {
  clientPresenceMessageSchema,
  type PresencePlayer,
  type ServerPresenceMessage,
} from '../../src/domain/presence/protocol';
import {
  gatewayBridgeMessageSchema,
  voiceServiceStatusSchema,
  type VoiceServiceStatus,
  type VoiceState,
} from '../../src/domain/voice/protocol';

const MAX_CONNECTIONS = 200;
const MAX_MESSAGE_BYTES = 1_024;
const bridgeEpochSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const internalVoiceMessageSchema = z.strictObject({
  bridgeEpoch: bridgeEpochSchema,
  message: gatewayBridgeMessageSchema,
});
const internalVoiceServiceSchema = z.strictObject({
  bridgeEpoch: bridgeEpochSchema,
  service: voiceServiceStatusSchema,
});
const MIN_MESSAGE_INTERVAL_MS = 25;

interface SocketAttachment extends PresencePlayer {
  active: boolean;
  lastMessageAt: number;
  seq: number;
  voiceState: VoiceState | null;
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
  const value = socket.deserializeAttachment() as Partial<SocketAttachment> | null;
  if (
    value === null ||
    typeof value.id !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.active !== 'boolean'
  ) {
    return null;
  }
  return value as SocketAttachment;
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

export class GuildPresence extends DurableObject<Env> {
  private voiceService: VoiceServiceStatus = 'offline';
  private voiceBridgeEpoch = 0;

  public constructor(
    private readonly state: DurableObjectState,
    env: Env,
  ) {
    super(state, env);
    state.blockConcurrencyWhile(async () => {
      const [voiceService, voiceBridgeEpoch] = await Promise.all([
        state.storage.get<VoiceServiceStatus>('voiceService'),
        state.storage.get<number>('voiceBridgeEpoch'),
      ]);
      this.voiceService = voiceService ?? 'offline';
      this.voiceBridgeEpoch = voiceBridgeEpoch ?? 0;
    });
  }

  public async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/internal/voice') return this.receiveVoice(request);
    if (pathname === '/internal/voice-service') return this.receiveVoiceService(request);
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }
    if (this.state.getWebSockets().length >= MAX_CONNECTIONS) {
      return new Response('This world is full.', { status: 503 });
    }

    const displayName = readIdentityHeader(request, 'x-dmap-display-name', 100);
    if (displayName === null) return new Response('Missing player identity.', { status: 401 });
    const avatarId = readIdentityHeader(request, 'x-dmap-avatar-id', 32);
    if (avatarId === null || !isAvatarId(avatarId)) {
      return new Response('Missing avatar identity.', { status: 401 });
    }
    const presenceId = readIdentityHeader(request, 'x-dmap-presence-id', 64);
    if (presenceId === null || !/^p_[A-Za-z0-9_-]{43}$/u.test(presenceId)) {
      return new Response('Missing member identity.', { status: 401 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment: SocketAttachment = {
      id: presenceId,
      displayName,
      avatarId,
      x: 0,
      y: 0,
      direction: 'down',
      moving: false,
      scene: 'exterior',
      active: false,
      lastMessageAt: 0,
      seq: -1,
      voiceState: this.latestVoiceState(presenceId),
    };

    this.state.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    this.send(server, {
      type: 'welcome',
      selfId: attachment.id,
      selfAvatarId: attachment.avatarId,
      players: this.activePlayers(attachment.id),
      voiceService: this.voiceService,
      voiceState: attachment.voiceState,
    });
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

    const previous = attachmentOf(socket);
    if (previous === null) {
      socket.close(1011, 'Missing connection state');
      return;
    }
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
    );
  }

  public webSocketClose(socket: WebSocket): void {
    this.broadcastLeave(socket);
  }

  public webSocketError(socket: WebSocket): void {
    this.broadcastLeave(socket);
  }

  private activePlayers(excludedId?: string): PresencePlayer[] {
    const latestByMember = new Map<string, SocketAttachment>();
    for (const socket of this.state.getWebSockets()) {
      const attachment = attachmentOf(socket);
      if (!attachment?.active || attachment.id === excludedId) continue;
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
      if (!attachment?.active || attachment.id !== memberId) continue;
      if (!latest || attachment.lastMessageAt >= latest.lastMessageAt) latest = attachment;
    }
    return latest;
  }

  private latestVoiceState(memberId: string): VoiceState | null {
    let latest: VoiceState | null = null;
    for (const socket of this.state.getWebSockets()) {
      const attachment = attachmentOf(socket);
      const state = attachment?.voiceState;
      if (attachment?.id !== memberId || state === null || state === undefined) continue;
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
    const previous = attachment.voiceState;
    if (
      previous !== null &&
      previous.serviceSessionId === next.serviceSessionId &&
      previous.revision >= next.revision
    ) {
      return;
    }
    socket.serializeAttachment({ ...attachment, voiceState: next });
    if (socket.readyState === WebSocket.OPEN)
      this.send(socket, { type: 'voice-state', state: next });
  }

  private broadcast(message: ServerPresenceMessage, excluded?: WebSocket): void {
    const encoded = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (socket === excluded || socket.readyState !== WebSocket.OPEN) continue;
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
