import { useEffect, useRef, useState } from 'react';
import {
  RECIPES,
  craftItem,
  type CraftItemResult,
  type StationKind,
} from '../../../domain/adventure/crafting';
import { getItem, itemCount } from '../../../domain/adventure/inventory';
import type { AdventureStatus } from '../adventure/types';
import { ItemIcon } from '../inventory/ItemIcon';
import './provisions.css';

interface Props {
  status: AdventureStatus;
  station?: StationKind;
  disabled?: boolean;
  onCraft?(id: string, quantity: number, requestId: string): CraftItemResult | undefined;
  onTrack?(id: string | null): void;
  onFindSource?(id: string): string;
}
export function RecipeBook({ status, station, disabled, onCraft, onTrack, onFindSource }: Props) {
  const recipes = RECIPES.filter((r) => !station || r.station === station);
  const [selected, setSelected] = useState(recipes[0]!.id);
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState('');
  const [preparing, setPreparing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      request.current = null;
    },
    [],
  );
  const recipe = recipes.find((r) => r.id === selected) ?? recipes[0]!;
  const item = getItem(recipe.output)!;
  const known = !recipe.lesson || status.provisions?.learned.includes(recipe.id);
  const check = craftItem(status.inventory, recipe.id, {
    station: recipe.station,
    learned: status.provisions?.learned ?? [],
    quantity,
  });
  const commit = () => {
    if (!request.current) return;
    if (timer.current) clearTimeout(timer.current);
    const key = request.current;
    request.current = null;
    const result = onCraft?.(recipe.id, quantity, key);
    setPreparing(false);
    setNotice(
      result?.success
        ? `Prepared ${quantity} ${item.name}${quantity > 1 ? 's' : ''}. Find ${item.benefit === 'meal' ? 'it in Food' : 'it in Items'}.`
        : 'Could not prepare this. Your ingredients were kept. Check the station and supplies.',
    );
  };
  const prepare = () => {
    if (request.current || !check.success || disabled || !onCraft) return;
    request.current = crypto.randomUUID();
    if (status.provisions?.crafted.includes(recipe.id)) commit();
    else {
      setPreparing(true);
      timer.current = setTimeout(commit, 2200);
    }
  };
  return (
    <div className="rpg-recipe-book">
      <nav className="rpg-recipe-list" aria-label="Recipes">
        {recipes.map((r) => (
          <button
            type="button"
            key={r.id}
            aria-pressed={recipe.id === r.id}
            disabled={preparing}
            onClick={() => {
              setSelected(r.id);
              setNotice('');
              setQuantity(1);
            }}
          >
            <ItemIcon id={r.output} />
            <span>
              <strong>{getItem(r.output)!.name}</strong>
              <small>
                {r.lesson && !status.provisions?.learned.includes(r.id)
                  ? 'Recipe to discover'
                  : r.station === 'brew'
                    ? 'Brewing'
                    : 'Cooking'}
              </small>
            </span>
          </button>
        ))}
      </nav>
      <section className="rpg-recipe-detail" aria-label="Selected recipe">
        <div className="rpg-recipe-title">
          <ItemIcon id={recipe.output} />
          <div>
            <small>{recipe.station === 'brew' ? 'BREWING FORMULA' : 'CAMP KITCHEN'}</small>
            <h3>{item.name}</h3>
          </div>
        </div>
        <p>{item.description}</p>
        {!known && (
          <p className="rpg-recipe-discovery">
            Learn this recipe by helping at{' '}
            {recipe.lesson === 'verge'
              ? 'Juniper’s Verge camp'
              : recipe.lesson === 'alder-run'
                ? 'the Alder Run garden'
                : 'Oren’s Lantern Wood camp'}
            .
          </p>
        )}
        <h4>
          Ingredients <small>Owned / needed</small>
        </h4>
        <ul className="rpg-recipe-ingredients">
          {recipe.ingredients.map((part) => {
            const count = part.alternatives.reduce(
              (sum, id) => sum + itemCount(status.inventory, id),
              0,
            );
            return (
              <li key={part.alternatives[0]}>
                <div>
                  <ItemIcon id={part.alternatives[0]!} />
                  <span>
                    {part.alternatives.map((id) => getItem(id)!.name).join(' / ')}
                    <small>{getItem(part.alternatives[0]!)!.source}</small>
                  </span>
                  <b data-missing={count < part.quantity * quantity}>
                    {count} / {part.quantity * quantity}
                  </b>
                </div>
                {onFindSource && count < part.quantity * quantity && (
                  <button
                    type="button"
                    className="rpg-recipe-source"
                    onClick={() => setNotice(onFindSource(part.alternatives[0]!))}
                  >
                    Guide me to a source
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {station && (
          <div className="rpg-recipe-actions">
            <label>
              Quantity{' '}
              <input
                type="number"
                min={1}
                max={20}
                step={1}
                value={quantity}
                disabled={preparing}
                onChange={(e) =>
                  setQuantity(Math.max(1, Math.min(20, Math.trunc(Number(e.target.value) || 1))))
                }
              />
            </label>
            <button
              type="button"
              className="rpg-button"
              disabled={preparing || disabled || !check.success}
              onClick={prepare}
            >
              {preparing
                ? 'Preparing…'
                : !known
                  ? 'Recipe not learned'
                  : disabled
                    ? 'Restore the bench first'
                    : check.success
                      ? `Make ${quantity}`
                      : check.reason === 'full'
                        ? 'Output stack is full'
                        : 'Need ingredients'}
            </button>
            {preparing && (
              <button type="button" className="rpg-recipe-source" onClick={commit}>
                Finish now
              </button>
            )}
          </div>
        )}
        {!station && (
          <p className="rpg-recipe-discovery">
            Prepare at a {recipe.station === 'brew' ? 'brewing bench' : 'cooking hearth'} in town or
            a forest camp. Open the map to find a station.
          </p>
        )}
        {onTrack && (
          <button
            type="button"
            className="rpg-recipe-source"
            aria-pressed={status.provisions?.trackedRecipe === recipe.id}
            onClick={() =>
              onTrack(status.provisions?.trackedRecipe === recipe.id ? null : recipe.id)
            }
          >
            {status.provisions?.trackedRecipe === recipe.id ? 'Stop tracking' : 'Track ingredients'}
          </button>
        )}
        <p role="status" className="rpg-recipe-notice">
          {notice}
        </p>
      </section>
    </div>
  );
}
