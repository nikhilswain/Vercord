import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  CHAT_BODY_LIMIT,
  PARTY_LIMIT,
  directRoomId,
  type ChatRoom,
} from '../../../domain/chat/protocol';
import { RpgHudPanel } from '../ui/RpgHudPanel';
import { RpgIcon } from '../RpgIcon';
import { GameChatClient, type ChatEntry } from './client';
import { PartyMembers } from './PartyMembers';
import './chat.css';

const EMPTY: ChatEntry[] = [];
const clock = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
function roomName(room: ChatRoom, self: string | undefined) {
  return room.kind === 'direct'
    ? (room.members.find((p) => p.id !== self)?.name ?? 'Traveler')
    : room.kind === 'global'
      ? 'World'
      : room.name;
}

export const GameChatToggle = memo(function GameChatToggle({
  client,
  onOpen,
}: {
  client: GameChatClient;
  onOpen(): void;
}) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const unread = Object.values(state.unread).reduce((sum, n) => sum + n, 0);
  return (
    <button
      type="button"
      className="rpg-button rpg-chat-toggle"
      onClick={onOpen}
      aria-label={unread ? `Chat, ${unread} unread` : 'Open chat'}
    >
      <RpgIcon name="chat" />
      <span>Chat</span>
      {unread > 0 ? <span className="rpg-chat-badge">{Math.min(99, unread)}</span> : <kbd>T</kbd>}
    </button>
  );
});

export function ChatConnectionNotice({
  client,
  context = 'chat',
}: {
  client: GameChatClient;
  context?: 'chat' | 'register';
}) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  return (
    <>
      {state.connection !== 'online' && (
        <div className="rpg-chat-connection" role="status">
          <span>
            {state.connection === 'denied'
              ? 'Access ended. Reopen this world or sign in again.'
              : context === 'register'
                ? state.people.length
                  ? 'The register is reconnecting. These travelers were last seen online.'
                  : 'Connecting to the traveler register…'
                : state.connection === 'connecting'
                  ? 'Connecting…'
                  : 'Chat disconnected. Your draft is kept.'}
          </span>
          <button type="button" className="rpg-social-link" onClick={client.resume}>
            Reconnect
          </button>
        </div>
      )}
      {state.error && (
        <div className="rpg-chat-error" role="alert">
          <span>{state.error}</span>
          <button
            type="button"
            className="rpg-social-icon"
            aria-label="Dismiss chat error"
            onClick={() => client.clearError()}
          >
            <RpgIcon name="close" />
          </button>
        </div>
      )}
    </>
  );
}

