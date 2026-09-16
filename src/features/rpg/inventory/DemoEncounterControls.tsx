import { useId, useState } from 'react';
import { MAX_CHARACTER_LEVEL } from '../../../domain/adventure/progression';
import type { AdventureStatus } from '../adventure/types';
export function DemoEncounterControls({
  status,
  onApplyEnemyLevel,
}: {
  status: AdventureStatus;
  onApplyEnemyLevel(level: number): void;
}) {
  const id = useId();
  const [enemyLevel, setEnemyLevel] = useState(status.enemyLevel);
  const [notice, setNotice] = useState('');
  const levelChanged = enemyLevel !== status.enemyLevel;
  return (
    <details className="rpg-inventory-sandbox">
      <summary>Demo encounter settings</summary>
      <section className="rpg-equipment-encounters" aria-labelledby={`${id}-encounters`}>
        <div className="rpg-equipment-encounter-heading">
          <h3 id={`${id}-encounters`}>Demo encounters</h3>
          <span>Enemies & boss</span>
        </div>
        <p className="rpg-equipment-enemy-stats">
          Levels 1–5 are forgiving. Higher levels move faster, chain attacks and resist repeated
          interruptions.
        </p>
        <div className="rpg-equipment-level-label">
          <label htmlFor={`${id}-level`}>Enemy level</label>
          <output htmlFor={`${id}-level`}>Level {enemyLevel}</output>
        </div>
        <input
          id={`${id}-level`}
          className="rpg-equipment-level"
          type="range"
          min={1}
          max={MAX_CHARACTER_LEVEL}
          step={1}
          value={enemyLevel}
          aria-valuetext={`Level ${enemyLevel}`}
          aria-describedby={`${id}-enemy-stats ${id}-reset-help`}
          onChange={(event) => setEnemyLevel(Number(event.target.value))}
        />
        <p id={`${id}-enemy-stats`} className="rpg-equipment-enemy-stats">
          Current level {status.enemyLevel}
          {status.encounterHealth > 0
            ? ` · up to ${status.encounterHealth} HP · ${status.encounterDamage} damage`
            : ' · encounter stats appear in the jungle'}
          {levelChanged && (
            <span>Level {enemyLevel} selected. Apply to update all encounters.</span>
          )}
        </p>
        <div className="rpg-equipment-reset-row">
          <p id={`${id}-reset-help`}>
            Returns you to camp and resets enemies. Keeps your inventory and XP. Repeat defeats give
            no extra XP or loot.
          </p>
          <button
            type="button"
            className="rpg-button"
            onClick={() => {
              onApplyEnemyLevel(enemyLevel);
              setNotice(`Enemies and boss reset to level ${enemyLevel}.`);
            }}
          >
            Apply & reset enemies
          </button>
        </div>
      </section>
      <p className="rpg-equipment-notice" role="status">
        {notice}
      </p>
    </details>
  );
}
