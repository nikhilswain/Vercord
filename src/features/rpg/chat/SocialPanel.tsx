import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PARTY_LIMIT } from '../../../domain/chat/protocol';
import { RpgHudPanel } from '../ui/RpgHudPanel';
import { RpgIcon } from '../RpgIcon';
import { GameChatClient } from './client';
import { ChatConnectionNotice } from './GameChatPanel';

export const PlayersButton = memo(function PlayersButton({
  client,
  onOpen,
}: {
  client: GameChatClient;
  onOpen(): void;
}) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  return (
    <button
      type="button"
      className="rpg-players-toggle"
      onClick={onOpen}
      aria-label="Players"
      title="View online players"
    >
      <RpgIcon name="players" />
      <span>{state.connection === 'online' ? state.people.length : '–'} online</span>
    </button>
  );
});

export const PartyIndicator = memo(function PartyIndicator({
  client,
  onOpen,
}: {
  client: GameChatClient;
  onOpen(roomId: string): void;
}) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const party = state.rooms.find((room) => room.kind === 'party');
  if (!party) return null;
  return (
    <button
      type="button"
      className="rpg-party-indicator"
      onClick={() => onOpen(party.id)}
      aria-label={`Open party, ${party.members.length} members`}
    >
      <span>Party</span>
      <small>
        {party.members.length}/{PARTY_LIMIT}
      </small>
    </button>
  );
});

export const PartyInvitation = memo(function PartyInvitation({
  client,
  visible,
  onFocusChange,
}: {
  client: GameChatClient;
  visible: boolean;
  onFocusChange(focused: boolean): void;
}) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const [now, setNow] = useState(Date.now);
  const invitationFocused = useRef(false);
  useEffect(() => {
    if (!state.invitations.length) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.invitations]);
  const invitation = state.invitations.find((i) => i.to.id === state.self?.id && i.expiresAt > now);
  useEffect(
    () => () => {
      if (invitationFocused.current) {
        invitationFocused.current = false;
        onFocusChange(false);
      }
    },
    [invitation?.id, visible, onFocusChange],
  );
  if (!visible) return null;
  return (
    <>
      {invitation && (
        <aside
          className="rpg-party-invitation rpg-frame"
          aria-label="Party invitation"
          onKeyDown={(e) => e.stopPropagation()}
          onFocusCapture={() => {
            invitationFocused.current = true;
            onFocusChange(true);
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              invitationFocused.current = false;
              onFocusChange(false);
            }
          }}
        >
          <div role="status">
            <h3>Party invitation</h3>
            <p>
              {invitation.from.name} invited you to <strong>{invitation.partyName}</strong>.
            </p>
          </div>
          <div className="rpg-party-invitation-actions">
            <button
              type="button"
              className="rpg-button"
              disabled={state.socialPending || state.connection !== 'online'}
              onClick={() => client.answer(invitation.id, true)}
            >
              Accept
            </button>
            <button
              type="button"
              className="rpg-social-link"
              disabled={state.socialPending || state.connection !== 'online'}
              onClick={() => client.answer(invitation.id, false)}
            >
              Decline
            </button>
          </div>
          {state.error && <p role="alert">{state.error}</p>}
        </aside>
      )}
    </>
  );
});

export const SocialPanel = memo(function SocialPanel({
  client,
  open,
  onClose,
  onMessage,
  onFocusChange,
}: {
  client: GameChatClient;
  open: boolean;
  onClose(): void;
  onMessage(peerId: string): void;
  onFocusChange(focused: boolean): void;
}) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const online = state.connection === 'online';
  const party = state.rooms.find((r) => r.kind === 'party'),
    selected = online ? state.people.find((p) => p.id === selectedId) : undefined;
  const people = (online ? state.people : []).filter((p) =>
    p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const incoming = state.invitations.find(
    (i) => i.from.id === selectedId && i.to.id === state.self?.id,
  );
  const outgoing = state.invitations.some(
    (i) => i.to.id === selectedId && i.from.id === state.self?.id,
  );
  const ownMember = party?.members.some((p) => p.id === selectedId);
  return (
    <RpgHudPanel
      open={open}
      compact={Boolean(selected)}
      title={selected ? selected.name : 'Players'}
      onClose={onClose}
      onFocusChange={onFocusChange}
      leading={
        selected && (
          <button
            type="button"
            className="rpg-social-icon"
            aria-label="Back to players"
            onClick={() => setSelectedId(null)}
          >
            ‹
          </button>
        )
      }
    >
      <ChatConnectionNotice client={client} />
      {selected ? (
        <>
          <p className="rpg-social-subtitle">
            {selected.status === 'away' ? 'Away' : 'Online'}
            {selected.area ? ` · ${selected.area}` : ''}
          </p>
          {ownMember && <p className="rpg-social-subtitle">In your party · {party?.name}</p>}
          <div className="rpg-social-actions">
            {selected.id !== state.self?.id && (
              <button
                type="button"
                className="rpg-button"
                disabled={!online}
                onClick={() => onMessage(selected.id)}
              >
                Send message
              </button>
            )}
            {selected.id !== state.self?.id &&
              !ownMember &&
              !incoming &&
              (!party || party.members.length < PARTY_LIMIT) && (
                <button
                  type="button"
                  className="rpg-social-link"
                  disabled={!online || state.socialPending || outgoing}
                  onClick={() => client.invite(selected.id)}
                >
                  {outgoing ? 'Invitation sent' : 'Invite to party'}
                </button>
              )}
            {incoming && (
              <p className="rpg-social-subtitle">
                {selected.name} has invited you. Accept or decline the invitation below.
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="rpg-social-subtitle">
            {online ? `Online · ${state.people.length}` : 'Checking who’s here…'}
          </p>
          <label className="rpg-social-sr" htmlFor="social-player-search">
            Find player
          </label>
          <div className="rpg-chat-search">
            <input
              data-autofocus
              ref={search}
              id="social-player-search"
              placeholder="Find traveler…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                className="rpg-social-icon"
                aria-label="Clear player search"
                onClick={() => {
                  setQuery('');
                  search.current?.focus();
                }}
              >
                <RpgIcon name="close" />
              </button>
            )}
          </div>
          <ul className="rpg-social-list">
            {people.map((person) => (
              <li key={person.id}>
                <button type="button" onClick={() => setSelectedId(person.id)}>
                  <span
                    className="rpg-social-dot"
                    data-online={person.status !== 'away'}
                    aria-label={person.status === 'away' ? 'Away' : 'Online'}
                  />
                  <span className="rpg-social-row-text">
                    <strong>
                      {person.name}
                      {person.id === state.self?.id && person.name !== 'You' ? ' (you)' : ''}
                    </strong>
                    <small>
                      {person.area || 'Exploring'}
                      {party?.members.some((p) => p.id === person.id) ? ' · Your party' : ''}
                    </small>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
          {!people.length && (
            <p className="rpg-chat-empty">
              {query
                ? 'No traveler matches that name.'
                : online
                  ? 'No travelers here yet.'
                  : 'The player list returns when chat reconnects.'}
            </p>
          )}
        </>
      )}
    </RpgHudPanel>
  );
});
