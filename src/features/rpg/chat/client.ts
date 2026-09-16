import {
  CHAT_BUFFER_LIMIT,
  CHAT_BODY_LIMIT,
  chatCommandSchema,
  GLOBAL_CHAT,
  type ChatCommand,
  type ChatEvent,
  type ChatMessage,
  type ChatPerson,
  type ChatOnlinePerson,
  type PartyInvitation,
  type ChatRoom,
} from '../../../domain/chat/protocol';
import type { ChatConnection, ChatTransport } from './transport';

export type ChatEntry = ChatMessage & { delivery: 'sending' | 'sent' | 'failed' };
export interface ChatState {
  connection: ChatConnection;
  self: ChatPerson | null;
  people: ChatOnlinePerson[];
  invitations: PartyInvitation[];
  socialPending: boolean;
  rooms: ChatRoom[];
  messages: Record<string, ChatEntry[]>;
  unread: Record<string, number>;
  active: string;
  opened: boolean;
  loading: boolean;
  hasMore: Record<string, boolean>;
  error: string | null;
}
const errors = {
  INVALID_MESSAGE: `Use 1–${CHAT_BODY_LIMIT} characters.`,
  NOT_ALLOWED: 'This conversation is no longer available.',
  RATE_LIMITED: 'You’re sending quickly. Wait a few seconds and try again.',
  UNAVAILABLE: 'Chat could not confirm this request. You can retry.',
  CONFLICT: 'This message could not be retried. Copy it into a new message.',
  SESSION_EXPIRED: 'Your session ended. Sign in again to chat.',
  PARTY_FULL: 'That party is full. Up to four travelers can join.',
  ALREADY_IN_PARTY: 'That traveler is already in a party.',
  INVITATION_EXPIRED: 'That invitation expired. Ask for another.',
};

