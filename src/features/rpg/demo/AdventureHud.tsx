import { RpgIcon } from '../RpgIcon';
import { getDemoWeapon } from './equipment';
import type { AdventureStatus, SpellId } from './types';
import './equipment.css';

export function AdventureHud({
  status,
  onAttack,
  onHeal,
  onSpell,
  onMelee,
  onEquipment,
}: {
  status: AdventureStatus;
  onAttack(): void;
  onHeal(): void;
  onSpell(spell: SpellId): void;
  onMelee(): void;
  onEquipment(): void;
}) {
  const complete = status.story
    ? status.story.complete
    : status.defeated === status.enemyGoal && status.blossoms === status.blossomGoal;
  const weapon = getDemoWeapon(status.weaponId);
  const melee = status.combatMode === 'melee';
  return (
    <>
      <aside className="rpg-adventure-status rpg-frame" aria-label="Adventure status">
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
          {!status.story && (
            <>
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
            </>
          )}
        </div>
        {status.story && (
          <div className="rpg-story-objective" role="status">
            <strong>{status.story.title}</strong>
            <p>
              {status.story.complete ? '✓ ' : ''}
              {status.story.text}
            </p>
          </div>
        )}
        {complete && !status.story && (
          <strong className="rpg-trail-complete">
            Area explored. Follow the trail onward or return home.
          </strong>
        )}
        {status.boss && (
          <div className="rpg-boss-status" aria-label="Temple boss">
            <strong>
              {status.boss.name} · Lv {status.boss.level}
            </strong>
            <meter
              min={0}
              max={status.boss.maxHealth}
              value={status.boss.health}
              aria-label={`${status.boss.name} health`}
            />
            <span>
              {status.boss.health === 0
                ? 'Defeated'
                : status.boss.enraged
                  ? 'Enraged · wider spore volleys'
                  : 'Watch its bite and spore volleys'}
            </span>
          </div>
        )}
        <button
          type="button"
          className="rpg-equipment-toggle"
          onClick={onEquipment}
          aria-label={`Open equipment, ${weapon.name} equipped`}
          aria-haspopup="dialog"
          title={`Equipment · ${weapon.name} · I`}
        >
          <img className="rpg-weapon-icon" src={weapon.imageUrl} alt="" width="26" height="26" />
          <span>Equipment</span>
          <kbd>I</kbd>
        </button>
      </aside>
      <div className="rpg-spellbook rpg-frame" role="group" aria-label="Choose an attack">
        <button
          className="rpg-spell-fire"
          aria-pressed={status.combatMode === 'fire'}
          onClick={() => onSpell('fire')}
          title="Ember · fire burns enemies"
        >
          <RpgIcon name="fire" />
          <span>Ember</span>
          <kbd>1</kbd>
        </button>
        <button
          className="rpg-spell-water"
          aria-pressed={status.combatMode === 'water'}
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
        <button
          aria-pressed={melee}
          onClick={onMelee}
          aria-label={`Melee, ${weapon.name}`}
          title={`Melee · ${weapon.name}`}
        >
          <img className="rpg-weapon-icon" src={weapon.imageUrl} alt="" width="26" height="26" />
          <span>Melee</span>
          <kbd>3</kbd>
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
          {melee ? (
            <img className="rpg-weapon-icon" src={weapon.imageUrl} alt="" width="26" height="26" />
          ) : (
            <RpgIcon name={status.spell} />
          )}
          <span>
            {status.castReady ? (melee ? 'Attack' : 'Cast') : melee ? 'Recovering' : 'Casting'}
          </span>
          <kbd>J</kbd>
        </button>
      </div>
      <p className="rpg-adventure-message rpg-adventure-message--equipment" role="status">
        {status.message ||
          (complete
            ? status.story
              ? 'Story complete. Keep exploring, or return to the village.'
              : 'Area cleared. Follow the signs to continue or return to the village.'
            : `WASD to move · Aim & left click / tap to ${melee ? 'attack' : 'cast'} · E to ${status.story ? 'interact' : 'gather'}`)}
      </p>
    </>
  );
}
