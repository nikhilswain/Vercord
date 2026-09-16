import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { DEMO_WEAPONS, getDemoWeapon, type WeaponFamily } from '../demo/equipment';
import type { AdventureStatus } from '../adventure/types';
import '../demo/equipment.css';
import { equipWeapon } from '../../../domain/adventure/equipment';

const FAMILIES: Array<{ id: WeaponFamily; label: string }> = [
  { id: 'sword', label: 'Swords' },
  { id: 'axe', label: 'Axes' },
  { id: 'spear', label: 'Spears' },
  { id: 'staff', label: 'Staves' },
];

interface WeaponInventoryProps {
  status: AdventureStatus;
  onEquip(id: string): boolean;
}
export function WeaponInventory({ status, onEquip }: WeaponInventoryProps) {
  const [family, setFamily] = useState<WeaponFamily>(() => getDemoWeapon(status.weaponId).family);
  const [selectedId, setSelectedId] = useState(status.weaponId);
  const [notice, setNotice] = useState('');
  const familyWeapons = DEMO_WEAPONS.filter(
    (weapon) =>
      weapon.family === family &&
      (!status.equipmentPolicy.requireOwnership ||
        status.equipment.ownedWeaponIds.includes(weapon.id)),
  );
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const selected = getDemoWeapon(selectedId);
  const equipped = selected.id === status.weaponId;
  const eligibility = equipWeapon(status.equipment, selected.id, status.equipmentPolicy);
  const unavailable = eligibility.success
    ? ''
    : eligibility.reason === 'level'
      ? `Requires level ${selected.unlockLevel}`
      : 'Not owned';

  const chooseFamily = (nextFamily: WeaponFamily) => {
    setFamily(nextFamily);
    const currentWeapon = getDemoWeapon(status.weaponId);
    setSelectedId(
      currentWeapon.family === nextFamily
        ? currentWeapon.id
        : (DEMO_WEAPONS.find(
            (weapon) =>
              weapon.family === nextFamily &&
              (!status.equipmentPolicy.requireOwnership ||
                status.equipment.ownedWeaponIds.includes(weapon.id)),
          )?.id ?? ''),
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
      <p className="rpg-equipment-intro">
        {status.equipmentPolicy.requireOwnership
          ? `${status.equipment.ownedWeaponIds.length} weapons owned`
          : 'All 24 weapons are available to try in this demo.'}
      </p>
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
          {familyWeapons.length === 0 && (
            <p className="rpg-muted">
              No {FAMILIES.find((entry) => entry.id === family)!.label.toLowerCase()} owned yet.
            </p>
          )}
          {familyWeapons.map((weapon) => (
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
          {familyWeapons.length > 0 &&
            Array.from({ length: Math.max(0, 12 - familyWeapons.length) }, (_, index) => (
              <span key={`empty-${index}`} className="rpg-empty-slot" aria-hidden="true" />
            ))}
        </div>
        {familyWeapons.length > 0 && (
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
              disabled={equipped || !eligibility.success}
              onClick={() => {
                setNotice(
                  onEquip(selected.id)
                    ? `${selected.name} equipped.`
                    : 'Unable to equip this weapon right now.',
                );
              }}
            >
              {equipped ? 'Equipped' : unavailable || `Equip ${selected.name}`}
            </button>
          </section>
        )}
      </div>
      <p className="rpg-equipment-notice" role="status">
        {notice}
      </p>
    </div>
  );
}
