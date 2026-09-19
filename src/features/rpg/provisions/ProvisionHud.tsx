import { getItem, itemCount, type ItemId } from '../../../domain/adventure/inventory';
import { RECIPES } from '../../../domain/adventure/crafting';
import type { AdventureStatus } from '../adventure/types';
import { ItemIcon } from '../inventory/ItemIcon';
import './provisions.css';

export function ProvisionHud({
  status,
  onInventory,
}: {
  status?: AdventureStatus;
  onInventory(): void;
}) {
  if (!status?.provisions) return null;
  const { meal, buff, trackedRecipe } = status.provisions;
  const recipe = RECIPES.find((r) => r.id === trackedRecipe);
  return (
    <div className="rpg-provision-hud">
      {(meal || buff) && (
        <div className="rpg-provision-effects">
          {[meal, buff].map(
            (effect) =>
              effect && (
                <button
                  type="button"
                  key={effect.id}
                  onClick={onInventory}
                  title={`${getItem(effect.id)!.name}: ${getItem(effect.id)!.description}`}
                  aria-label={`${getItem(effect.id)!.name}, ${Math.ceil(effect.remaining)} seconds remaining`}
                >
                  <ItemIcon id={effect.id as ItemId} />
                  <span>
                    {Math.floor(Math.ceil(effect.remaining) / 60)}:
                    {String(Math.ceil(effect.remaining) % 60).padStart(2, '0')}
                  </span>
                </button>
              ),
          )}
        </div>
      )}
      {status.pendingUse && (
        <p role="status">
          {getItem(status.pendingUse.id)?.benefit === 'meal' ? 'Eating' : 'Using'}…{' '}
          {Math.ceil(status.pendingUse.remaining)}s · Stay still
        </p>
      )}
      {recipe && (
        <button type="button" className="rpg-provision-tracked" onClick={onInventory}>
          <ItemIcon id={recipe.output} />
          <span>
            {getItem(recipe.output)!.name}
            <small>
              {recipe.ingredients
                .map(
                  (part) =>
                    `${part.alternatives.reduce((n, id) => n + itemCount(status.inventory, id), 0)}/${part.quantity} ${getItem(part.alternatives[0]!)!.name}`,
                )
                .join(' · ')}
            </small>
          </span>
        </button>
      )}
    </div>
  );
}
