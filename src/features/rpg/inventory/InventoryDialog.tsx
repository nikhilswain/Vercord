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
import { RECIPES, type CraftItemResult } from '../../../domain/adventure/crafting';
import { RecipeBook } from '../provisions/RecipeBook';
import {
  Provisions,
  USE_ITEM_MESSAGES,
  type ProvisionsSnapshot,
} from '../../../domain/adventure/provisions';
import './inventory.css';

type Category = 'weapons' | 'recipes' | ItemCategory;
const CATEGORIES: ReadonlyArray<{ id: Category; label: string; empty: string }> = [
  { id: 'weapons', label: 'Weapons', empty: '' },
  { id: 'recipes', label: 'Recipes', empty: '' },
  { id: 'tools', label: 'Items', empty: 'Your travel items appear here.' },
  {
    id: 'food',
    label: 'Food',
    empty:
      'Hunt wildlife or gather mushrooms. Cook meals at a hearth; herbs can also be used directly.',
  },
  {
    id: 'materials',
    label: 'Materials',
    empty:
      'Collect resin, Emberleaf and seeds with F. The recipe book explains their uses and sources.',
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
  onCraftItem?(id: string): CraftItemResult | undefined;
  onConfigureProvisions?(
    settings: Partial<Pick<ProvisionsSnapshot, 'recovery' | 'quickBuff' | 'trackedRecipe'>>,
  ): void;
  onFindSource?(id: string): string;
  onReturnToTown?(): void;
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
  onConfigureProvisions,
  onFindSource,
  onReturnToTown,
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
  const useError =
    status.canUseSupplies === false
      ? { success: false as const, reason: 'adventure-only' as const }
      : selected
        ? new Provisions(status.provisions).check(selected.id, status.inventory, status.health)
        : null;
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
                : entry.id === 'recipes'
                  ? RECIPES.length
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
        {category === 'recipes' ? (
          <RecipeBook
            status={status}
            onTrack={(id) => onConfigureProvisions?.({ trackedRecipe: id })}
            onFindSource={onFindSource}
          />
        ) : category === 'weapons' ? (
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
                  {Array.from(
                    { length: Math.max(0, (category === 'tools' ? 4 : 12) - stacks.length) },
                    (_, index) => (
                      <span key={`empty-${index}`} className="rpg-empty-slot" aria-hidden="true" />
                    ),
                  )}
                </div>
                <section className="rpg-inventory-detail" aria-label="Selected item">
                  <div className="rpg-inventory-art">
                    <ItemIcon id={selected.id as ItemId} />
                  </div>
                  <p className="rpg-inventory-kind">
                    {selected.permanent
                      ? 'Always equipped · G'
                      : selected.requiresCooking
                        ? 'Cooking ingredient'
                        : selected.benefit === 'meal'
                          ? 'Meal · Vitality'
                          : selected.benefit
                            ? 'Temporary bottle effect'
                            : selected.heal || selected.healFraction
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
                    <strong>
                      {selected.permanent
                        ? 'Bound to your town'
                        : selected.id === 'resin-wrap'
                          ? 'Made from supplies'
                          : 'Found in the world'}
                    </strong>
                    {selected.source}
                  </p>
                  {selected.activation === 'return-town' ? (
                    <button
                      type="button"
                      className="rpg-button rpg-inventory-use"
                      onClick={onReturnToTown}
                      disabled={!onReturnToTown}
                    >
                      Return to town · G
                    </button>
                  ) : selected.heal || selected.healFraction || selected.benefit ? (
                    <button
                      type="button"
                      className="rpg-button rpg-inventory-use"
                      disabled={Boolean(status.pendingUse || useError)}
                      title={
                        useError && !useError.success
                          ? USE_ITEM_MESSAGES[useError.reason]
                          : undefined
                      }
                      onClick={() => {
                        const result = onUseItem(selected.id);
                        if (result?.success)
                          tabs.current[
                            CATEGORIES.findIndex((entry) => entry.id === category)
                          ]?.focus();
                        setNotice(
                          result?.success
                            ? `Preparing ${selected.name}. Stay still until the action finishes.`
                            : result && !result.success
                              ? USE_ITEM_MESSAGES[result.reason]
                              : 'Unable to use this item right now.',
                        );
                      }}
                    >
                      {status.canUseSupplies === false
                        ? 'Use in adventure'
                        : status.pendingUse
                          ? 'Eating / drinking…'
                          : useError && !useError.success
                            ? useError.reason === 'full-health'
                              ? 'Health is full'
                              : useError.reason === 'combat'
                                ? 'Leave combat to eat'
                                : useError.reason === 'meal-active'
                                  ? 'Meal still active'
                                  : useError.reason === 'already-active'
                                    ? 'Already active'
                                    : 'Recovering…'
                            : selected.benefit === 'meal' || selected.plainFood
                              ? 'Eat · 4 seconds'
                              : selected.benefit
                                ? `Drink${status.provisions?.buff ? ' · replaces current bottle' : ''}`
                                : 'Use · restore health'}
                    </button>
                  ) : (
                    <p className="rpg-inventory-item-help">
                      {selected.requiresCooking
                        ? 'Prepare at a hearth. Open Recipes to see what you can cook.'
                        : selected.category === 'quest'
                          ? 'Hand in through the story. Cannot be consumed.'
                          : 'Open Recipes to see uses and ingredient sources.'}
                    </p>
                  )}
                  {['healing-herb', 'healing-bottle'].includes(selected.id) && (
                    <button
                      type="button"
                      className="rpg-recipe-source"
                      aria-pressed={status.provisions?.recovery === selected.id}
                      onClick={() =>
                        onConfigureProvisions?.({
                          recovery: selected.id as 'healing-herb' | 'healing-bottle',
                        })
                      }
                    >
                      {status.provisions?.recovery === selected.id
                        ? 'Selected recovery · H'
                        : 'Use for recovery · H'}
                    </button>
                  )}
                  {['battle-bottle', 'swiftstep-bottle'].includes(selected.id) && (
                    <button
                      type="button"
                      className="rpg-recipe-source"
                      aria-pressed={status.provisions?.quickBuff === selected.id}
                      onClick={() =>
                        onConfigureProvisions?.({
                          quickBuff: selected.id as 'battle-bottle' | 'swiftstep-bottle',
                        })
                      }
                    >
                      {status.provisions?.quickBuff === selected.id
                        ? 'Selected bottle · B'
                        : 'Assign bottle · B'}
                    </button>
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
      {Boolean(status.inventory.overflow?.length) && (
        <p role="status">
          {status.inventory.overflow!.reduce((n, s) => n + s.quantity, 0)} converted supplies are
          reserved. They return to your bag as you use items and make room.
        </p>
      )}
      <p className="rpg-inventory-footer">
        Supplies travel with you. H: chosen recovery · B: chosen bottle. Hunting is optional.
      </p>
      {status.canAdjustEncounters && (
        <DemoEncounterControls status={status} onApplyEnemyLevel={onApplyEnemyLevel} />
      )}
    </div>
  );
}
