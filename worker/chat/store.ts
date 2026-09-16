import {
  CHAT_PAGE_SIZE,
  CHAT_RETENTION_MS,
  CHAT_ROOM_LIMIT,
  GLOBAL_CHAT,
  PARTY_LIMIT,
  directRoomId,
  type ChatMessage,
  type ChatPerson,
  type ChatRoom,
  type PartyInvitation,
  type ChatErrorCode,
} from '../../src/domain/chat/protocol';

type MessageRow = {
  seq: number;
  id: string;
  client_id: string;
  room: string;
  sender: string;
  name: string;
  body: string;
  sent_at: number;
};
const message = (row: MessageRow): ChatMessage => ({
  id: row.id,
  requestId: row.client_id,
  sequence: row.seq,
  roomId: row.room,
  sender: { id: row.sender, name: row.name },
  body: row.body,
  sentAt: row.sent_at,
});

/** All queries run beside the world's sockets; no Discord or remote database per message. */
export class ChatStore {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS chat_people (id TEXT PRIMARY KEY, name TEXT NOT NULL, seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_rooms (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_members (room TEXT NOT NULL, player TEXT NOT NULL, PRIMARY KEY(room, player));
      CREATE TABLE IF NOT EXISTS chat_messages (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL,
        room TEXT NOT NULL, sender TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL,
        sent_at INTEGER NOT NULL, UNIQUE(sender, client_id));
      CREATE INDEX IF NOT EXISTS chat_messages_room_seq ON chat_messages(room, seq);
      CREATE INDEX IF NOT EXISTS chat_messages_time ON chat_messages(sent_at);
      CREATE INDEX IF NOT EXISTS chat_members_player ON chat_members(player, room);
      CREATE TABLE IF NOT EXISTS chat_rate (player TEXT PRIMARY KEY, start INTEGER NOT NULL, count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS party_invitations (id TEXT PRIMARY KEY, sender TEXT NOT NULL, recipient TEXT NOT NULL, party TEXT, expires INTEGER NOT NULL, status TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS party_invitations_recipient ON party_invitations(recipient, status);
    `);
  }
  party(player: string): ChatRoom | null {
    const row = this.storage.sql
      .exec<{ room: string }>(
        "SELECT m.room FROM chat_members m JOIN chat_rooms r ON m.room=r.id WHERE m.player=? AND r.kind='party' LIMIT 1",
        player,
      )
      .toArray()[0];
    return row ? this.room(row.room, player) : null;
  }
  invitations(player: string): PartyInvitation[] {
    return this.storage.sql
      .exec<{
        id: string;
        sender: string;
        recipient: string;
        party: string | null;
        expires: number;
      }>(
        "SELECT * FROM party_invitations WHERE (sender=? OR recipient=?) AND status='pending' AND expires>? ORDER BY expires LIMIT 20",
        player,
        player,
        Date.now(),
      )
      .toArray()
      .flatMap((row) => {
        const from = this.person(row.sender),
          to = this.person(row.recipient);
        if (!from || !to) return [];
        return [
          {
            id: row.id,
            from,
            to,
            partyName: row.party
              ? (this.room(row.party, row.sender)?.name ?? `${from.name}’s party`)
              : `${from.name}’s party`,
            expiresAt: row.expires,
          },
        ];
      });
  }
  invite(player: string, peer: string, requestId: string): ChatErrorCode | null {
    const previous = this.storage.sql
      .exec<{ sender: string; recipient: string }>(
        'SELECT sender,recipient FROM party_invitations WHERE id=?',
        requestId,
      )
      .toArray()[0];
    if (previous)
      return previous.sender === player && previous.recipient === peer ? null : 'CONFLICT';
    if (player === peer || !this.person(peer)) return 'NOT_ALLOWED';
    if (this.party(peer)) return 'ALREADY_IN_PARTY';
    const party = this.party(player);
    if (party && party.members.length >= PARTY_LIMIT) return 'PARTY_FULL';
    const pending = this.invitations(player);
    if (pending.some((i) => i.from.id === player && i.to.id === peer)) return null;
    if (pending.length >= 8 || this.invitations(peer).length >= 8) return 'RATE_LIMITED';
    this.storage.sql.exec(
      "INSERT INTO party_invitations VALUES (?,?,?,?,?,'pending')",
      requestId,
      player,
      peer,
      party?.id ?? null,
      Date.now() + 120_000,
    );
    return null;
  }
  answer(player: string, invitationId: string, accept: boolean): ChatErrorCode | null {
    return this.storage.transactionSync(() => {
      const row = this.storage.sql
        .exec<{
          sender: string;
          recipient: string;
          party: string | null;
          status: string;
          expires: number;
        }>('SELECT * FROM party_invitations WHERE id=?', invitationId)
        .toArray()[0];
      if (!row || row.recipient !== player) return 'NOT_ALLOWED';
      if (row.status !== 'pending')
        return row.status === (accept ? 'accepted' : 'declined') ? null : 'CONFLICT';
      if (row.expires <= Date.now()) return 'INVITATION_EXPIRED';
      if (accept) {
        if (this.party(player)) return 'ALREADY_IN_PARTY';
        const current = this.party(row.sender);
        if (row.party && current?.id !== row.party) return 'INVITATION_EXPIRED';
        if (current && current.members.length >= PARTY_LIMIT) return 'PARTY_FULL';
        const from = this.person(row.sender),
          to = this.person(player);
        if (!from || !to) return 'NOT_ALLOWED';
        this.setParty(
          current?.id ?? `party:${crypto.randomUUID()}`,
          current?.name ?? `${from.name}’s party`,
          [...(current?.members ?? [from]), to],
        );
      }
      this.storage.sql.exec(
        'UPDATE party_invitations SET status=? WHERE id=?',
        accept ? 'accepted' : 'declined',
        invitationId,
      );
      if (accept)
        this.storage.sql.exec(
          "UPDATE party_invitations SET status='declined' WHERE recipient=? AND status='pending'",
          player,
        );
      return null;
    });
  }
  leaveParty(player: string): void {
    const party = this.party(player);
    if (!party) return;
    this.storage.transactionSync(() => {
      this.setParty(
        party.id,
        party.name,
        party.members.filter((p) => p.id !== player),
      );
      this.storage.sql.exec(
        "UPDATE party_invitations SET status='declined' WHERE sender=? AND status='pending'",
        player,
      );
    });
  }
  person(id: string): ChatPerson | null {
    return (
      this.storage.sql
        .exec<ChatPerson>('SELECT id,name FROM chat_people WHERE id=?', id)
        .toArray()[0] ?? null
    );
  }
  remember(person: ChatPerson, now: number): void {
    this.storage.sql.exec(
      'INSERT INTO chat_people VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,seen=excluded.seen',
      person.id,
      person.name,
      now,
    );
  }
  room(id: string, player: string): ChatRoom | null {
    const latestSequence = this.storage.sql
      .exec<{ seq: number }>(
        'SELECT COALESCE(MAX(seq),0) AS seq FROM chat_messages WHERE room=?',
        id,
      )
      .one().seq;
    if (id === 'global') return { ...GLOBAL_CHAT, latestSequence };
    const row = this.storage.sql
      .exec<{ id: string; kind: 'party' | 'direct'; name: string }>(
        'SELECT r.id,r.kind,r.name FROM chat_rooms r JOIN chat_members m ON r.id=m.room WHERE r.id=? AND m.player=?',
        id,
        player,
      )
      .toArray()[0];
    if (!row) return null;
    return {
      ...row,
      latestSequence,
      members: this.storage.sql
        .exec<ChatPerson>(
          'SELECT p.id,p.name FROM chat_people p JOIN chat_members m ON p.id=m.player WHERE m.room=? ORDER BY p.id LIMIT 8',
          id,
        )
        .toArray(),
    };
  }
  rooms(player: string): ChatRoom[] {
    const rows = this.storage.sql
      .exec<{ id: string }>(
        `SELECT r.id FROM chat_rooms r JOIN chat_members m ON r.id=m.room WHERE m.player=?
       ORDER BY COALESCE((SELECT MAX(seq) FROM chat_messages WHERE room=r.id),0) DESC LIMIT 99`,
        player,
      )
      .toArray();
    return [
      this.room('global', player)!,
      ...rows.flatMap(({ id }) => {
        const room = this.room(id, player);
        return room ? [room] : [];
      }),
    ];
  }
  direct(self: string, peer: string): ChatRoom | null {
    if (self === peer || !this.person(peer)) return null;
    const id = directRoomId(self, peer);
    this.storage.transactionSync(() => {
      this.storage.sql.exec(
        "INSERT OR IGNORE INTO chat_rooms VALUES (?,'direct','Direct',?)",
        id,
        Date.now(),
      );
      for (const player of [self, peer])
        this.storage.sql.exec('INSERT OR IGNORE INTO chat_members VALUES (?,?)', id, player);
    });
    return this.room(id, self);
  }
  /** Only trusted party actions may change the roster; clients never supply members. */
  setParty(id: string, name: string, members: readonly ChatPerson[]): void {
    if (
      !/^party:[0-9a-f-]{36}$/u.test(id) ||
      members.length > 8 ||
      new Set(members.map((p) => p.id)).size !== members.length
    )
      throw new Error('INVALID_PARTY');
    this.storage.transactionSync(() => {
      this.storage.sql.exec(
        "INSERT INTO chat_rooms VALUES (?,'party',?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name",
        id,
        name.slice(0, 100),
        Date.now(),
      );
      this.storage.sql.exec('DELETE FROM chat_members WHERE room=?', id);
      for (const person of members) {
        this.remember(person, Date.now());
        this.storage.sql.exec('INSERT INTO chat_members VALUES (?,?)', id, person.id);
      }
    });
  }
  history(room: string, before?: number) {
    const rows = this.storage.sql
      .exec<MessageRow>(
        'SELECT * FROM chat_messages WHERE room=? AND seq<? AND sent_at>? ORDER BY seq DESC LIMIT ?',
        room,
        before ?? Number.MAX_SAFE_INTEGER,
        Date.now() - CHAT_RETENTION_MS,
        CHAT_PAGE_SIZE + 1,
      )
      .toArray();
    return {
      messages: rows.slice(0, CHAT_PAGE_SIZE).reverse().map(message),
      hasMore: rows.length > CHAT_PAGE_SIZE,
    };
  }
  previous(sender: string, requestId: string): ChatMessage | null {
    const row = this.storage.sql
      .exec<MessageRow>(
        'SELECT * FROM chat_messages WHERE sender=? AND client_id=?',
        sender,
        requestId,
      )
      .toArray()[0];
    return row ? message(row) : null;
  }
  allow(player: string, now: number, limit = 20): boolean {
    const rate = this.storage.sql
      .exec<{ start: number; count: number }>(
        'SELECT start,count FROM chat_rate WHERE player=?',
        player,
      )
      .toArray()[0];
    if (!rate || now - rate.start >= 10_000) {
      this.storage.sql.exec(
        'INSERT INTO chat_rate VALUES (?,?,1) ON CONFLICT(player) DO UPDATE SET start=excluded.start,count=1',
        player,
        now,
      );
      return true;
    }
    if (rate.count >= limit) return false;
    this.storage.sql.exec('UPDATE chat_rate SET count=count+1 WHERE player=?', player);
    return true;
  }
  append(sender: ChatPerson, roomId: string, requestId: string, body: string): ChatMessage {
    return this.storage.transactionSync(() => {
      const id = crypto.randomUUID(),
        now = Date.now();
      const row = this.storage.sql
        .exec<MessageRow>(
          'INSERT INTO chat_messages(id,client_id,room,sender,name,body,sent_at) VALUES (?,?,?,?,?,?,?) RETURNING *',
          id,
          requestId,
          roomId,
          sender.id,
          sender.name,
          body,
          now,
        )
        .one();
      this.storage.sql.exec(
        'DELETE FROM chat_messages WHERE room=? AND seq NOT IN (SELECT seq FROM chat_messages WHERE room=? ORDER BY seq DESC LIMIT ?)',
        roomId,
        roomId,
        CHAT_ROOM_LIMIT,
      );
      return message(row);
    });
  }
  prune(now: number): void {
    this.storage.sql.exec('DELETE FROM party_invitations WHERE expires<?', now - 60 * 60 * 1000);
    this.storage.sql.exec('DELETE FROM chat_messages WHERE sent_at<?', now - CHAT_RETENTION_MS);
    this.storage.sql.exec('DELETE FROM chat_rate WHERE start<?', now - 60_000);
    this.storage.sql.exec(
      "DELETE FROM chat_members WHERE room IN (SELECT r.id FROM chat_rooms r WHERE kind='direct' AND created_at<? AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.room=r.id))",
      now - CHAT_RETENTION_MS,
    );
    this.storage.sql.exec(
      "DELETE FROM chat_rooms WHERE kind='direct' AND NOT EXISTS (SELECT 1 FROM chat_members WHERE room=id)",
    );
    this.storage.sql.exec(
      "DELETE FROM chat_rooms WHERE kind='party' AND NOT EXISTS (SELECT 1 FROM chat_members WHERE room=id) AND NOT EXISTS (SELECT 1 FROM chat_messages WHERE room=id)",
    );
    this.storage.sql.exec(
      'DELETE FROM chat_people WHERE seen<? AND NOT EXISTS (SELECT 1 FROM chat_members WHERE player=id)',
      now - CHAT_RETENTION_MS,
    );
  }
}
