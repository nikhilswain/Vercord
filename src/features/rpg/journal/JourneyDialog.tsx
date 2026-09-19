import { useState } from 'react';
import { RpgDialog } from '../ui/RpgDialog';
import type { NavigationResult } from '../navigation/types';
import type { JournalObjective, JournalPreferences, JourneyJournal } from './model';
import './journal.css';

export interface JourneyActions {
  onJourney(): void;
  onJournalChange(preferences: Partial<JournalPreferences>): void;
  onShowObjective(objective: JournalObjective): void;
}

export function JourneyDialog({
  journal,
  onClose,
  onJournalChange,
  onShowObjective,
  onGuide,
}: {
  journal?: JourneyJournal;
  onClose(): void;
  onJournalChange(preferences: Partial<JournalPreferences>): void;
  onShowObjective(objective: JournalObjective): void;
  onGuide(objective: JournalObjective): NavigationResult;
}) {
  const [error, setError] = useState('');
  const objective = journal?.objective;
  const explore = () => {
    onJournalChange({ mode: 'explore', pinned: null });
    onClose();
  };
  return (
    <RpgDialog
      open
      title="Journey"
      className="rpg-journey"
      onClose={onClose}
      footer={
        <div className="journey-footer">
          <button className="rpg-button" onClick={explore}>
            Explore freely
          </button>
          <button className="rpg-button" onClick={onClose}>
            Return to world
          </button>
        </div>
      }
    >
      {!journal ? (
        <p role="status">Your journal is opening…</p>
      ) : (
        <>
          <div className="journey-chapter">
            <span className="rpg-kicker">{journal.chapter}</span>
            <h3>{journal.title}</h3>
            <p>{journal.recap}</p>
          </div>
          {journal.mode === 'explore' && objective && (
            <div className="journey-choice">
              <p>
                Stay on your own path, or pick up the story. A golden trail appears only when you
                choose <strong>Guide me</strong>.
              </p>
              <button className="rpg-button" onClick={() => onJournalChange({ mode: 'story' })}>
                Follow story
              </button>
            </div>
          )}
          {journal.mode === 'story' && objective && (
            <p className="journey-counts">Following this chapter. Guidance is optional.</p>
          )}
          {objective ? (
            <section className="journey-next" aria-label="Next step">
              <span className="rpg-kicker">Next step · {objective.location}</span>
              <h3>{objective.title}</h3>
              <p>{objective.detail}</p>
              <div className="journey-actions">
                <button className="rpg-button" onClick={() => onShowObjective(objective)}>
                  Show on map
                </button>
                <button
                  className="rpg-button"
                  onClick={() => {
                    const result = onGuide(objective);
                    setError(result.ok ? '' : result.message);
                  }}
                >
                  Guide me
                </button>
                <button
                  className="rpg-button"
                  aria-pressed={journal.pinned === objective.id}
                  onClick={() =>
                    onJournalChange({
                      pinned: journal.pinned === objective.id ? null : objective.id,
                    })
                  }
                >
                  {journal.pinned === objective.id ? 'Unpin objective' : 'Pin objective'}
                </button>
              </div>
              {error && (
                <p className="journey-notice" role="alert">
                  {error}
                </p>
              )}
            </section>
          ) : (
            <p className="journey-notice">
              {journal.completed.length
                ? 'This chapter is complete. Your discoveries stay with you; the remaining trails are yours to explore.'
                : 'No open story leads here. Explore at your own pace.'}
            </p>
          )}
          {!!journal.completed.length && (
            <details className="journey-completed">
              <summary>Completed · {journal.completed.length}</summary>
              <ul>
                {journal.completed.map((title) => (
                  <li key={title}>
                    <span aria-hidden="true">✓</span> {title}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {journal.visited > 0 && (
            <p className="journey-counts">
              {journal.visited} / 12 forest regions visited · {journal.discoveries} places
              discovered
            </p>
          )}
          {!journal.saveAvailable && (
            <p role="alert" className="journey-notice">
              This browser could not save your journey. Keep this tab open to preserve this visit.
            </p>
          )}
        </>
      )}
    </RpgDialog>
  );
}

export function JourneyTracker({
  objective,
  onOpen,
  onUnpin,
}: {
  objective: JournalObjective;
  onOpen(): void;
  onUnpin(): void;
}) {
  return (
    <aside className="journey-tracker" aria-label="Pinned objective">
      <button onClick={onOpen}>
        <span className="rpg-kicker">Journey · {objective.location}</span>
        <strong>{objective.title}</strong>
      </button>
      <button className="rpg-icon-button" aria-label="Unpin objective" onClick={onUnpin}>
        ×
      </button>
    </aside>
  );
}
