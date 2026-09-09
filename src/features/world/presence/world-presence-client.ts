import type { AvatarId } from '../../../domain/avatar/identity';
import type { WorldSync, WorldView } from '../../../domain/channels/protocol';
import type {
  MessageErrorCode,
  MessageHistory,
  MessageSendInput,
  RoomMessage,
} from '../../../domain/messages/protocol';
import {
  serverPresenceMessageSchema,
  type ClientPresenceLocation,
  type ClientPresenceMessage,
  type PresencePlayer,
} from '../../../domain/presence/protocol';
import type {
  VoiceApiResponse,
  VoiceServiceStatus,
  VoiceState,
} from '../../../domain/voice/protocol';
import type {
  RpgAdmission,
  RpgAppearanceId,
  RpgLocation,
  RpgPresencePlayer,
  RpgWelcome,
} from '../../../domain/presence/rpg-protocol';

export interface RpgPresenceOptions {
  admission: RpgAdmission & { theme: 'village' | 'norse' };
  onWelcome(welcome: RpgWelcome): void;
  onPlayers(players: readonly RpgPresencePlayer[]): void;
  onPosition(player: RpgPresencePlayer): void;
}

const SEND_INTERVAL_MS = 90;
const MAX_INCOMING_MESSAGE_BYTES = 768 * 1_024;
const RECONNECT_DELAYS_MS = [750, 1_500, 3_000, 5_000, 10_000] as const;
const MESSAGE_REQUEST_TIMEOUT_MS = 10_000;

export type WorldPresenceConnection = 'connecting' | 'online' | 'offline';

export interface WorldPresenceState {
  connection: WorldPresenceConnection;
  onlineCount: number;
}

export interface WorldPresenceCallbacks {
  onPlayers(players: readonly PresencePlayer[]): void;
  onSelfAvatar(avatarId: AvatarId): void;
  onState(state: WorldPresenceState): void;
  onVoiceState(state: VoiceState): void;
  onVoiceService(service: VoiceServiceStatus): void;
  onVoiceSnapshot?(response: VoiceApiResponse): void;
  onWorldView?(view: WorldView): void;
  onWorldSync?(sync: WorldSync): void;
  onRoomMessage?(message: RoomMessage): void;
  recoverAdmission?(signal: AbortSignal): Promise<WorldView>;
}

export type MessageSendOutcome =
  | { status: 'applied'; message: RoomMessage }
  | { status: 'uncertain'; code: 'MESSAGE_ACTION_UNCERTAIN' };

export class MessageRequestError extends Error {
  public constructor(
    public readonly code: MessageErrorCode,
    public readonly retryAt?: number,
  ) {
    super(code);
    this.name = 'MessageRequestError';
  }
}

type RecoveryKind = 'admission' | 'socket';

interface AdmissionFailure {
  code: string;
  retryAt: number;
  scope?: 'admission' | 'mutation';
}

