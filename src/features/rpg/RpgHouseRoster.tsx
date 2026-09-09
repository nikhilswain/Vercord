import { useId, useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import type { RpgPresencePlayer } from '../../domain/presence/rpg-protocol';
import { sceneDefinition, type HouseSceneId } from '../../domain/world/catalog/scenes';
import { RpgPortrait } from './RpgPortrait';
import { RpgIcon } from './RpgIcon';

function TravelerPortrait({ player }: { player: RpgPresencePlayer }) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const avatar = player.avatarUrl && failedAvatar !== player.avatarUrl ? player.avatarUrl : null;
  return avatar ? (
    <img
      src={avatar}
      width="44"
      height="44"
      alt=""
      className="rpg-roster-avatar"
      onError={() => setFailedAvatar(avatar)}
    />
  ) : (
    <RpgPortrait appearance={player.appearance} width={44} height={44} />
  );
}

export function RpgHouseRoster({
  open,
  house,
  roomName,
  players,
  selfId,
  onClose,
}: {
  open: boolean;
  house: HouseSceneId;
  roomName: string;
  players: readonly RpgPresencePlayer[];
  selfId?: string;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const normalized = query.trim().toLocaleLowerCase();
  const visible = players.filter((player) =>
    player.displayName.toLocaleLowerCase().includes(normalized),
  );
  return (
    <Dialog
      open={open}
      title={`In this room · ${players.length}`}
      className="rpg-dialog rpg-dialog--roster"
      onClose={onClose}
      footer={
        <button className="rpg-button" onClick={onClose}>
          Back to room
        </button>
      }
    >
      <p className="rpg-roster-room">
        <bdi>{roomName}</bdi>
      </p>
      <p className="rpg-muted rpg-roster-note">
        Everyone exploring this house is listed here. Up to{' '}
        {sceneDefinition(house).visiblePlayerLimit} travelers, including you, appear in the room.
      </p>
      {(players.length > 8 || query !== '') && (
        <div className="rpg-roster-search">
          <label htmlFor={searchId}>Find a traveler</label>
          <div>
            <input
              ref={inputRef}
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
            {query && (
              <button
                className="rpg-icon-button"
                aria-label="Clear traveler search"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
              >
                <RpgIcon name="close" />
              </button>
            )}
          </div>
        </div>
      )}
      <div className="rpg-roster-list">
        {visible.length ? (
          <ul aria-label="Travelers in this house">
            {visible.map((player) => (
              <li key={player.id}>
                <TravelerPortrait player={player} />
                <span>
                  <bdi>{player.displayName}</bdi>
                  {player.id === selfId && <small>You</small>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status">
            {players.length
              ? 'No travelers match your search.'
              : 'Travelers will appear here when they arrive.'}
          </p>
        )}
      </div>
      {normalized && (
        <p className="rpg-muted rpg-roster-result" role="status">
          {visible.length} of {players.length} travelers
        </p>
      )}
    </Dialog>
  );
}
