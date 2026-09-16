import { z } from 'zod';
import { DurableObject } from 'cloudflare:workers';
import {
  chatCommandSchema,
  chatPersonSchema,
  type ChatEvent,
  type ChatErrorCode,
  type ChatRoom,
} from '../../src/domain/chat/protocol';
import { sessionIsCurrent, type WorldActor } from '../live-world/session-access';
import { readAuthorizedWorld } from '../live-world/service';
import { WorldAccessError } from '../live-world/coordinator';
import { ChatStore } from './store';
import { publicLabel } from '../../src/domain/map/labels';

const LEASE_MS = 30_000;
const attachmentSchema = z.strictObject({
  person: chatPersonSchema,
  guildId: z.string().regex(/^\d{1,20}$/u),
  userId: z.string().regex(/^\d{1,20}$/u),
  sessionHash: z.string().min(32).max(100),
  expires: z.number().int().positive(),
  authorizedUntil: z.number(),
  seen: z.number(),
  area: z.string().max(80).optional(),
  away: z.boolean().optional(),
});
type Attachment = z.infer<typeof attachmentSchema>;
// The world authority has a strict wire contract. Socket metadata is not an actor.
function worldActor({ guildId, userId, sessionHash }: Attachment): WorldActor {
  return { guildId, userId, sessionHash };
}
function attached(socket: WebSocket): Attachment | null {
  const result = attachmentSchema.safeParse(socket.deserializeAttachment());
  return result.success ? result.data : null;
}
function send(socket: WebSocket, event: ChatEvent): void {
  try {
    socket.send(JSON.stringify(event));
  } catch {
    /* Reconnect recovers persisted history. */
  }
}

