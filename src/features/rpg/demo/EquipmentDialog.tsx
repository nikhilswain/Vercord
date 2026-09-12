import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog } from '../../../components/Dialog';
import { MAX_CHARACTER_LEVEL } from '../../../domain/adventure/progression';
import { RpgIcon } from '../RpgIcon';
import { DEMO_WEAPONS, getDemoWeapon, type WeaponFamily } from './equipment';
import type { AdventureStatus } from './types';
import './equipment.css';

const FAMILIES: Array<{ id: WeaponFamily; label: string }> = [
  { id: 'sword', label: 'Swords' },
  { id: 'axe', label: 'Axes' },
  { id: 'spear', label: 'Spears' },
  { id: 'staff', label: 'Staves' },
];

interface EquipmentDialogProps {
  open: boolean;
  status: AdventureStatus;
  onClose(): void;
  onEquip(id: string): void;
  onApplyEnemyLevel(level: number): void;
}

export function EquipmentDialog({ open, onClose, ...props }: EquipmentDialogProps) {
  return (
    <Dialog
      open={open}
      title="Equipment"
      className="rpg-dialog rpg-equipment-dialog"
      onClose={onClose}
    >
      <button
        type="button"
        className="rpg-icon-button rpg-panel-close"
        aria-label="Close equipment"
        onClick={onClose}
      >
        <RpgIcon name="close" />
      </button>
      {open && <EquipmentContents {...props} />}
    </Dialog>
  );
}

function EquipmentContents({
  status,
  onEquip,
  onApplyEnemyLevel,
}: Omit<EquipmentDialogProps, 'open' | 'onClose'>) {
  const [family, setFamily] = useState<WeaponFamily>(() => getDemoWeapon(status.weaponId).family);
  const [selectedId, setSelectedId] = useState(status.weaponId);
  const [enemyLevel, setEnemyLevel] = useState(status.enemyLevel);
  const [notice, setNotice] = useState('');
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const selected = getDemoWeapon(selectedId);
  const equipped = selected.id === status.weaponId;
  const levelChanged = enemyLevel !== status.enemyLevel;

  const chooseFamily = (nextFamily: WeaponFamily) => {
    setFamily(nextFamily);
    const currentWeapon = getDemoWeapon(status.weaponId);
    setSelectedId(
      currentWeapon.family === nextFamily
        ? currentWeapon.id
        : DEMO_WEAPONS.find((weapon) => weapon.family === nextFamily)!.id,
    );
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % FAMILIES.length;
    else if (event.key === 'ArrowLeft') next = (index + FAMILIES.length - 1) % FAMILIES.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = FAMILIES.length - 1;
    else return;
    event.preventDefault();
    chooseFamily(FAMILIES[next]!.id);
    tabsRef.current[next]?.focus();
  };

  return (
    <div className="rpg-equipment">
      <p className="rpg-equipment-intro">All 24 weapons are available in this demo.</p>
      <div className="rpg-equipment-tabs" role="tablist" aria-label="Weapon family">
        {FAMILIES.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabsRef.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${item.id}`}
            aria-controls={`${id}-weapons`}
            aria-selected={family === item.id}
            tabIndex={family === item.id ? 0 : -1}
            onClick={() => chooseFamily(item.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-weapons`}
        aria-labelledby={`${id}-tab-${family}`}
        className="rpg-equipment-loadout"
      >
        <div className="rpg-equipment-grid" aria-label="Available weapons">
          {DEMO_WEAPONS.filter((weapon) => weapon.family === family).map((weapon) => (
            <button
              key={weapon.id}
              type="button"
              className="rpg-equipment-item"
              aria-pressed={selected.id === weapon.id}
              aria-label={`${weapon.name}, tier ${weapon.tier + 1}${weapon.id === status.weaponId ? ', equipped' : ''}`}
              onClick={() => setSelectedId(weapon.id)}
            >
              <img src={weapon.imageUrl} alt="" width="64" height="64" draggable={false} />
              <strong>{weapon.name}</strong>
              <span className={weapon.id === status.weaponId ? 'rpg-equipment-equipped' : ''}>
                {weapon.id === status.weaponId ? 'Equipped' : `Tier ${weapon.tier + 1}`}
              </span>
            </button>
          ))}
        </div>
        <section className="rpg-equipment-detail" aria-label="Selected weapon">
          <div className="rpg-equipment-detail-heading">
            <img src={selected.imageUrl} alt="" width="80" height="80" draggable={false} />
            <div>
              <h3>{selected.name}</h3>
              <p>
                Tier {selected.tier + 1} · {selected.family}
              </p>
            </div>
          </div>
          <dl className="rpg-equipment-stats">
            <div>
              <dt>Damage</dt>
              <dd>{selected.damage}</dd>
            </div>
            <div>
              <dt>Reach</dt>
              <dd>{selected.reach} px</dd>
            </div>
            <div>
              <dt>Attack interval</dt>
              <dd>{(selected.cooldownMs / 1000).toFixed(2)} s</dd>
            </div>
            <div>
              <dt>Unlock level</dt>
              <dd>Level {selected.unlockLevel}</dd>
            </div>
            {selected.spellBonus > 0 && (
              <div>
                <dt>Spell damage</dt>
                <dd>+{selected.spellBonus}</dd>
              </div>
            )}
          </dl>
          <button
            type="button"
            className="rpg-button rpg-equipment-equip"
            disabled={equipped}
            onClick={() => {
              onEquip(selected.id);
              setNotice(`${selected.name} equipped.`);
            }}
          >
            {equipped ? 'Equipped' : `Equip ${selected.name}`}
          </button>
        </section>
      </div>
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
            Returns you to camp and resets enemies. Keeps XP and flowers. Repeat defeats give no
            extra XP.
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
    </div>
  );
}
