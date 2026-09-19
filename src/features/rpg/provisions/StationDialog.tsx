import { useState } from 'react';
import { RpgDialog } from '../ui/RpgDialog';
import { RecipeBook } from './RecipeBook';
import { campProject } from '../../../domain/adventure/camp-projects';
import { getItem, itemCount } from '../../../domain/adventure/inventory';
import type { AdventureStatus } from '../adventure/types';
import type { ProvisionStation } from './stations';
import type { CraftItemResult } from '../../../domain/adventure/crafting';

export function StationDialog({
  station,
  status,
  onCraft,
  onTrack,
  onAction,
  onClose,
}: {
  station: ProvisionStation;
  status: AdventureStatus;
  onCraft(id: string, quantity: number, requestId: string): CraftItemResult | undefined;
  onTrack(id: string | null): void;
  onAction(action: string): string;
  onClose(): void;
}) {
  const [notice, setNotice] = useState('');
  const project = campProject(station.region);
  const restored = project && status.provisions?.projects.includes(project.id);
  const action = (id: string) => setNotice(onAction(id));
  return (
    <RpgDialog
      open
      title={station.name}
      className="rpg-provision-dialog"
      onClose={onClose}
      closeLabel="Leave station"
    >
      <p className="rpg-station-intro">
        {station.kind === 'brew'
          ? station.region === 'verge' && !restored
            ? 'Juniper’s cauldron has gone cold. Help restore the bench and its herb garden.'
            : 'A warm cauldron, clean bottles and room to prepare for the trail.'
          : 'A quiet hearth. Prepare a meal for the road or rest here without spending supplies.'}
      </p>
      {project && !restored && (
        <details className="rpg-camp-request" open>
          <summary>{project.name}</summary>
          <p>{project.description}</p>
          <p>
            {project.cost
              .map(
                (part) =>
                  `${getItem(part.id)!.name} ${itemCount(status.inventory, part.id)} / ${part.quantity}`,
              )
              .join(' · ')}
          </p>
          <button
            type="button"
            className="rpg-button"
            disabled={project.cost.some((p) => itemCount(status.inventory, p.id) < p.quantity)}
            onClick={() => action('project')}
          >
            Help at camp
          </button>
        </details>
      )}
      {restored && <p className="rpg-camp-complete">{project.name} · Complete</p>}
      <RecipeBook
        status={status}
        station={station.kind}
        disabled={station.region === 'verge' && station.kind === 'brew' && !restored}
        onCraft={onCraft}
        onTrack={onTrack}
      />
      <div className="rpg-station-footer">
        {station.kind === 'cook' && (
          <button
            type="button"
            className="rpg-button"
            disabled={(status.provisions?.combatRemaining ?? 0) > 0}
            onClick={() => action('rest')}
          >
            Rest · free healing
          </button>
        )}
        {station.region === 'town' && !status.provisions?.projects.includes('town-supplies') && (
          <button type="button" className="rpg-button" onClick={() => action('starter')}>
            Collect welcome supplies
          </button>
        )}
        <p role="status">{notice}</p>
      </div>
    </RpgDialog>
  );
}