/** One independent, hibernating chat hub per guild. Private routing never trusts a client roster. */
export class GameChat extends DurableObject<Env> {
  readonly store: ChatStore;
  private guildId: string | null = null;
  private lastPrune = 0;
  constructor(
    private readonly state: DurableObjectState,
    env: Env,
  ) {
    super(state, env);
    this.store = new ChatStore(state.storage);
    state.blockConcurrencyWhile(async () => {
      this.guildId = (await state.storage.get<string>('guild')) ?? null;
      this.lastPrune = (await state.storage.get<number>('last-prune')) ?? 0;
    });
  }
  async fetch(request: Request): Promise<Response> {
    if (
      new URL(request.url).pathname !== '/connect' ||
      request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
    )
      return new Response(null, { status: 400 });
    let person: unknown;
    try {
      person = JSON.parse(decodeURIComponent(request.headers.get('x-chat-person') ?? 'null'));
    } catch {
      return new Response(null, { status: 400 });
    }
    const parsed = attachmentSchema.safeParse({
      person,
      guildId: request.headers.get('x-chat-guild'),
      userId: request.headers.get('x-chat-user'),
      sessionHash: request.headers.get('x-chat-session'),
      expires: Number(request.headers.get('x-chat-expires')),
      authorizedUntil: 0,
      seen: Date.now(),
    });
    if (!parsed.success || (this.guildId && parsed.data.guildId !== this.guildId))
      return new Response(null, { status: 403 });
    if (
      this.state.getWebSockets().length >= 200 ||
      this.state.getWebSockets(parsed.data.person.id).length >= 4
    )
      return new Response(null, { status: 429 });
    const a = parsed.data;
    // Internal callers must also be authenticated; HTTP headers are never the membership proof.
    try {
      if (!(await sessionIsCurrent(this.env, a, Date.now())))
        return new Response(null, { status: 401 });
      await readAuthorizedWorld(this.env, worldActor(a));
    } catch (error) {
      return new Response(null, {
        status: error instanceof WorldAccessError && error.status < 500 ? 403 : 503,
      });
    }
    if (!this.guildId) {
      this.guildId = a.guildId;
      await this.state.storage.put('guild', a.guildId);
    }
    if (
      this.guildId !== a.guildId ||
      this.state.getWebSockets().length >= 200 ||
      this.state.getWebSockets(a.person.id).length >= 4
    )
      return new Response(null, { status: 429 });
    a.authorizedUntil = Date.now() + LEASE_MS;
    const pair = new WebSocketPair(),
      client = pair[0],
      server = pair[1];
    this.store.remember(a.person, Date.now());
    this.state.acceptWebSocket(server, [a.person.id]);
    server.serializeAttachment(a);
    send(server, {
      type: 'welcome',
      self: a.person,
      rooms: this.store.rooms(a.person.id),
      people: this.people(),
    });
    send(server, { type: 'social', invitations: this.store.invitations(a.person.id) });
    this.publishPeople();
    await this.state.storage.setAlarm(Date.now() + LEASE_MS);
    return new Response(null, { status: 101, webSocket: client });
  }
  private fail(socket: WebSocket, code: ChatErrorCode, requestId?: string): void {
    send(socket, { type: 'error', code, ...(requestId ? { requestId } : {}) });
  }
  private async authorize(socket: WebSocket): Promise<Attachment | null> {
    const a = attached(socket),
      now = Date.now();
    if (!a || a.expires * 1000 <= now) {
      this.fail(socket, 'SESSION_EXPIRED');
      socket.close(1008, 'Session expired');
      return null;
    }
    if (a.authorizedUntil > now) return a;
    try {
      if (!(await sessionIsCurrent(this.env, a, now))) {
        this.fail(socket, 'SESSION_EXPIRED');
        socket.close(1008, 'Session expired');
        return null;
      }
      await readAuthorizedWorld(this.env, worldActor(a));
      a.authorizedUntil = Date.now() + LEASE_MS;
      socket.serializeAttachment(a);
      return a;
    } catch (error) {
      const denied = error instanceof WorldAccessError && error.status < 500;
      this.fail(socket, denied ? 'NOT_ALLOWED' : 'UNAVAILABLE');
      socket.close(denied ? 1008 : 1013, denied ? 'Access changed' : 'Access check unavailable');
      return null;
    }
  }
  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const initial = attached(socket);
    if (!initial || !this.store.allow(`${initial.person.id}:frames`, Date.now(), 80)) {
      this.fail(socket, 'RATE_LIMITED');
      socket.close(1008, 'Too many requests');
      return;
    }
    if (typeof raw !== 'string' || raw.length > 8192) {
      this.fail(socket, 'INVALID_MESSAGE');
      socket.close(1009, 'Message too large');
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      this.fail(socket, 'INVALID_MESSAGE');
      socket.close(1008, 'Invalid message');
      return;
    }
    const parsed = chatCommandSchema.safeParse(value);
    if (!parsed.success) {
      this.fail(socket, 'INVALID_MESSAGE');
      socket.close(1008, 'Invalid message');
      return;
    }
    const command = parsed.data;
    const a = await this.authorize(socket);
    if (!a || socket.readyState !== WebSocket.OPEN) return;
    a.seen = Date.now();
    socket.serializeAttachment(a);
    if (command.type === 'ping') {
      send(socket, { type: 'pong' });
      // Membership can change while a panel is open; remove revoked party access immediately.
      send(socket, { type: 'rooms', rooms: this.store.rooms(a.person.id) });
      send(socket, { type: 'social', invitations: this.store.invitations(a.person.id) });
      return;
    }
    if (command.type === 'presence') {
      const area = publicLabel(command.area, 'Exploring');
      if (a.area !== area || a.away !== command.away) {
        a.area = area;
        a.away = command.away;
        socket.serializeAttachment(a);
        this.publishPeople();
      }
      return;
    }
    try {
      if (
        command.type === 'party-invite' ||
        command.type === 'party-answer' ||
        command.type === 'party-leave'
      ) {
        if (!this.store.allow(`${a.person.id}:social`, Date.now(), 12)) {
          this.fail(socket, 'RATE_LIMITED', command.requestId);
          return;
        }
        const error =
          command.type === 'party-invite'
            ? this.people().some((p) => p.id === command.peerId)
              ? this.store.invite(a.person.id, command.peerId, command.requestId)
              : 'NOT_ALLOWED'
            : command.type === 'party-answer'
              ? this.store.answer(a.person.id, command.invitationId, command.accept)
              : (this.store.leaveParty(a.person.id), null);
        if (error) this.fail(socket, error, command.requestId);
        else {
          for (const peer of this.state.getWebSockets()) {
            const member = attached(peer);
            if (!member || member.authorizedUntil <= Date.now()) continue;
            send(peer, { type: 'rooms', rooms: this.store.rooms(member.person.id) });
            send(peer, {
              type: 'social',
              invitations: this.store.invitations(member.person.id),
              ...(peer === socket ? { requestId: command.requestId } : {}),
            });
          }
        }
        return;
      }
      if (command.type === 'direct') {
        if (!this.store.allow(a.person.id, Date.now())) {
          this.fail(socket, 'RATE_LIMITED', command.requestId);
          return;
        }
        const room = this.store.direct(a.person.id, command.peerId);
        if (!room) {
          this.fail(socket, 'NOT_ALLOWED', command.requestId);
          return;
        }
        send(socket, {
          type: 'history',
          requestId: command.requestId,
          room,
          ...this.store.history(room.id),
        });
        return;
      }
      const room = this.store.room(command.roomId, a.person.id);
      if (!room) {
        this.fail(socket, 'NOT_ALLOWED', command.requestId);
        return;
      }
      if (command.type === 'history') {
        if (!this.store.allow(a.person.id, Date.now(), 40)) {
          this.fail(socket, 'RATE_LIMITED', command.requestId);
          return;
        }
        send(socket, {
          type: 'history',
          requestId: command.requestId,
          room,
          ...this.store.history(room.id, command.before),
        });
        return;
      }
      const previous = this.store.previous(a.person.id, command.requestId);
      if (previous) {
        if (previous.roomId !== room.id || previous.body !== command.body)
          this.fail(socket, 'CONFLICT', command.requestId);
        else send(socket, { type: 'ack', requestId: command.requestId, message: previous });
        return;
      }
      if (!this.store.allow(a.person.id, Date.now())) {
        this.fail(socket, 'RATE_LIMITED', command.requestId);
        return;
      }
      const message = this.store.append(a.person, room.id, command.requestId, command.body);
      // SQLite commit and the Durable Object output gate precede acknowledgement/fanout.
      send(socket, { type: 'ack', requestId: command.requestId, message });
      this.broadcast(room, { type: 'message', room, message });
    } catch {
      this.fail(socket, 'UNAVAILABLE', command.requestId);
    }
  }
  private broadcast(room: ChatRoom, event: ChatEvent): void {
    const now = Date.now();
    const sockets =
      room.kind === 'global'
        ? this.state.getWebSockets()
        : room.members.flatMap((person) => this.state.getWebSockets(person.id));
    for (const socket of sockets) {
      const a = attached(socket);
      if (a && a.authorizedUntil > now && a.expires * 1000 > now && now - a.seen < 60_000)
        send(socket, event);
    }
  }
  private people() {
    const now = Date.now();
    return [
      ...new Map(
        this.state.getWebSockets().flatMap((socket) => {
          const a = attached(socket);
          return a && a.authorizedUntil > now && a.expires * 1000 > now && now - a.seen < 60_000
            ? [
                [
                  a.person.id,
                  {
                    ...a.person,
                    ...(a.area ? { area: a.area } : {}),
                    status: a.away ? ('away' as const) : ('online' as const),
                  },
                ] as const,
              ]
            : [];
        }),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name));
  }
  private publishPeople(): void {
    const event: ChatEvent = { type: 'people', people: this.people() };
    for (const socket of this.state.getWebSockets()) {
      const a = attached(socket);
      if (a && a.authorizedUntil > Date.now()) send(socket, event);
    }
  }
  webSocketClose(socket: WebSocket, code: number): void {
    socket.close([1005, 1006, 1015].includes(code) ? 1000 : code);
    this.publishPeople();
  }
  webSocketError(socket: WebSocket): void {
    socket.close(1011, 'Reconnect to chat');
    this.publishPeople();
  }
  async alarm(): Promise<void> {
    if (Date.now() - this.lastPrune > 60 * 60 * 1000) {
      for (const socket of this.state.getWebSockets()) {
        const a = attached(socket);
        if (a && Date.now() - a.seen < 60_000) this.store.remember(a.person, Date.now());
      }
      this.store.prune(Date.now());
      this.lastPrune = Date.now();
      await this.state.storage.put('last-prune', this.lastPrune);
    }
    for (const socket of this.state.getWebSockets()) {
      const a = attached(socket);
      if (!a || Date.now() - a.seen > 60_000 || a.expires * 1000 <= Date.now())
        socket.close(1001, 'Reconnect to chat');
    }
    this.publishPeople();
    // Retention is enforced even when every player is offline.
    await this.state.storage.setAlarm(
      Date.now() + (this.state.getWebSockets().length ? LEASE_MS : 60 * 60 * 1000),
    );
  }
}