/** Bounded UI state, acknowledgements and deduplication shared by live chat and the NPC demo. */
export class GameChatClient {
  private state: ChatState = {
    connection: 'connecting',
    self: null,
    people: [],
    invitations: [],
    socialPending: false,
    rooms: [GLOBAL_CHAT],
    messages: {},
    unread: {},
    active: 'global',
    opened: false,
    loading: false,
    hasMore: {},
    error: null,
  };
  private readonly listeners = new Set<() => void>();
  private socialRequest: { id: string; timer: ReturnType<typeof setTimeout> } | null = null;
  private location = { area: '', away: false };
  private readonly pending = new Map<
    string,
    { command: Extract<ChatCommand, { type: 'send' }>; timer: ReturnType<typeof setTimeout> }
  >();
  private request: {
    id: string;
    room: string | null;
    before?: number;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  constructor(private readonly transport: ChatTransport) {}
  snapshot = (): ChatState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private patch(next: Partial<ChatState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }
  start(): void {
    this.transport.start(this.receive, (connection) => {
      this.patch({ connection });
      if (connection !== 'online') for (const id of this.pending.keys()) this.fail(id);
    });
  }
  stop(): void {
    this.transport.stop();
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
    if (this.request) clearTimeout(this.request.timer);
    this.request = null;
    if (this.socialRequest) clearTimeout(this.socialRequest.timer);
    this.socialRequest = null;
  }
  resume = (): void => this.transport.resume();
  presence(area: string, away: boolean): void {
    this.location = { area: area.slice(0, 80), away };
    if (this.state.connection === 'online')
      this.transport.send({ type: 'presence', ...this.location });
  }
  private social(
    command: Extract<ChatCommand, { type: 'party-invite' | 'party-answer' | 'party-leave' }>,
  ): void {
    if (this.state.connection !== 'online' || this.socialRequest) return;
    const timer = setTimeout(() => {
      this.socialRequest = null;
      this.patch({
        socialPending: false,
        error:
          'The party action was not confirmed. Reconnect to check your party before trying again.',
      });
    }, 10_000);
    this.socialRequest = { id: command.requestId, timer };
    this.patch({ socialPending: true, error: null });
    if (!this.transport.send(command)) {
      clearTimeout(timer);
      this.socialRequest = null;
      this.patch({ socialPending: false, error: 'Reconnect before changing your party.' });
    }
  }
  invite(peerId: string): void {
    this.social({ type: 'party-invite', requestId: crypto.randomUUID(), peerId });
  }
  answer(invitationId: string, accept: boolean): void {
    this.social({ type: 'party-answer', requestId: crypto.randomUUID(), invitationId, accept });
  }
  leaveParty(): void {
    this.social({ type: 'party-leave', requestId: crypto.randomUUID() });
  }
  clearError(): void {
    this.patch({ error: null });
  }
  open(opened: boolean): void {
    this.patch({
      opened,
      unread: opened ? { ...this.state.unread, [this.state.active]: 0 } : this.state.unread,
    });
    if (
      opened &&
      this.state.connection === 'online' &&
      !this.request &&
      this.state.rooms.some((room) => room.id === this.state.active)
    )
      this.history(this.state.active);
  }
  select(room: string): void {
    this.patch({ active: room, error: null, unread: { ...this.state.unread, [room]: 0 } });
    if (this.state.rooms.some((item) => item.id === room)) this.history(room);
    else {
      if (this.request) clearTimeout(this.request.timer);
      this.request = null;
      this.patch({ loading: false });
    }
  }
  private ask(
    command: Extract<ChatCommand, { type: 'history' | 'direct' }>,
    room: string | null,
    before?: number,
  ): void {
    if (this.request) clearTimeout(this.request.timer);
    const timer = setTimeout(() => {
      if (this.request?.id === command.requestId) {
        this.request = null;
        this.patch({ loading: false, error: 'Conversation could not load. Try again.' });
      }
    }, 12_000);
    this.request = { id: command.requestId, room, before, timer };
    this.patch({ loading: true, error: null });
    if (!this.transport.send(command)) {
      clearTimeout(timer);
      this.request = null;
      this.patch({ loading: false, error: 'Reconnect to load this conversation.' });
    }
  }
  history(room: string, before?: number): void {
    this.ask(
      {
        type: 'history',
        roomId: room,
        requestId: crypto.randomUUID(),
        ...(before ? { before } : {}),
      },
      room,
      before,
    );
  }
  direct(peerId: string): void {
    this.ask({ type: 'direct', requestId: crypto.randomUUID(), peerId }, null);
  }
  send(body: string): boolean {
    const text = body.trim(),
      self = this.state.self,
      room = this.state.active;
    if (!self || this.state.connection !== 'online' || !this.state.rooms.some((r) => r.id === room))
      return false;
    if (!text || text.length > CHAT_BODY_LIMIT || this.pending.size >= 5) {
      this.patch({
        error:
          this.pending.size >= 5
            ? 'Wait for your recent messages to finish sending.'
            : errors.INVALID_MESSAGE,
      });
      return false;
    }
    const requestId = crypto.randomUUID();
    if (
      !chatCommandSchema.safeParse({ type: 'send', requestId, roomId: room, body: text }).success
    ) {
      this.patch({ error: errors.INVALID_MESSAGE });
      return false;
    }
    this.merge(room, [
      {
        id: requestId,
        requestId,
        sequence: Number.MAX_SAFE_INTEGER,
        roomId: room,
        sender: self,
        body: text,
        sentAt: Date.now(),
        delivery: 'sending',
      },
    ]);
    this.dispatch({ type: 'send', requestId, roomId: room, body: text });
    return true;
  }
  retry(entry: ChatEntry): void {
    if (this.state.connection !== 'online' || this.pending.has(entry.requestId)) return;
    this.merge(entry.roomId, [{ ...entry, delivery: 'sending' }]);
    this.dispatch({
      type: 'send',
      requestId: entry.requestId,
      roomId: entry.roomId,
      body: entry.body,
    });
  }
  private dispatch(command: Extract<ChatCommand, { type: 'send' }>): void {
    this.patch({ error: null });
    const timer = setTimeout(() => this.fail(command.requestId), 10_000);
    this.pending.set(command.requestId, { command, timer });
    if (!this.transport.send(command)) this.fail(command.requestId);
  }
  private fail(requestId: string): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    const messages = this.state.messages[pending.command.roomId] ?? [];
    this.patch({
      messages: {
        ...this.state.messages,
        [pending.command.roomId]: messages.map((m) =>
          m.requestId === requestId && m.delivery !== 'sent' ? { ...m, delivery: 'failed' } : m,
        ),
      },
    });
  }
  private merge(room: string, entries: ChatEntry[], earlier = false): void {
    const previous = this.state.messages[room] ?? [];
    const byId = new Map(previous.map((entry) => [`${entry.sender.id}:${entry.requestId}`, entry]));
    for (const entry of entries) {
      const key = `${entry.sender.id}:${entry.requestId}`,
        old = byId.get(key);
      if (old?.delivery === 'sent' && entry.delivery !== 'sent') continue;
      byId.set(key, entry);
    }
    const sorted = [...byId.values()].sort(
      (a, b) => a.sequence - b.sequence || a.sentAt - b.sentAt,
    );
    const messages = {
      ...this.state.messages,
      [room]: earlier ? sorted.slice(0, CHAT_BUFFER_LIMIT) : sorted.slice(-CHAT_BUFFER_LIMIT),
    };
    // Keep only the 30 most recently used conversation buffers in memory.
    delete messages[room];
    messages[room] = earlier
      ? sorted.slice(0, CHAT_BUFFER_LIMIT)
      : sorted.slice(-CHAT_BUFFER_LIMIT);
    while (Object.keys(messages).length > 30) delete messages[Object.keys(messages)[0]!];
    this.patch({ messages });
  }
  private room(room: ChatRoom): void {
    this.patch({
      rooms: [room, ...this.state.rooms.filter((item) => item.id !== room.id)].slice(0, 100),
    });
  }
  private receive = (event: ChatEvent): void => {
    if (event.type === 'welcome') {
      this.transport.send({ type: 'presence', ...this.location });
      if (this.socialRequest) clearTimeout(this.socialRequest.timer);
      this.socialRequest = null;
      this.patch({ socialPending: false, invitations: [] });
      if (this.state.self && this.state.self.id !== event.self.id)
        this.patch({ messages: {}, unread: {}, hasMore: {}, active: 'global' });
      this.patch({ self: event.self, people: event.people, rooms: event.rooms, error: null });
      const active = event.rooms.some((room) => room.id === this.state.active)
        ? this.state.active
        : 'global';
      this.select(active);
      return;
    }
    if (event.type === 'social') {
      if (this.socialRequest && event.requestId === this.socialRequest.id) {
        clearTimeout(this.socialRequest.timer);
        this.socialRequest = null;
        this.patch({ socialPending: false });
      }
      this.patch({ invitations: event.invitations });
      return;
    }
    if (event.type === 'people') {
      this.patch({ people: event.people });
      return;
    }
    if (event.type === 'rooms') {
      const allowed = new Set(event.rooms.map((room) => room.id));
      this.patch({
        rooms: event.rooms,
        messages: Object.fromEntries(
          Object.entries(this.state.messages).filter(([id]) => allowed.has(id)),
        ),
        unread: Object.fromEntries(
          Object.entries(this.state.unread).filter(([id]) => allowed.has(id)),
        ),
      });
      const active = event.rooms.find((room) => room.id === this.state.active);
      const lastSeen = Math.max(
        0,
        ...(this.state.messages[this.state.active] ?? [])
          .filter((m) => m.delivery === 'sent')
          .map((m) => m.sequence),
      );
      if (active && (active.latestSequence ?? 0) > lastSeen && !this.request)
        this.history(active.id);
      return;
    }
    if (event.type === 'history') {
      if (this.request?.id !== event.requestId) return;
      const earlier = this.request.before !== undefined;
      clearTimeout(this.request.timer);
      this.request = null;
      this.room(event.room);
      // A long disconnect may exceed a page. Do not stitch a hidden gap into the transcript.
      const previous = this.state.messages[event.room.id] ?? [];
      if (
        !earlier &&
        event.hasMore &&
        previous.length &&
        !event.messages.some((m) => previous.some((old) => old.id === m.id))
      )
        this.patch({
          messages: {
            ...this.state.messages,
            [event.room.id]: previous.filter((m) => m.delivery !== 'sent'),
          },
        });
      this.merge(
        event.room.id,
        event.messages.map((message) => ({ ...message, delivery: 'sent' })),
        earlier,
      );
      this.patch({
        active: event.room.id,
        loading: false,
        hasMore: {
          ...this.state.hasMore,
          [event.room.id]:
            event.hasMore && (this.state.messages[event.room.id]?.length ?? 0) < CHAT_BUFFER_LIMIT,
        },
        unread: { ...this.state.unread, [event.room.id]: 0 },
      });
      return;
    }
    if (event.type === 'ack' || event.type === 'message') {
      const m = event.message;
      const exists = this.state.messages[m.roomId]?.some(
        (entry) =>
          entry.sender.id === m.sender.id &&
          entry.requestId === m.requestId &&
          entry.delivery === 'sent',
      );
      if (event.type === 'message') this.room(event.room);
      if (m.sender.id === this.state.self?.id) {
        const pending = this.pending.get(m.requestId);
        clearTimeout(pending?.timer);
        this.pending.delete(m.requestId);
      }
      this.merge(m.roomId, [{ ...m, delivery: 'sent' }]);
      if (
        !exists &&
        m.sender.id !== this.state.self?.id &&
        (!this.state.opened || this.state.active !== m.roomId)
      )
        this.patch({
          unread: {
            ...this.state.unread,
            [m.roomId]: Math.min(99, (this.state.unread[m.roomId] ?? 0) + 1),
          },
        });
      return;
    }
    if (event.type === 'error') {
      if (
        event.requestId &&
        event.requestId !== this.request?.id &&
        event.requestId !== this.socialRequest?.id &&
        !this.pending.has(event.requestId)
      )
        return;
      if (event.requestId) this.fail(event.requestId);
      if (this.socialRequest && event.requestId === this.socialRequest.id) {
        clearTimeout(this.socialRequest.timer);
        this.socialRequest = null;
        this.patch({ socialPending: false });
      }
      if (event.requestId === this.request?.id) {
        clearTimeout(this.request?.timer);
        this.request = null;
        this.patch({ loading: false });
      }
      this.patch({ error: errors[event.code] });
    }
  };
}
