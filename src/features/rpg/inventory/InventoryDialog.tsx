import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { RpgDialog } from '../ui/RpgDialog';
import {
  ITEM_CATALOG,
  itemCount,
  type ItemCategory,
  type ItemId,
  type UseItemResult,
} from '../../../domain/adventure/inventory';
import type { AdventureStatus } from '../adventure/types';
import { WeaponInventory } from './WeaponInventory';
import { DemoEncounterControls } from './DemoEncounterControls';
import { ItemIcon } from './ItemIcon';
import './inventory.css';

type Category = 'weapons' | ItemCategory;
const CATEGORIES: ReadonlyArray<{ id: Category; label: string; empty: string }> = [
  { id: 'weapons', label: 'Weapons', empty: '' },
  {
    id: 'food',
    label: 'Food',
    empty:
      'Hunt wildlife for raw meat, or gather golden flowers for healing herbs. Cooking comes later.',
  },
  {
    id: 'materials',
    label: 'Materials',
    empty: 'Collect moonblossoms, hides and feathers while exploring the forest.',
  },
  {
    id: 'quest',
    label: 'Quest items',
    empty:
      'Story items appear here when you find them. Mira’s missing notes are inside the temple.',
  },
];
interface Props {
  open: boolean;
  status: AdventureStatus;
  onClose(): void;
  onEquip(id: string): boolean;
  onUseItem(id: string): UseItemResult | undefined;
  onApplyEnemyLevel(level: number): void;
}
export function InventoryDialog({ open, onClose, ...props }: Props) {
  return (
    <RpgDialog
      open={open}
      title="Inventory"
      className="rpg-dialog rpg-equipment-dialog rpg-inventory-dialog"
      onClose={onClose}
      closeLabel="Close inventory"
    >
      {open && <InventoryContents {...props} />}
    </RpgDialog>
  );
}
function InventoryContents({
  status,
  onEquip,
  onUseItem,
  onApplyEnemyLevel,
}: Omit<Props, 'open' | 'onClose'>) {
  const [category, setCategory] = useState<Category>('weapons');
  const [selectedId, setSelectedId] = useState<ItemId>('healing-herb');
  const [notice, setNotice] = useState('');
  const id = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const stacks = ITEM_CATALOG.filter(
    (item) => item.category === category && itemCount(status.inventory, item.id) > 0,
  );
  const selected = stacks.find((item) => item.id === selectedId) ?? stacks[0];
  const changeCategory = (next: Category) => {
    setCategory(next);
    setNotice('');
  };
  const onTabKey = (event: KeyboardEvent, index: number) => {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % CATEGORIES.length
        : event.key === 'ArrowLeft'
          ? (index + CATEGORIES.length - 1) % CATEGORIES.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? CATEGORIES.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    changeCategory(CATEGORIES[next]!.id);
    tabs.current[next]?.focus();
  };
  return (
    <div className="rpg-inventory">
      <div className="rpg-inventory-summary">
        <span>Your supplies for the trail</span>
        <span>
          {status.health} / {status.maxHealth} health
        </span>
      </div>
      <div className="rpg-inventory-categories" role="tablist" aria-label="Inventory category">
        {CATEGORIES.map((entry, index) => (
          <button
            key={entry.id}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${id}-${entry.id}`}
            aria-controls={`${id}-contents`}
            aria-selected={category === entry.id}
            tabIndex={category === entry.id ? 0 : -1}
            onClick={() => changeCategory(entry.id)}
            onKeyDown={(event) => onTabKey(event, index)}
          >
            {entry.label}
            <span>
              {entry.id === 'weapons'
                ? status.equipmentPolicy.requireOwnership
                  ? status.equipment.ownedWeaponIds.length
                  : 24
                : status.inventory.stacks.filter(
                    (stack) =>
                      ITEM_CATALOG.find((item) => item.id === stack.id)?.category === entry.id,
                  ).length}
            </span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-contents`}
        aria-labelledby={`${id}-${category}`}
        className="rpg-inventory-content"
        tabIndex={0}
      >
        {category === 'weapons' ? (
          <WeaponInventory status={status} onEquip={onEquip} />
        ) : (
          <>
            <div className="rpg-inventory-section-heading">
              <h3>{CATEGORIES.find((entry) => entry.id === category)!.label}</h3>
              <span>
                {stacks.length} item {stacks.length === 1 ? 'type' : 'types'}
              </span>
            </div>
            {selected ? (
              <div className="rpg-inventory-loadout">
                <div className="rpg-inventory-grid" aria-label="Items in your bag">
                  {stacks.map((item) => (
                    <button
                      type="button"
                      className="rpg-inventory-item"
                      key={item.id}
                      aria-pressed={selected.id === item.id}
                      aria-label={`${item.name}, ${itemCount(status.inventory, item.id)} owned`}
                      onClick={() => {
                        setSelectedId(item.id as ItemId);
                        setNotice('');
                      }}
                    >
                      <ItemIcon id={item.id as ItemId} />
                      <strong>{item.name}</strong>
                      <span>×{itemCount(status.inventory, item.id)}</span>
                    </button>
                  ))}
                  {Array.from({ length: Math.max(0, 12 - stacks.length) }, (_, index) => (
                    <span key={`empty-${index}`} className="rpg-empty-slot" aria-hidden="true" />
                  ))}
                </div>
                <section className="rpg-inventory-detail" aria-label="Selected item">
                  <div className="rpg-inventory-art">
                    <ItemIcon id={selected.id as ItemId} />
                  </div>
                  <p className="rpg-inventory-kind">
                    {selected.requiresCooking
                      ? 'Cooking ingredient'
                      : selected.heal
                        ? 'Recovery'
                        : selected.category === 'quest'
                          ? 'Story item'
                          : 'Collection & crafting'}
                  </p>
                  <h3>{selected.name}</h3>
                  <p>{selected.description}</p>
                  <dl className="rpg-equipment-stats">
                    <div>
                      <dt>Owned</dt>
                      <dd>{itemCount(status.inventory, selected.id)}</dd>
                    </div>
                    {selected.heal && (
                      <div>
                        <dt>Restores</dt>
                        <dd>{selected.heal} health</dd>
                      </div>
                    )}
                  </dl>
                  <p className="rpg-inventory-source">
                    <strong>Found in the world</strong>
                    {selected.source}
                  </p>
                  {selected.heal ? (
                    <button
                      type="button"
                      className="rpg-button rpg-inventory-use"
                      disabled={status.health >= status.maxHealth}
                      onClick={() => {
                        const result = onUseItem(selected.id);
                        if (result?.success)
                          tabs.current[
                            CATEGORIES.findIndex((entry) => entry.id === category)
                          ]?.focus();
                        setNotice(
                          result?.success
                            ? `Used ${selected.name.toLowerCase()} · restored ${result.restored} health.`
                            : 'Unable to use this item right now.',
                        );
                      }}
                    >
                      {status.health >= status.maxHealth
                        ? 'Health is full'
                        : 'Use · restore health'}
                    </button>
                  ) : (
                    <p className="rpg-inventory-item-help">
                      {selected.requiresCooking
                        ? 'Requires cooking · coming later'
                        : selected.category === 'quest'
                          ? 'Hand in through the story. Cannot be consumed.'
                          : 'Keep for future recipes and collections.'}
                    </p>
                  )}
                </section>
              </div>
            ) : (
              <div className="rpg-inventory-empty">
                <ItemIcon
                  id={
                    category === 'food'
                      ? 'raw-meat'
                      : category === 'quest'
                        ? 'mira-notes'
                        : 'moonblossom'
                  }
                />
                <h3>Nothing here yet</h3>
                <p>{CATEGORIES.find((entry) => entry.id === category)!.empty}</p>
              </div>
            )}
            <p className="rpg-equipment-notice" role="status">
              {notice}
            </p>
          </>
        )}
      </div>
      <p className="rpg-inventory-footer">
        Supplies travel with you between areas. Hunting is optional.
      </p>
      {status.canAdjustEncounters && (
        <DemoEncounterControls status={status} onApplyEnemyLevel={onApplyEnemyLevel} />
      )}
    </div>
  );
}
