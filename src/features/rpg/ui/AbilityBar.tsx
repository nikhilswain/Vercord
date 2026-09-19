import type { AdventureStatus, SpellId } from '../adventure/types';
import { PixelIcon } from './PixelIcon';
import { SPELL_DEFINITIONS, spellTimeLabel } from '../../../domain/adventure/spells';

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
        {(['fire', 'water'] as const).map((id) => {
          const spell = SPELL_DEFINITIONS[id];
          const locked = status.level < spell.unlockLevel;
          const remaining = status.spellCooldowns?.[id] ?? 0;
          const state = locked
            ? `Unlocks at level ${spell.unlockLevel}`
            : remaining > 0
              ? `Ready in ${spellTimeLabel(remaining)}`
              : 'Ready';
          return (
            <button
              key={id}
              type="button"
              className="rpg-ability-slot"
              aria-pressed={status.combatMode === id}
              disabled={locked}
              aria-label={`${spell.name} · ${state}`}
              title={`${spell.name} · ${state} · ${spell.key}${id === 'water' ? ' · Freezes for 2 seconds' : ''}`}
              onClick={() => onSpell(id)}
              data-recovering={remaining > 0 || undefined}
            >
              <kbd>{spell.key}</kbd>
              <img
                className="rpg-ability-icon"
                src={`/game-assets/ability-icons/${id === 'fire' ? 'ember' : 'tide'}.png`}
                alt=""
                width="32"
                height="32"
                draggable={false}
              />
              <span>{spell.name}</span>
              <small>
                {locked
                  ? `LV ${spell.unlockLevel}`
                  : remaining > 0
                    ? spellTimeLabel(remaining)
                    : 'Ready'}
              </small>
            </button>
          );
        })}
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