export const GameChatPanel = memo(function GameChatPanel({
  client,
  open,
  onClose,
  onPlayers,
  onFocusChange,
}: {
  client: GameChatClient;
  open: boolean;
  onClose(): void;
  onPlayers(): void;
  onFocusChange(focused: boolean): void;
}) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const [drafts, setDrafts] = useState<Record<string, string>>({}),
    [query, setQuery] = useState(''),
    [directOrigin, setDirectOrigin] = useState<{ roomId: string; partyId: string } | null>(null),
    [below, setBelow] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null),
    search = useRef<HTMLInputElement>(null),
    log = useRef<HTMLDivElement>(null);
  const stick = useRef(true),
    previousRoom = useRef(''),
    priorHeight = useRef<number | null>(null);
  const active = state.rooms.find((room) => room.id === state.active),
    party = state.rooms.find((room) => room.kind === 'party');
  const entries = state.messages[state.active] ?? EMPTY,
    draft = drafts[state.active] ?? '';
  const online = state.connection === 'online',
    isDirect = active?.kind === 'direct';
  const returnParty =
    directOrigin?.roomId === active?.id && party?.id === directOrigin?.partyId ? party : undefined;
  const channel =
    isDirect || state.active === 'direct-list'
      ? 'direct'
      : active?.kind === 'party' || state.active === 'party-empty'
        ? 'party'
        : 'global';
  useEffect(() => {
    client.open(open);
  }, [client, open]);
  useLayoutEffect(() => {
    const element = log.current;
    if (!element || !open) return;
    if (priorHeight.current !== null) {
      element.scrollTop += element.scrollHeight - priorHeight.current;
      priorHeight.current = null;
    } else if (stick.current || previousRoom.current !== state.active)
      element.scrollTop = element.scrollHeight;
    else setBelow(true);
    previousRoom.current = state.active;
  }, [entries, state.active, open]);
  const submit = () => {
    if (client.send(draft)) setDrafts((previous) => ({ ...previous, [state.active]: '' }));
    input.current?.focus();
  };
  const peers = [
    ...new Map(
      [
        ...state.people.filter((p) => p.id !== state.self?.id),
        ...state.rooms
          .filter((r) => r.kind === 'direct')
          .flatMap((r) => r.members.filter((p) => p.id !== state.self?.id)),
      ].map((p) => [p.id, p]),
    ).values(),
  ].filter((p) => p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return (
    <RpgHudPanel
      allowGameplay
      open={open}
      title={isDirect ? roomName(active, state.self?.id) : channel === 'party' ? 'Party' : 'Chat'}
      onClose={onClose}
      onFocusChange={onFocusChange}
      leading={
        isDirect && (
          <button
            type="button"
            className="rpg-social-icon"
            aria-label={returnParty ? 'Back to party chat' : 'Back to conversations'}
            onClick={() => {
              client.select(returnParty?.id ?? 'direct-list');
              setDirectOrigin(null);
            }}
          >
            ‹
          </button>
        )
      }
      actions={
        active?.kind === 'party' && (
          <PartyMembers
            key={active.id}
            client={client}
            party={active}
            onMessage={(peerId) => {
              if (!state.self) return;
              setDirectOrigin({ roomId: directRoomId(peerId, state.self.id), partyId: active.id });
              client.direct(peerId);
            }}
          />
        )
      }
      footer={
        active && (
          <>
            {active.kind === 'party' && (
              <div className="rpg-party-chat-actions">
                {active.members.length < PARTY_LIMIT && (
                  <button type="button" className="rpg-social-link" onClick={onPlayers}>
                    Invite player
                  </button>
                )}
                <button
                  type="button"
                  className="rpg-social-link"
                  disabled={!online || state.socialPending}
                  onClick={() => client.leaveParty()}
                >
                  Leave party
                </button>
              </div>
            )}
            <form
              className="rpg-chat-compose"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <label className="rpg-social-sr" htmlFor="game-chat-message">
                Message {roomName(active, state.self?.id)}
              </label>
              <div className="rpg-chat-input-row">
                <textarea
                  ref={input}
                  data-autofocus
                  id="game-chat-message"
                  rows={1}
                  maxLength={CHAT_BODY_LIMIT}
                  value={draft}
                  style={{ resize: 'none' }}
                  placeholder={
                    active.kind === 'global'
                      ? 'Say something…'
                      : active.kind === 'party'
                        ? 'Message party…'
                        : `Message ${roomName(active, state.self?.id)}…`
                  }
                  onChange={(event) =>
                    setDrafts((previous) => ({ ...previous, [state.active]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing &&
                      !event.repeat
                    ) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  aria-describedby="game-chat-help"
                />
                <button
                  type="submit"
                  className="rpg-social-icon"
                  disabled={!online || !draft.trim()}
                  aria-label="Send message"
                  title="Send message (Enter)"
                >
                  ↵
                </button>
              </div>
              <div id="game-chat-help" className="rpg-chat-compose-help">
                <span>Enter to send · Shift + Enter for new line</span>
                {draft.length > 800 && (
                  <span>
                    {draft.length}/{CHAT_BODY_LIMIT}
                  </span>
                )}
              </div>
            </form>
          </>
        )
      }
    >
      {!isDirect && (
        <div className="rpg-chat-channel">
          <label className="rpg-social-sr" htmlFor="game-chat-channel">
            Chat channel
          </label>
          <select
            id="game-chat-channel"
            value={channel}
            onChange={(event) => {
              setDirectOrigin(null);
              client.select(
                event.target.value === 'party'
                  ? (party?.id ?? 'party-empty')
                  : event.target.value === 'direct'
                    ? 'direct-list'
                    : 'global',
              );
            }}
          >
            <option value="global">World</option>
            <option value="party">Party</option>
            <option value="direct">Direct</option>
          </select>
          {channel === 'party' && party && <small title={party.name}>{party.name}</small>}
        </div>
      )}
      <ChatConnectionNotice client={client} />
      {state.active === 'direct-list' ? (
        <div className="rpg-chat-directory">
          <label className="rpg-social-sr" htmlFor="game-chat-search">
            Find traveler
          </label>
          <div className="rpg-chat-search">
            <input
              ref={search}
              data-autofocus
              id="game-chat-search"
              placeholder="Find traveler…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                className="rpg-social-icon"
                aria-label="Clear traveler search"
                onClick={() => {
                  setQuery('');
                  search.current?.focus();
                }}
              >
                <RpgIcon name="close" />
              </button>
            )}
          </div>
          <ul>
            {peers.map((person) => {
              const present = online ? state.people.find((p) => p.id === person.id) : undefined,
                id = directRoomId(person.id, state.self?.id ?? ''),
                last = state.messages[id]?.at(-1);
              return (
                <li key={person.id}>
                  <button type="button" onClick={() => client.direct(person.id)} disabled={!online}>
                    <span
                      className="rpg-social-dot"
                      data-online={Boolean(present) && present?.status !== 'away'}
                      aria-label={
                        present?.status === 'away' ? 'Away' : present ? 'Online' : 'Offline'
                      }
                    />
                    <span className="rpg-social-row-text">
                      <strong>{person.name}</strong>
                      <small>
                        {last?.body ?? (present?.area || (present ? 'Online' : 'Offline'))}
                      </small>
                    </span>
                    {(state.unread[id] ?? 0) > 0 && <small>{state.unread[id]}</small>}
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {peers.length === 0 && (
            <p className="rpg-chat-empty">
              {query
                ? 'No traveler matches that name.'
                : 'Travelers appear here when they enter this world.'}
            </p>
          )}
        </div>
      ) : !active ? (
        <div className="rpg-chat-empty">
          <h3>No party yet</h3>
          <p>Choose a traveler in Players and invite them along.</p>
          <button type="button" className="rpg-social-link" onClick={onPlayers}>
            Open Players
          </button>
        </div>
      ) : (
        <>
          <div
            className="rpg-chat-log"
            ref={log}
            role="log"
            aria-label={`${roomName(active, state.self?.id)} messages`}
            aria-live="polite"
            aria-relevant="additions"
            aria-busy={state.loading}
            onScroll={() => {
              const el = log.current!;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 36;
              if (stick.current) setBelow(false);
            }}
          >
            {state.hasMore[active.id] && (
              <button
                type="button"
                className="rpg-social-link"
                disabled={state.loading}
                onClick={() => {
                  priorHeight.current = log.current?.scrollHeight ?? null;
                  client.history(active.id, entries[0]?.sequence);
                }}
              >
                Earlier messages
              </button>
            )}
            {state.loading && entries.length === 0 ? (
              <p className="rpg-chat-empty">Loading messages…</p>
            ) : (
              entries.length === 0 && (
                <p className="rpg-chat-empty">The trail is quiet. Say hello.</p>
              )
            )}
            <ol>
              {entries.map((entry) => (
                <li
                  key={`${entry.sender.id}:${entry.requestId}`}
                  data-own={entry.sender.id === state.self?.id}
                >
                  <div className="rpg-chat-message-meta">
                    <strong>
                      {entry.sender.id === state.self?.id ? 'You' : entry.sender.name}
                    </strong>
                    <time dateTime={new Date(entry.sentAt).toISOString()}>
                      {clock.format(entry.sentAt)}
                    </time>
                  </div>
                  <p>{entry.body}</p>
                  {entry.delivery === 'sending' && <small>Sending…</small>}
                  {entry.delivery === 'failed' && (
                    <div className="rpg-chat-retry">
                      <small>Not confirmed</small>
                      <button
                        type="button"
                        className="rpg-social-link"
                        disabled={!online}
                        onClick={() => client.retry(entry)}
                      >
                        Retry message
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
          {below && (
            <button
              type="button"
              className="rpg-social-link rpg-chat-new"
              onClick={() => {
                if (log.current) log.current.scrollTop = log.current.scrollHeight;
                stick.current = true;
                setBelow(false);
              }}
            >
              New messages ↓
            </button>
          )}
        </>
      )}
    </RpgHudPanel>
  );
});
