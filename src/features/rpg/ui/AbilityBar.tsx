import type { AdventureStatus, SpellId } from '../adventure/types';
import { PixelIcon } from './PixelIcon';

export function AbilityBar({
  status,
  onSpell,
}: {
  status: AdventureStatus;
  onSpell(spell: SpellId): void;
}) {
  return (
    <section className="rpg-abilities" aria-label="Abilities">
      <span className="rpg-hud-caption">Abilities</span>
      <div className="rpg-ability-slots" role="group" aria-label="Select ability">
        <button
          className="rpg-ability-slot"
          aria-pressed={status.combatMode === 'fire'}
          onClick={() => onSpell('fire')}
          title="Ember · 1"
        >
          <kbd>1</kbd>
          <PixelIcon name="fire" />
          <span>Ember</span>
        </button>
        <button
          className="rpg-ability-slot"
          aria-pressed={status.combatMode === 'water'}
          onClick={() => onSpell('water')}
          disabled={!status.waterUnlocked}
          title={status.waterUnlocked ? 'Tide · 2' : 'Tide unlocks at level 2'}
        >
          <kbd>2</kbd>
          <PixelIcon name="water" />
          <span>Tide</span>
          {!status.waterUnlocked && <small>LV 2</small>}
        </button>
        {[0, 1].map((slot) => (
          <button
            key={slot}
            className="rpg-ability-slot rpg-ability-slot--locked"
            disabled
            aria-label={`Locked ability slot ${slot + 3}`}
            title="A future ability"
          >
            <PixelIcon name="lock" />
            <span>Locked</span>
          </button>
        ))}
      </div>
    </section>
  );
}
