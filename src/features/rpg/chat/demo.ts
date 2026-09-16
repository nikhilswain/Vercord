import {
  CHAT_PAGE_SIZE,
  GLOBAL_CHAT,
  directRoomId,
  type ChatCommand,
  type ChatEvent,
  type ChatMessage,
  type ChatRoom,
  type PartyInvitation,
} from '../../../domain/chat/protocol';
import type { ChatConnection, ChatTransport } from './transport';

export const CHAT_GUIDE_ID = 'demo-chat-guide';
export const CHAT_GUIDE = { id: `p_${'n'.repeat(43)}`, name: 'Wren' };
const SELF = { id: `p_${'d'.repeat(43)}`, name: 'You' };
const PARTY: ChatRoom = {
  id: 'party:7a44cd14-7b52-4333-bc17-77a15e10b32b',
  kind: 'party',
  name: 'Wren’s trail party',
  members: [SELF, CHAT_GUIDE],
};

/** Explicit local NPC simulation. It speaks the real protocol without impersonating live players. */
export class DemoChatTransport implements ChatTransport {
  private receive: (event: ChatEvent) => void = () => {};
  private status: (state: ChatConnection) => void = () => {};
  private running = false;
  private rooms: ChatRoom[] = [GLOBAL_CHAT];
  private messages: ChatMessage[] = [];
  private sequence = 0;
  private invitations: PartyInvitation[] = [];
  private area = 'Willowmere';
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  start(receive: (event: ChatEvent) => void, status: (state: ChatConnection) => void): void {
    this.receive = receive;
    this.status = status;
    this.running = true;
    this.resume();
  }
  private emit(event: ChatEvent): void {
    queueMicrotask(() => {
      if (this.running) this.receive(event);
    });
  }
  resume(): void {
    if (!this.running) return;
    this.status('online');
    this.emit({
      type: 'welcome',
      self: SELF,
      people: [SELF, { ...CHAT_GUIDE, area: this.area, status: 'online' }],
      rooms: this.rooms,
    });
    this.emit({ type: 'social', invitations: this.invitations });
  }
  inviteParty(): void {
    if (this.rooms.some((r) => r.kind === 'party')) return;
    this.invitations = [
      {
        id: crypto.randomUUID(),
        from: CHAT_GUIDE,
        to: SELF,
        partyName: PARTY.name,
        expiresAt: Date.now() + 120_000,
      },
    ];
    this.emit({ type: 'social', invitations: this.invitations });
  }
  joinParty(): void {
    if (this.rooms.some((room) => room.id === PARTY.id)) return;
    this.rooms = [...this.rooms, PARTY];
    this.emit({ type: 'rooms', rooms: this.rooms });
    this.reply(
      PARTY,
      'You’re in my trail party! Messages here stay with our party. Try a direct message to me too.',
    );
  }
  private reply(room: ChatRoom, body: string): void {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      sequence: ++this.sequence,
      roomId: room.id,
      sender: CHAT_GUIDE,
      body,
      sentAt: Date.now(),
    };
    this.messages.push(message);
    this.messages = this.messages.slice(-500);
    this.emit({ type: 'message', room, message });
  }
  send(command: ChatCommand): boolean {
    if (!this.running) return false;
    if (command.type === 'ping') {
      this.emit({ type: 'pong' });
      return true;
    }
    if (command.type === 'presence') {
      this.area = command.area || 'Willowmere';
      this.emit({
        type: 'people',
        people: [
          { ...SELF, area: this.area, status: command.away ? 'away' : 'online' },
          { ...CHAT_GUIDE, area: this.area, status: 'online' },
        ],
      });
      return true;
    }
    if (
      command.type === 'party-invite' ||
      command.type === 'party-answer' ||
      command.type === 'party-leave'
    ) {
      if (command.type === 'party-invite') {
        if (command.peerId !== CHAT_GUIDE.id)
          this.emit({ type: 'error', requestId: command.requestId, code: 'NOT_ALLOWED' });
        else this.inviteParty();
      } else if (command.type === 'party-answer') {
        const invitation = this.invitations.find((i) => i.id === command.invitationId);
        if (!invitation || invitation.expiresAt <= Date.now()) {
          this.emit({ type: 'error', requestId: command.requestId, code: 'INVITATION_EXPIRED' });
          return true;
        }
        this.invitations = [];
        if (command.accept) this.joinParty();
      } else {
        this.rooms = this.rooms.filter((r) => r.kind !== 'party');
        this.emit({ type: 'rooms', rooms: this.rooms });
      }
      this.emit({ type: 'social', invitations: this.invitations, requestId: command.requestId });
      return true;
    }
    if (command.type === 'direct') {
      if (command.peerId !== CHAT_GUIDE.id) {
        this.emit({ type: 'error', requestId: command.requestId, code: 'NOT_ALLOWED' });
        return true;
      }
      const room: ChatRoom = {
        id: directRoomId(SELF.id, CHAT_GUIDE.id),
        kind: 'direct',
        name: 'Direct',
        members: [SELF, CHAT_GUIDE],
      };
      if (!this.rooms.some((item) => item.id === room.id)) this.rooms.push(room);
      this.history(command.requestId, room);
      return true;
    }
    const room = this.rooms.find((item) => item.id === command.roomId);
    if (!room) {
      this.emit({ type: 'error', requestId: command.requestId, code: 'NOT_ALLOWED' });
      return true;
    }
    if (command.type === 'history') {
      this.history(command.requestId, room, command.before);
      return true;
    }
    const previous = this.messages.find(
      (m) => m.sender.id === SELF.id && m.requestId === command.requestId,
    );
    if (previous) {
      this.emit({ type: 'ack', requestId: command.requestId, message: previous });
      return true;
    }
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      requestId: command.requestId,
      sequence: ++this.sequence,
      roomId: room.id,
      sender: SELF,
      body: command.body,
      sentAt: Date.now(),
    };
    this.messages.push(message);
    this.messages = this.messages.slice(-500);
    this.emit({ type: 'ack', requestId: command.requestId, message });
    this.emit({ type: 'message', room, message });
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.rooms.some((r) => r.id === room.id)) return;
      const body = /hello|hi\b|hey/iu.test(command.body)
        ? 'Hello, traveler. Good to see you on the trail.'
        : /temple|ritual/iu.test(command.body)
          ? 'The Rootbound Temple lies beyond the forest. Follow the trail when you’re ready.'
          : /party|join/iu.test(command.body)
            ? 'Talk to me near the village arrival path to join my trail party.'
            : room.kind === 'direct'
              ? 'Your whisper reached me. Only the two of us see this direct conversation.'
              : room.kind === 'party'
                ? 'Heard you, trailmate. This message stays in our party.'
                : 'Heard you across the clearing! Anyone heading for the forest?';
      this.reply(room, body);
    }, 650);
    this.timers.add(timer);
    return true;
  }
  private history(requestId: string, room: ChatRoom, before = Number.MAX_SAFE_INTEGER): void {
    const all = this.messages.filter((m) => m.roomId === room.id && m.sequence < before);
    this.emit({
      type: 'history',
      requestId,
      room,
      messages: all.slice(-CHAT_PAGE_SIZE),
      hasMore: all.length > CHAT_PAGE_SIZE,
    });
  }
  stop(): void {
    this.running = false;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}
