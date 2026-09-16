import type { AdventureStatus } from '../adventure/types';

export function ObjectiveTracker({ status }: { status: AdventureStatus }) {
  return (
    <details className="rpg-objectives">
      <summary>
        <span aria-hidden="true">✦</span> {status.story?.title ?? 'Trail objectives'}
        <img src="/game-assets/ornate-retro/arrow-down.svg" width="12" height="12" alt="" />
      </summary>
      <div className="rpg-objectives-content">
        {status.story ? (
          <p>
            {status.story.complete && '✓ '}
            {status.story.text}
          </p>
        ) : (
          <>
            <p>
              <span>Trail creatures</span>
              <strong>
                {status.defeated} / {status.enemyGoal}
              </strong>
            </p>
            <p>
              <span>Moonblossoms</span>
              <strong>
                {status.blossoms} / {status.blossomGoal}
              </strong>
            </p>
          </>
        )}
        {status.boss && (
          <div className="rpg-boss-status" aria-label="Temple boss">
            <strong>
              {status.boss.name} · LV {status.boss.level}
            </strong>
            <progress
              value={status.boss.health}
              max={status.boss.maxHealth}
              aria-label={`${status.boss.name} health`}
            />
            <small>
              {status.boss.health === 0
                ? 'Defeated'
                : status.boss.enraged
                  ? 'Enraged'
                  : 'Temple guardian'}
            </small>
          </div>
        )}
      </div>
    </details>
  );
}
