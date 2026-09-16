import { getDemoWeapon } from './equipment';
import type { AdventureStatus, SpellId } from './types';
import { AbilityBar } from '../ui/AbilityBar';
import { PixelIcon } from '../ui/PixelIcon';
import { HudNotice } from '../ui/HudNotice';
import './equipment.css';

export function AdventureHud({
  status,
  onAttack,
  onHeal,
  onSpell,
  onMelee,
}: {
  status: AdventureStatus;
  onAttack(): void;
  onHeal(): void;
  onSpell(spell: SpellId): void;
  onMelee(): void;
}) {
  const weapon = getDemoWeapon(status.weaponId);
  const melee = status.combatMode === 'melee';
  return (
    <>
      <div className="rpg-adventure-controls">
        <div className="rpg-combat-actions" role="group" aria-label="Combat controls">
          <button
            className="rpg-button rpg-equipped-control"
            aria-pressed={melee}
            onClick={onMelee}
            aria-label={`Melee, ${weapon.name}`}
            title={`${weapon.name} · 3`}
          >
            <img className="rpg-weapon-icon" src={weapon.imageUrl} alt="" width="28" height="28" />
            <kbd>3</kbd>
          </button>
          <button
            className="rpg-button"
            onClick={onHeal}
            disabled={status.herbs === 0 || status.health === status.maxHealth}
            aria-label={`Heal, ${status.herbs} herbs`}
            title="Use healing herb · H"
          >
            <PixelIcon name="herb" />
            <span>{status.herbs}</span>
            <kbd>H</kbd>
          </button>
          <button
            className="rpg-button rpg-attack"
            onClick={onAttack}
            disabled={!status.castReady}
            title="Attack toward facing direction · J"
          >
            <span>{melee ? 'Attack' : 'Cast'}</span>
            <kbd>J</kbd>
          </button>
        </div>
        <AbilityBar status={status} onSpell={onSpell} />
      </div>
      {status.message && <HudNotice key={status.message} message={status.message} />}
    </>
  );
}
