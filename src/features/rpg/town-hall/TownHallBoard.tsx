import { useSyncExternalStore } from 'react';
import { HALL_BOARDS, type HallBoardId } from '../../../domain/world/content/town-hall-v1/scene';
import { SPELL_DEFINITIONS } from '../../../domain/adventure/spells';
import { FOREST_REGION_IDS } from '../../../domain/world/forest/catalog';
import type { GameChatClient } from '../chat/client';
import { ChatConnectionNotice } from '../chat/GameChatPanel';
import { RpgDialog } from '../ui/RpgDialog';
import { RpgIcon } from '../RpgIcon';
import type { RpgUiState } from '../types';
import type { JournalObjective } from '../journal/model';
import './town-hall.css';

export function TownHallBoard({
  board,
  client,
  ui,
  playerName,
  onClose,
  onJourney,
  onInventory,
  onShowObjective,
  onMessage,
  onBoard,
}: {
  board: HallBoardId;
  client: GameChatClient;
  ui: RpgUiState;
  playerName: string;
  onClose(): void;
  onJourney(): void;
  onInventory(): void;
  onShowObjective(objective: JournalObjective): void;
  onMessage(id: string): void;
  onBoard(id: HallBoardId): void;
}) {
  const social = useSyncExternalStore(client.subscribe, client.snapshot);
  const journal = ui.journal;
  const entry = HALL_BOARDS[board];
  const level = ui.adventure?.level ?? 1;
  const people = [...social.people].sort(
    (a, b) =>
      Number(b.id === social.self?.id) - Number(a.id === social.self?.id) ||
      a.name.localeCompare(b.name),
  );
  const active = social.connection === 'online';
  return (
    <RpgDialog
      open
      title={entry.name}
      className="rpg-hall-board"
      onClose={onClose}
      closeLabel="Close board"
      footer={
        <button type="button" className="rpg-button" onClick={onClose}>
          Back to hall <kbd>Esc</kbd>
        </button>
      }
    >
      <p className="rpg-hall-caption">
        Town Hall <span aria-hidden="true">✦</span> {entry.subtitle}
      </p>
      {board === 'hall:expeditions' && (
        <>
          <article className="rpg-hall-notice">
            <span className="rpg-kicker">Beyond the town</span>
            <h3>{journal?.title ?? 'The Mosswild trails'}</h3>
            <p>
              {journal?.recap ??
                'The town’s waygate leads to Mosswild Verge. Follow the old forest clues, or explore at your own pace.'}
            </p>
            {journal?.objective && (
              <div className="rpg-hall-next">
                <small>Next lead · {journal.objective.location}</small>
                <strong>{journal.objective.title}</strong>
                <p>{journal.objective.detail}</p>
              </div>
            )}
            <div className="rpg-hall-actions">
              <button type="button" className="rpg-button" onClick={onJourney}>
                Open Journey
              </button>
              {journal?.objective && (
                <button
                  type="button"
                  className="rpg-button rpg-button--quiet"
                  onClick={() => onShowObjective(journal.objective!)}
                >
                  Show lead on map
                </button>
              )}
            </div>
            <small className="rpg-muted">
              Choose your own pace. Reading a notice does not start a trail.
            </small>
          </article>
          <article className="rpg-hall-notice">
            <h3>Before you set out</h3>
            <p>
              Prepare a meal and a healing bottle at a town station. Collect drops with F; your
              Hearthstone brings you home with G.
            </p>
            <button type="button" className="rpg-button rpg-button--quiet" onClick={onInventory}>
              Check supplies & recipes
            </button>
          </article>
        </>
      )}
      {board === 'hall:travelers' && (
        <>
          <p>Find company for the trail. Select a traveler to send a private message.</p>
          <ChatConnectionNotice client={client} context="register" />
          {active && !people.length && (
            <p role="status">No travelers are listed yet. The register updates as they arrive.</p>
          )}
          <ul className="rpg-hall-register" aria-label="Travelers in this server">
            {people.map((person) => (
              <li key={person.id}>
                <span className="rpg-hall-person">
                  <span className="rpg-hall-presence" aria-hidden="true">
                    {active && person.status !== 'away' ? '◆' : '◇'}
                  </span>
                  <span>
                    <strong>
                      <bdi>{person.name}</bdi>
                      {person.id === social.self?.id ? ' · You' : ''}
                    </strong>
                    <small>
                      {active ? (person.status === 'away' ? 'Away' : 'Online') : 'Last seen'} ·{' '}
                      <bdi>{person.area || 'Exploring'}</bdi>
                    </small>
                  </span>
                </span>
                {person.id !== social.self?.id && (
                  <button
                    type="button"
                    className="rpg-button rpg-button--quiet"
                    disabled={!active}
                    onClick={() => onMessage(person.id)}
                    aria-label={`Message ${person.name}`}
                  >
                    <RpgIcon name="chat" /> Message
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {board === 'hall:chronicle' && (
        <>
          <div className="rpg-hall-record-title">
            <h3>
              <bdi>{playerName}</bdi>
            </h3>
            <span>Level {level}</span>
          </div>
          <p>
            Your field record, kept as you explore. A new trail or a recovered clue matters here as
            much as a battle.
          </p>
          <dl className="rpg-hall-records">
            <div>
              <dt>Forest regions visited</dt>
              <dd>
                {journal?.visited ?? 0} / {FOREST_REGION_IDS.length}
              </dd>
            </div>
            <div>
              <dt>Discoveries recorded</dt>
              <dd>{journal?.discoveries ?? 0}</dd>
            </div>
            {Object.values(SPELL_DEFINITIONS).map((spell) => (
              <div key={spell.name}>
                <dt>{spell.name}</dt>
                <dd>{level >= spell.unlockLevel ? 'Awakened' : `Level ${spell.unlockLevel}`}</dd>
              </div>
            ))}
          </dl>
          <h3>{journal?.chapter ?? 'This chapter'}</h3>
          {journal?.completed.length ? (
            <ul className="rpg-hall-deeds">
              {journal.completed.map((deed) => (
                <li key={deed}>
                  <span aria-hidden="true">✦</span> {deed}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rpg-muted">
              Your first page is still unwritten. The expedition board has a lead from Mosswild.
            </p>
          )}
          {!journal?.saveAvailable && (
            <p role="status">
              This visit’s record is available here, but your browser could not save it. Keep this
              page open to preserve your journey.
            </p>
          )}
          <button type="button" className="rpg-button rpg-button--quiet" onClick={onJourney}>
            Read your Journey
          </button>
        </>
      )}
      {board === 'hall:requests' && (
        <article className="rpg-hall-notice">
          <span className="rpg-kicker">The town’s request board</span>
          <h3>No commissions posted</h3>
          <p>
            When the townsfolk need a hand, their signed requests will appear here. For now, Mara
            keeps the board clear.
          </p>
          <p className="rpg-muted">
            There is still a mystery beyond the trees. Check the expedition board for the trail into
            Mosswild.
          </p>
          <button type="button" className="rpg-button" onClick={() => onBoard('hall:expeditions')}>
            Read expedition notices
          </button>
        </article>
      )}
    </RpgDialog>
  );
}