function socketUrl(guildId: string, rpg?: RpgPresenceOptions): string {
  const url = new URL(
    `/api/auth/guilds/${encodeURIComponent(guildId)}/presence`,
    window.location.origin,
  );
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (rpg) url.search = new URLSearchParams(rpg.admission).toString();
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

function isWithinIncomingLimit(raw: string): boolean {
  if (raw.length > MAX_INCOMING_MESSAGE_BYTES) return false;
  return new TextEncoder().encode(raw).byteLength <= MAX_INCOMING_MESSAGE_BYTES;
}

function admissionFailure(error: unknown): AdmissionFailure {
  if (typeof error !== 'object' || error === null) {
    return { code: 'WORLD_SOURCE_UNAVAILABLE', retryAt: 0, scope: 'admission' };
  }
  const candidate = error as { code?: unknown; retryAt?: unknown; scope?: unknown };
  return {
    code: typeof candidate.code === 'string' ? candidate.code : 'WORLD_SOURCE_UNAVAILABLE',
    retryAt:
      typeof candidate.retryAt === 'number' && Number.isFinite(candidate.retryAt)
        ? candidate.retryAt
        : 0,
    scope:
      candidate.scope === 'admission' || candidate.scope === 'mutation'
        ? candidate.scope
        : undefined,
  };
}

function admissionFailureSync(failure: AdmissionFailure): WorldSync {
  if (failure.code === 'UNAUTHENTICATED' || failure.code === 'GUILD_MEMBERSHIP_REQUIRED') {
    return { state: 'denied', code: failure.code };
  }
  if (failure.retryAt > Date.now()) {
    return {
      state: 'cooldown',
      scope: failure.scope ?? 'admission',
      retryAt: failure.retryAt,
      code: failure.code,
    };
  }
  if (failure.code === 'GATEWAY_UPDATE_REQUIRED' || failure.code === 'WORLD_SOURCE_UNAVAILABLE') {
    return { state: 'offline', code: failure.code };
  }
  return { state: 'recovering', code: failure.code };
}

export class WorldPresenceClient {
  private socket: WebSocket | null = null;
  private selfId: string | null = null;
  private players = new Map<string, PresencePlayer>();
  private latestLocation: ClientPresenceLocation | null = null;
  private lastSentLocation: ClientPresenceLocation | null = null;
  private rpgPlayers = new Map<string, RpgPresencePlayer>();
  private latestRpgLocation: RpgLocation | null = null;
  private lastSentRpgLocation: string | null = null;
  private rpgReady = false;
  private rpgPublishTimer: number | null = null;
  private lastSentAt = 0;
  private sendTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private scheduledRecovery: RecoveryKind | null = null;
  private recoveryController: AbortController | null = null;
  private reconnectAttempt = 0;
  private serverRetryAt = 0;
  private admissionAttempted = false;
  private retryBlocked = false;
  private transportOffline = false;
  private generation = 0;
  private sequence = 0;
  private stopped = true;
  private readonly invalidFrameSockets = new WeakSet<WebSocket>();
  private readonly cooldownSockets = new WeakSet<WebSocket>();
  private readonly pendingMessageReads = new Map<
    string,
    {
      resolve(result: MessageHistory): void;
      reject(error: MessageRequestError): void;
      timeout: number;
    }
  >();
  private readonly pendingMessageSends = new Map<
    string,
    {
      resolve(result: MessageSendOutcome): void;
      reject(error: MessageRequestError): void;
      timeout: number;
    }
  >();

  public constructor(
    private readonly guildId: string,
    private readonly callbacks: WorldPresenceCallbacks,
    private readonly rpg?: RpgPresenceOptions,
  ) {}

  public connect(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.transportOffline = false;
    this.retryBlocked = false;
    this.serverRetryAt = 0;
    this.admissionAttempted = false;
    this.reconnectAttempt = 0;
    this.generation += 1;
    const generation = this.generation;
    this.reconnectTimer = window.setTimeout(() => {
      if (this.stopped || generation !== this.generation) return;
      this.reconnectTimer = null;
      this.openSocket();
    }, 0);
  }

  /** Allows Task 8's browser `online` event to resume a genuinely offline transport. */
  public resume(): void {
    if (
      this.stopped ||
      !this.transportOffline ||
      this.socket !== null ||
      this.recoveryController !== null ||
      this.retryBlocked
    ) {
      return;
    }
    if (Date.now() < this.serverRetryAt) {
      if (this.reconnectTimer === null) this.scheduleRecovery('admission');
      return;
    }

    const scheduledRecovery = this.scheduledRecovery;
    this.clearReconnectTimer();
    if (scheduledRecovery === 'admission') {
      this.beginAdmissionRecovery(true);
    } else if (!this.admissionAttempted && this.callbacks.recoverAdmission) {
      this.beginAdmissionRecovery(false);
    } else {
      this.openSocket();
    }
  }

  public updateLocation(location: ClientPresenceLocation): void {
    if (this.rpg) return;
    this.latestLocation = location;
    if (sameLocation(this.lastSentLocation, location)) return;
    if (this.lastSentLocation?.scene !== location.scene) {
      this.clearSendTimer();
      this.flushLocation();
      return;
    }
    this.scheduleSend();
  }

  public updateRpgLocation(location: RpgLocation): void {
    if (!this.rpgReady || location.scene !== this.rpg?.admission.scene) return;
    this.latestRpgLocation = location;
    if (location.action === 'idle') {
      this.clearSendTimer();
      this.flushLocation();
      return;
    }
    this.scheduleSend();
  }

  public updateRpgAppearance(appearance: RpgAppearanceId): void {
    if (!this.rpgReady || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'rpg-appearance', appearance }));
  }

  public pauseRpgMovement(): void {
    if (!this.latestRpgLocation) return;
    this.latestRpgLocation = { ...this.latestRpgLocation, action: 'idle' };
    this.clearSendTimer();
    this.flushLocation();
  }

  public readMessages(roomKey: string): Promise<MessageHistory> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new MessageRequestError('WORLD_SOURCE_UNAVAILABLE'));
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingMessageReads.delete(requestId);
        reject(new MessageRequestError('MESSAGE_READ_FAILED'));
      }, MESSAGE_REQUEST_TIMEOUT_MS);
      this.pendingMessageReads.set(requestId, { resolve, reject, timeout });
      try {
        socket.send(JSON.stringify({ type: 'message-read', requestId, roomKey }));
      } catch {
        window.clearTimeout(timeout);
        this.pendingMessageReads.delete(requestId);
        reject(new MessageRequestError('WORLD_SOURCE_UNAVAILABLE'));
      }
    });
  }

  public sendMessage(input: MessageSendInput): Promise<MessageSendOutcome> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new MessageRequestError('WORLD_SOURCE_UNAVAILABLE'));
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingMessageSends.delete(requestId);
        resolve({ status: 'uncertain', code: 'MESSAGE_ACTION_UNCERTAIN' });
      }, MESSAGE_REQUEST_TIMEOUT_MS);
      this.pendingMessageSends.set(requestId, { resolve, reject, timeout });
      try {
        socket.send(JSON.stringify({ type: 'message-send', requestId, input }));
      } catch {
        window.clearTimeout(timeout);
        this.pendingMessageSends.delete(requestId);
        reject(new MessageRequestError('WORLD_SOURCE_UNAVAILABLE'));
      }
    });
  }

  public disconnect(): void {
    this.flushLocation();
    this.stopped = true;
    this.generation += 1;
    this.clearSendTimer();
    this.clearReconnectTimer();
    this.recoveryController?.abort();
    this.recoveryController = null;
    this.transportOffline = false;
    const socket = this.socket;
    this.socket = null;
    if (socket?.readyState === WebSocket.CONNECTING) {
      socket.addEventListener('open', () => socket.close(1000, 'World left'), { once: true });
    } else if (socket?.readyState === WebSocket.OPEN) {
      socket.close(1000, 'World left');
    }
    this.selfId = null;
    this.rpgReady = false;
    this.rpgPlayers.clear();
    this.clearRpgPublishTimer();
    this.players.clear();
    this.settlePendingMessages();
  }

  private openSocket(): void {
    if (this.stopped || this.socket !== null || this.retryBlocked) return;
    if (Date.now() < this.serverRetryAt) {
      this.scheduleRecovery('admission');
      return;
    }
    this.transportOffline = false;
    const generation = this.generation;
    this.callbacks.onState({ connection: 'connecting', onlineCount: 0 });
    if (this.stopped || generation !== this.generation || this.socket !== null) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(socketUrl(this.guildId, this.rpg));
    } catch {
      this.handleSocketConstructionFailure();
      return;
    }
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.stopped || socket !== this.socket) return;
      this.lastSentLocation = null;
      this.lastSentRpgLocation = null;
      this.flushLocation();
    });
    socket.addEventListener('message', (event) => {
      if (this.stopped || socket !== this.socket) return;
      if (typeof event.data !== 'string') {
        this.rejectInvalidFrame(socket, 1003, 'Text messages only');
        return;
      }
      if (!isWithinIncomingLimit(event.data)) {
        this.rejectInvalidFrame(socket, 1009, 'World message too large');
        return;
      }
      this.handleMessage(socket, event.data);
    });
    socket.addEventListener('close', () => this.handleDisconnect(socket));
    socket.addEventListener('error', () => {
      if (socket === this.socket && socket.readyState < WebSocket.CLOSING) socket.close();
    });
  }

  private handleMessage(socket: WebSocket, raw: string): void {
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      this.rejectInvalidFrame(socket, 1007, 'Invalid world message');
      return;
    }
    const parsed = serverPresenceMessageSchema.safeParse(value);
    if (!parsed.success) {
      this.rejectInvalidFrame(socket, 1007, 'Invalid world message');
      return;
    }

    const message = parsed.data;
    if (message.type === 'rpg-player' || message.type === 'rpg-leave') {
      if (!this.rpgReady) return;
      if (message.type === 'rpg-leave') this.rpgPlayers.delete(message.id);
      else if (
        message.player.id !== this.selfId &&
        message.player.scene === this.rpg?.admission.scene
      )
        this.rpgPlayers.set(message.player.id, message.player);
      // A crowded town can deliver many members' packets in one render frame.
      // Keep interpolation snapshots bounded independently of the peer count.
      if (this.rpgPublishTimer === null) {
        this.rpgPublishTimer = window.setTimeout(() => {
          this.rpgPublishTimer = null;
          if (this.stopped || !this.rpgReady || socket !== this.socket) return;
          this.emitPlayers();
          this.callbacks.onState({ connection: 'online', onlineCount: this.rpgPlayers.size + 1 });
        }, 50);
      }
      return;
    }
    if (message.type === 'rpg-position') {
      if (
        !this.rpgReady ||
        message.player.id !== this.selfId ||
        message.player.scene !== this.rpg?.admission.scene
      )
        return;
      this.clearSendTimer();
      this.latestRpgLocation = null;
      this.lastSentRpgLocation = null;
      this.rpg?.onPosition(message.player);
      return;
    }
    if (message.type === 'world-invalidated') {
      // Temporary wire compatibility only. Content-free invalidations must not issue a GET.
      return;
    }
    if (message.type === 'world-view') {
      this.callbacks.onWorldView?.(message.view);
      return;
    }
    if (message.type === 'world-sync') {
      this.handleWorldSync(socket, message.sync);
      return;
    }
    if (message.type === 'message-history') {
      const pending = this.pendingMessageReads.get(message.requestId);
      if (pending !== undefined) {
        window.clearTimeout(pending.timeout);
        this.pendingMessageReads.delete(message.requestId);
        pending.resolve(message.result);
      }
      return;
    }
    if (message.type === 'message-read-error') {
      const pending = this.pendingMessageReads.get(message.requestId);
      if (pending !== undefined) {
        window.clearTimeout(pending.timeout);
        this.pendingMessageReads.delete(message.requestId);
        pending.reject(new MessageRequestError(message.code));
      }
      return;
    }
    if (message.type === 'message-send-result') {
      const pending = this.pendingMessageSends.get(message.requestId);
      if (pending !== undefined) {
        window.clearTimeout(pending.timeout);
        this.pendingMessageSends.delete(message.requestId);
        if (message.status === 'rejected') {
          pending.reject(new MessageRequestError(message.code, message.retryAt));
        } else if (message.status === 'applied') {
          pending.resolve({ status: 'applied', message: message.message });
        } else {
          pending.resolve({ status: 'uncertain', code: message.code });
        }
      }
      return;
    }
    if (message.type === 'room-message') {
      this.callbacks.onRoomMessage?.(message.message);
      return;
    }
    if (message.type === 'welcome') {
      if (message.worldView === undefined) {
        this.rejectInvalidFrame(socket, 1007, 'Missing world state');
        return;
      }

      this.selfId = message.selfId;
      if (this.rpg) {
        const admission = this.rpg.admission;
        if (
          !message.rpg ||
          message.rpg.worldId !== admission.worldId ||
          message.rpg.checksum !== admission.checksum ||
          message.rpg.scene !== admission.scene ||
          message.rpg.self.id !== message.selfId ||
          message.rpg.self.scene !== admission.scene
        ) {
          this.rejectInvalidFrame(socket, 1007, 'Wrong town admission');
          return;
        }
        this.rpgPlayers = new Map(
          message.rpg.players
            .filter((player) => player.id !== this.selfId && player.scene === admission.scene)
            .map((player) => [player.id, player]),
        );
        this.latestRpgLocation = null;
        this.rpgReady = true;
        this.rpg.onWelcome(message.rpg);
        if (this.stopped || socket !== this.socket) return;
      } else if (message.rpg) {
        this.rejectInvalidFrame(socket, 1007, 'Unexpected town admission');
        return;
      }
      this.players = new Map(
        message.players
          .filter((player) => player.id !== this.selfId)
          .map((player) => [player.id, player]),
      );
      this.reconnectAttempt = 0;
      this.serverRetryAt = 0;
      this.admissionAttempted = false;
      this.retryBlocked = false;
      this.callbacks.onWorldView?.(message.worldView);
      if (this.stopped || socket !== this.socket) return;
      this.callbacks.onWorldSync?.({ state: 'ready' });
      if (this.stopped || socket !== this.socket) return;
      this.callbacks.onSelfAvatar(message.selfAvatarId);
      if (this.stopped || socket !== this.socket) return;
      if (this.callbacks.onVoiceSnapshot) {
        this.callbacks.onVoiceSnapshot({
          service: message.voiceService,
          state: message.voiceState,
        });
      } else {
        this.callbacks.onVoiceService(message.voiceService);
        if (this.stopped || socket !== this.socket) return;
        if (message.voiceState !== null) this.callbacks.onVoiceState(message.voiceState);
      }
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

    if (this.stopped || socket !== this.socket) return;
    this.emitPlayers();
    if (this.stopped || socket !== this.socket) return;
    this.callbacks.onState({
      connection: 'online',
      onlineCount: (this.rpg ? this.rpgPlayers.size : this.players.size) + 1,
    });
  }

  private handleWorldSync(socket: WebSocket, sync: WorldSync): void {
    this.callbacks.onWorldSync?.(sync);
    if (this.stopped || socket !== this.socket) return;

    if (sync.state === 'ready') {
      this.retryBlocked = false;
      this.serverRetryAt = 0;
      return;
    }
    if (sync.state === 'denied') {
      this.retryBlocked = true;
      this.clearReconnectTimer();
      socket.close(1008, 'World access denied');
      return;
    }
    if (sync.state === 'cooldown' && sync.scope === 'admission') {
      this.serverRetryAt = sync.retryAt;
      this.cooldownSockets.add(socket);
      socket.close(1013, 'World admission cooldown');
    }
  }

  private rejectInvalidFrame(socket: WebSocket, closeCode: number, reason: string): void {
    if (socket !== this.socket) return;
    this.invalidFrameSockets.add(socket);
    this.callbacks.onWorldSync?.({
      state: 'offline',
      code: 'WORLD_SOURCE_UNAVAILABLE',
    });
    if (this.stopped || socket !== this.socket) return;
    socket.close(closeCode, reason);
  }

  private handleSocketConstructionFailure(): void {
    if (this.stopped) return;
    const generation = this.generation;
    this.transportOffline = true;
    this.clearPlayers();
    if (this.stopped || generation !== this.generation) return;
    this.callbacks.onState({ connection: 'offline', onlineCount: 0 });
    if (this.stopped || generation !== this.generation) return;
    this.callbacks.onWorldSync?.({
      state: 'recovering',
      code: 'WORLD_SOURCE_UNAVAILABLE',
    });
    if (this.stopped || generation !== this.generation) return;
    this.beginUntypedRecovery();
  }

  private handleDisconnect(socket: WebSocket): void {
    if (socket !== this.socket) return;
    this.socket = null;
    this.selfId = null;
    this.rpgReady = false;
    this.transportOffline = true;
    this.clearSendTimer();
    this.settlePendingMessages();
    const generation = this.generation;
    this.clearPlayers();
    if (this.stopped || generation !== this.generation) return;

    this.callbacks.onState({ connection: 'offline', onlineCount: 0 });
    if (this.stopped || generation !== this.generation) return;
    if (this.retryBlocked || this.reconnectTimer !== null || this.recoveryController !== null)
      return;
    if (this.cooldownSockets.has(socket)) {
      this.scheduleRecovery('admission');
      return;
    }
    if (this.invalidFrameSockets.has(socket)) {
      this.scheduleRecovery('socket');
      return;
    }
    this.callbacks.onWorldSync?.({
      state: 'recovering',
      code: 'WORLD_SOURCE_UNAVAILABLE',
    });
    if (this.stopped || generation !== this.generation) return;
    this.beginUntypedRecovery();
  }

  private beginUntypedRecovery(): void {
    if (!this.admissionAttempted && this.callbacks.recoverAdmission) {
      this.beginAdmissionRecovery(false);
      return;
    }
    this.scheduleRecovery('socket');
  }

  private beginAdmissionRecovery(force: boolean): void {
    if (
      this.stopped ||
      this.socket !== null ||
      this.recoveryController !== null ||
      this.retryBlocked
    ) {
      return;
    }
    const recoverAdmission = this.callbacks.recoverAdmission;
    if (!recoverAdmission) {
      this.scheduleRecovery('socket');
      return;
    }
    if (this.admissionAttempted && !force) {
      this.scheduleRecovery('socket');
      return;
    }

    this.admissionAttempted = true;
    this.clearReconnectTimer();
    const generation = this.generation;
    const controller = new AbortController();
    this.recoveryController = controller;
    void Promise.resolve()
      .then(() => recoverAdmission(controller.signal))
      .then(
        (view) => this.handleAdmissionSuccess(controller, generation, view),
        (error: unknown) => this.handleAdmissionFailure(controller, generation, error),
      );
  }

  private handleAdmissionSuccess(
    controller: AbortController,
    generation: number,
    view: WorldView,
  ): void {
    if (!this.isCurrentRecovery(controller, generation)) return;
    this.recoveryController = null;
    this.serverRetryAt = 0;
    this.retryBlocked = false;
    this.callbacks.onWorldView?.(view);
    if (this.stopped || generation !== this.generation || this.socket !== null) return;
    this.callbacks.onWorldSync?.({ state: 'ready' });
    if (this.stopped || generation !== this.generation || this.socket !== null) return;
    this.openSocket();
  }

  private handleAdmissionFailure(
    controller: AbortController,
    generation: number,
    error: unknown,
  ): void {
    if (!this.isCurrentRecovery(controller, generation)) return;
    this.recoveryController = null;
    const failure = admissionFailure(error);
    const sync = admissionFailureSync(failure);
    this.callbacks.onWorldSync?.(sync);
    if (this.stopped || generation !== this.generation || this.socket !== null) return;

    if (sync.state === 'denied') {
      this.retryBlocked = true;
      this.clearReconnectTimer();
      return;
    }
    if (sync.state === 'cooldown' && sync.scope === 'admission') {
      this.serverRetryAt = sync.retryAt;
      this.scheduleRecovery('admission');
      return;
    }
    this.scheduleRecovery('socket');
  }

  private isCurrentRecovery(controller: AbortController, generation: number): boolean {
    return (
      !controller.signal.aborted &&
      controller === this.recoveryController &&
      generation === this.generation &&
      !this.stopped
    );
  }

  private scheduleRecovery(kind: RecoveryKind): void {
    if (
      this.stopped ||
      this.socket !== null ||
      this.recoveryController !== null ||
      this.retryBlocked
    ) {
      return;
    }
    this.clearReconnectTimer();
    const base =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ??
      10_000;
    const reconnectDelay = Math.round(base * (0.8 + Math.random() * 0.4));
    const wait = Math.max(reconnectDelay, this.serverRetryAt - Date.now());
    this.reconnectAttempt += 1;
    this.scheduledRecovery = kind;
    const generation = this.generation;
    this.reconnectTimer = window.setTimeout(() => {
      if (this.stopped || generation !== this.generation || this.socket !== null) return;
      this.reconnectTimer = null;
      this.scheduledRecovery = null;
      if (kind === 'admission') this.beginAdmissionRecovery(true);
      else this.openSocket();
    }, wait);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.scheduledRecovery = null;
  }

  private scheduleSend(): void {
    const socket = this.socket;
    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      (this.rpg ? !this.rpgReady || this.latestRpgLocation === null : this.latestLocation === null)
    )
      return;
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
    if (this.rpg) {
      const location = this.latestRpgLocation;
      if (!this.rpgReady || !socket || socket.readyState !== WebSocket.OPEN || !location) return;
      const encoded = JSON.stringify(location);
      if (encoded === this.lastSentRpgLocation) return;
      socket.send(JSON.stringify({ type: 'rpg-move', seq: ++this.sequence, ...location }));
      this.lastSentRpgLocation = encoded;
      this.lastSentAt = performance.now();
      return;
    }
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

  private clearSendTimer(): void {
    if (this.sendTimer !== null) window.clearTimeout(this.sendTimer);
    this.sendTimer = null;
  }

  private settlePendingMessages(): void {
    for (const pending of this.pendingMessageReads.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(new MessageRequestError('WORLD_SOURCE_UNAVAILABLE'));
    }
    this.pendingMessageReads.clear();
    for (const pending of this.pendingMessageSends.values()) {
      window.clearTimeout(pending.timeout);
      pending.resolve({ status: 'uncertain', code: 'MESSAGE_ACTION_UNCERTAIN' });
    }
    this.pendingMessageSends.clear();
  }

  private clearPlayers(): void {
    this.clearRpgPublishTimer();
    this.players.clear();
    this.rpgPlayers.clear();
    this.rpg?.onPlayers([]);
    this.callbacks.onPlayers([]);
  }

  private emitPlayers(): void {
    if (this.rpg) {
      this.rpg.onPlayers([...this.rpgPlayers.values()]);
      return;
    }
    this.callbacks.onPlayers([...this.players.values()]);
  }

  private clearRpgPublishTimer(): void {
    if (this.rpgPublishTimer !== null) window.clearTimeout(this.rpgPublishTimer);
    this.rpgPublishTimer = null;
  }
}
