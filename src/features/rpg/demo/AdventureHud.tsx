import { RpgIcon } from '../RpgIcon';
import type { AdventureStatus, SpellId } from './types';

export function AdventureHud({
  status,
  onAttack,
  onHeal,
  onSpell,
}: {
  status: AdventureStatus;
  onAttack(): void;
  onHeal(): void;
  onSpell(spell: SpellId): void;
}) {
  const complete = status.defeated === status.enemyGoal && status.blossoms === status.blossomGoal;
  return (
    <>
      <aside className="rpg-adventure-status rpg-frame" aria-label="Jungle adventure">
        <div className="rpg-health-label">
          <strong>Health</strong>
          <span>
            {status.health} / {status.maxHealth}
          </span>
        </div>
        <meter
          min={0}
          max={status.maxHealth}
          value={status.health}
          low={30}
          high={70}
          optimum={100}
          aria-label="Health"
        />
        <div className="rpg-trail-goals">
          <span>
            <b>Level {status.level}</b>
            <span>
              {status.experience}
              {status.nextLevel ? ` / ${status.nextLevel}` : ''} XP
            </span>
          </span>
          <span>
            Trail creatures{' '}
            <b>
              {status.defeated} / {status.enemyGoal}
            </b>
          </span>
          <span>
            Moonblossoms{' '}
            <b>
              {status.blossoms} / {status.blossomGoal}
            </b>
          </span>
        </div>
        {complete && (
          <strong className="rpg-trail-complete">Trail explored. Return to Willowmere!</strong>
        )}
      </aside>
      <div className="rpg-spellbook rpg-frame" aria-label="Choose a spell">
        <button
          aria-pressed={status.spell === 'fire'}
          onClick={() => onSpell('fire')}
          title="Ember · fire burns enemies"
        >
          <RpgIcon name="fire" />
          <span>Ember</span>
          <kbd>1</kbd>
        </button>
        <button
          aria-pressed={status.spell === 'water'}
          onClick={() => onSpell('water')}
          disabled={!status.waterUnlocked}
          title={
            status.waterUnlocked
              ? 'Tide · water slows and pushes enemies'
              : 'Tide unlocks at level 2'
          }
        >
          <RpgIcon name="water" />
          <span>Tide{!status.waterUnlocked && <small>Level 2</small>}</span>
          <kbd>2</kbd>
        </button>
      </div>
      <div className="rpg-combat-actions" aria-label="Combat controls">
        <button
          className="rpg-button"
          onClick={onHeal}
          disabled={status.herbs === 0 || status.health === status.maxHealth}
          aria-label={`Heal, ${status.herbs} herbs`}
        >
          <RpgIcon name="herb" />
          <span>Heal · {status.herbs}</span>
          <kbd>H</kbd>
        </button>
        <button className="rpg-button rpg-attack" onClick={onAttack} disabled={!status.castReady}>
          <RpgIcon name={status.spell} />
          <span>{status.castReady ? 'Cast' : 'Casting'}</span>
          <kbd>Space</kbd>
        </button>
      </div>
      <p className="rpg-adventure-message" role="status">
        {status.message ||
          (complete
            ? 'All flowers collected and creatures defeated. The path home is south.'
            : 'WASD to move & aim · Space to cast · E to gather')}
      </p>
    </>
  );
}
