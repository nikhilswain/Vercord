import { memo, useId, useRef, useState, useSyncExternalStore } from 'react';
import { PARTY_LIMIT, type ChatRoom } from '../../../domain/chat/protocol';
import { RpgIcon } from '../RpgIcon';
import { GameChatClient } from './client';

/** Local roster disclosure; unmounting the chat closes it without changing the room. */
export const PartyMembers = memo(function PartyMembers({
  client,
  party,
  onMessage,
}: {
  client: GameChatClient;
  party: ChatRoom;
  onMessage(peerId: string): void;
}) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const [membersOpen, setMembersOpen] = useState(false);
  const membersId = useId();
  const membersButton = useRef<HTMLButtonElement>(null);
  const online = state.connection === 'online';
  return (
    <div
      className="rpg-party-members-control"
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setMembersOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && membersOpen) {
          event.preventDefault();
          event.stopPropagation();
          setMembersOpen(false);
          membersButton.current?.focus();
        }
      }}
    >
      <button
        ref={membersButton}
        type="button"
        className="rpg-social-icon"
        aria-label={`Party members, ${party.members.length} of ${PARTY_LIMIT}`}
        aria-expanded={membersOpen}
        aria-controls={membersId}
        onClick={() => setMembersOpen((value) => !value)}
        title="Party members"
      >
        <RpgIcon name="players" />
      </button>
      {membersOpen && (
        <div id={membersId} className="rpg-party-members">
          <p className="rpg-social-subtitle">
            Members · {party.members.length}/{PARTY_LIMIT}
          </p>
          <ul className="rpg-social-list" aria-label="Party members">
            {party.members.map((person) => {
              const present = online ? state.people.find((p) => p.id === person.id) : undefined;
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    disabled={person.id === state.self?.id || !online || state.loading}
                    onClick={() => {
                      setMembersOpen(false);
                      onMessage(person.id);
                    }}
                  >
                    <span
                      className="rpg-social-dot"
                      data-online={Boolean(present) && present?.status !== 'away'}
                      aria-label={
                        present?.status === 'away' ? 'Away' : present ? 'Online' : 'Offline'
                      }
                    />
                    <span className="rpg-social-row-text">
                      <strong>{person.id === state.self?.id ? 'You' : person.name}</strong>
                      <small>{present?.area || (present ? 'Exploring' : 'Offline')}</small>
                    </span>
                    {person.id !== state.self?.id && <RpgIcon name="chat" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
});
