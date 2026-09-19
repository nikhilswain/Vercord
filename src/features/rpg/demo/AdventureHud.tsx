import { getDemoWeapon } from './equipment';
import type { AdventureStatus, SpellId } from './types';
import { AbilityBar } from '../ui/AbilityBar';
import { spellTimeLabel } from '../../../domain/adventure/spells';
import { ItemIcon } from '../inventory/ItemIcon';
import { getItem, itemCount } from '../../../domain/adventure/inventory';
import { HudNotice } from '../ui/HudNotice';
import './equipment.css';

export function AdventureHud({
  status,
  onAttack,
  onHeal,
  onBuff,
  onSpell,
  onMelee,
}: {
  status: AdventureStatus;
  onAttack(): void;
  onHeal(): void;
  onBuff?(): void;
  onSpell(spell: SpellId): void;
  onMelee(): void;
}) {
  const weapon = getDemoWeapon(status.weaponId);
  const recovery = status.provisions?.recovery ?? 'healing-herb';
  const recoveryCount = itemCount(status.inventory, recovery);
  const buff = status.provisions?.quickBuff ?? 'battle-bottle';
  const buffCount = itemCount(status.inventory, buff);
  const cooldown = Math.ceil(
    Math.max(status.provisions?.recoveryCooldown ?? 0, status.provisions?.useCooldown ?? 0),
  );
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
            disabled={
              recoveryCount === 0 ||
              status.health === status.maxHealth ||
              cooldown > 0 ||
              Boolean(status.pendingUse)
            }
            aria-label={`Recover with ${getItem(recovery)!.name}, ${recoveryCount} remaining${cooldown ? `, ready in ${cooldown} seconds` : ''}`}
            title={`${getItem(recovery)!.name} · H`}
          >
            <ItemIcon id={recovery} />
            <span>{cooldown ? `${cooldown}s` : recoveryCount}</span>
            <kbd>H</kbd>
          </button>
          {buffCount > 0 && (
            <button
              className="rpg-button"
              onClick={onBuff}
              disabled={
                !onBuff ||
                Boolean(status.pendingUse) ||
                (status.provisions?.useCooldown ?? 0) > 0 ||
                status.provisions?.buff?.id === buff
              }
              aria-label={`Use ${getItem(buff)!.name}, ${buffCount} remaining`}
              title={`${getItem(buff)!.description} · B`}
            >
              <ItemIcon id={buff} />
              <span>{buffCount}</span>
              <kbd>B</kbd>
            </button>
          )}
          <button
            className="rpg-button rpg-attack"
            onClick={onAttack}
            disabled={!status.castReady}
            title="Attack toward facing direction · J"
          >
            <span>
              {melee
                ? 'Attack'
                : (status.spellCooldowns?.[status.spell] ?? 0) > 0
                  ? spellTimeLabel(status.spellCooldowns![status.spell])
                  : 'Cast'}
            </span>
            <kbd>J</kbd>
          </button>
        </div>
        <AbilityBar status={status} onSpell={onSpell} />
      </div>
      {status.message && <HudNotice key={status.message} message={status.message} />}
    </>
  );
}
