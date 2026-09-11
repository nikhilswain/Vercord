import { RpgIcon } from '../RpgIcon';
import type { AdventureStatus } from './types';

export function AdventureHud({
  status,
  onAttack,
  onHeal,
}: {
  status: AdventureStatus;
  onAttack(): void;
  onHeal(): void;
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
        <button className="rpg-button rpg-attack" onClick={onAttack}>
          <RpgIcon name="sword" />
          <span>Swing</span>
          <kbd>Space</kbd>
        </button>
      </div>
      <p className="rpg-adventure-message" role="status">
        {status.message ||
          (complete
            ? 'All flowers collected and creatures defeated. The path home is south.'
            : 'Dodge the warning circle · Space to swing · E to gather')}
      </p>
    </>
  );
}
