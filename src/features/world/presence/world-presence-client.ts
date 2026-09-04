import {
  serverPresenceMessageSchema,
  type ClientPresenceLocation,
  type ClientPresenceMessage,
  type PresencePlayer,
} from '../../../domain/presence/protocol';
import type { AvatarId } from '../../../domain/avatar/identity';
import type { VoiceServiceStatus, VoiceState } from '../../../domain/voice/protocol';

const SEND_INTERVAL_MS = 90;
const RECONNECT_DELAYS_MS = [750, 1_500, 3_000, 5_000, 10_000] as const;

export type WorldPresenceConnection = 'connecting' | 'online' | 'offline';

export interface WorldPresenceState {
  connection: WorldPresenceConnection;
  onlineCount: number;
}

interface WorldPresenceCallbacks {
  onPlayers(players: readonly PresencePlayer[]): void;
  onSelfAvatar(avatarId: AvatarId): void;
  onState(state: WorldPresenceState): void;
  onVoiceState(state: VoiceState): void;
  onVoiceService(service: VoiceServiceStatus): void;
}

function socketUrl(guildId: string): string {
  const url = new URL(
    `/api/auth/guilds/${encodeURIComponent(guildId)}/presence`,
    window.location.origin,
  );
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function sameLocation(left: ClientPresenceLocation | null, right: ClientPresenceLocation): boolean {
  return (
    left !== null &&
    left.x === right.x &&
    left.y === right.y &&
    left.direction === right.direction &&
    left.moving === right.moving &&
    left.scene === right.scene
  );
}

export class WorldPresenceClient {
  private socket: WebSocket | null = null;
  private selfId: string | null = null;
  private players = new Map<string, PresencePlayer>();
  private latestLocation: ClientPresenceLocation | null = null;
  private lastSentLocation: ClientPresenceLocation | null = null;
  private lastSentAt = 0;
  private sendTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private sequence = 0;
  private stopped = true;

  public constructor(
    private readonly guildId: string,
    private readonly callbacks: WorldPresenceCallbacks,
  ) {}

  public connect(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, 0);
  }

  public updateLocation(location: ClientPresenceLocation): void {
    this.latestLocation = location;
    if (sameLocation(this.lastSentLocation, location)) return;
    this.scheduleSend();
  }

  public disconnect(): void {
    this.stopped = true;
    if (this.sendTimer !== null) window.clearTimeout(this.sendTimer);
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.sendTimer = null;
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket?.readyState === WebSocket.CONNECTING) {
      socket.addEventListener('open', () => socket.close(1000, 'World left'), { once: true });
    } else if (socket?.readyState === WebSocket.OPEN) {
      socket.close(1000, 'World left');
    }
    this.players.clear();
  }

  private openSocket(): void {
    if (this.stopped) return;
    this.callbacks.onState({ connection: 'connecting', onlineCount: 0 });
    const socket = new WebSocket(socketUrl(this.guildId));
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (socket !== this.socket) return;
      this.reconnectAttempt = 0;
      this.lastSentLocation = null;
      this.flushLocation();
    });
    socket.addEventListener('message', (event) => {
      if (socket !== this.socket || typeof event.data !== 'string' || event.data.length > 128_000) {
        return;
      }
      this.handleMessage(event.data);
    });
    socket.addEventListener('close', () => this.handleDisconnect(socket));
    socket.addEventListener('error', () => {
      if (socket === this.socket && socket.readyState < WebSocket.CLOSING) socket.close();
    });
  }

  private handleMessage(raw: string): void {
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    const parsed = serverPresenceMessageSchema.safeParse(value);
    if (!parsed.success) return;

    const message = parsed.data;
    if (message.type === 'welcome') {
      this.selfId = message.selfId;
      this.callbacks.onSelfAvatar(message.selfAvatarId);
      this.players = new Map(
        message.players
          .filter((player) => player.id !== this.selfId)
          .map((player) => [player.id, player]),
      );
      this.callbacks.onVoiceService(message.voiceService);
      if (message.voiceState !== null) this.callbacks.onVoiceState(message.voiceState);
    } else if (message.type === 'player') {
      if (message.player.id !== this.selfId) this.players.set(message.player.id, message.player);
    } else if (message.type === 'leave') {
      this.players.delete(message.id);
    } else if (message.type === 'voice-state') {
      this.callbacks.onVoiceState(message.state);
      return;
    } else {
      this.callbacks.onVoiceService(message.service);
      return;
    }

    this.emitPlayers();
    this.callbacks.onState({ connection: 'online', onlineCount: this.players.size + 1 });
  }

  private handleDisconnect(socket: WebSocket): void {
    if (socket !== this.socket) return;
    this.socket = null;
    this.selfId = null;
    this.players.clear();
    this.callbacks.onPlayers([]);
    if (this.stopped) return;

    this.callbacks.onState({ connection: 'offline', onlineCount: 0 });
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private scheduleSend(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || this.latestLocation === null) return;
    const remaining = SEND_INTERVAL_MS - (performance.now() - this.lastSentAt);
    if (remaining <= 0) {
      this.flushLocation();
      return;
    }
    if (this.sendTimer !== null) return;
    this.sendTimer = window.setTimeout(() => {
      this.sendTimer = null;
      this.flushLocation();
    }, remaining);
  }

  private flushLocation(): void {
    const socket = this.socket;
    const location = this.latestLocation;
    if (!socket || socket.readyState !== WebSocket.OPEN || location === null) return;
    if (sameLocation(this.lastSentLocation, location)) return;

    const message: ClientPresenceMessage = {
      type: 'move',
      seq: ++this.sequence,
      ...location,
    };
    socket.send(JSON.stringify(message));
    this.lastSentLocation = { ...location };
    this.lastSentAt = performance.now();
  }

  private emitPlayers(): void {
    this.callbacks.onPlayers([...this.players.values()]);
  }
}
