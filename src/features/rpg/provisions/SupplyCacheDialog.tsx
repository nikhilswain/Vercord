import { useState } from 'react';
import { RpgDialog } from '../ui/RpgDialog';
import { ItemIcon } from '../inventory/ItemIcon';
import { getItem } from '../../../domain/adventure/inventory';
import type { AdventureStatus } from '../adventure/types';

export function SupplyCacheDialog({
  status,
  onTake,
  onClose,
}: {
  status: AdventureStatus;
  onTake(id: string): string;
  onClose(): void;
}) {
  const [notice, setNotice] = useState('');
  return (
    <RpgDialog
      open
      title="Trail cache"
      className="rpg-supply-cache-dialog"
      onClose={onClose}
      closeLabel="Leave cache"
    >
      <p>The guardian was defending an old supply chest. Choose one bottle to take along.</p>
      <div className="rpg-cache-choices">
        {(['healing-bottle', 'battle-bottle', 'swiftstep-bottle'] as const)
          .filter((id) => id === 'healing-bottle' || status.provisions?.learned.includes(id))
          .map((id) => (
            <button
              type="button"
              className="rpg-button"
              key={id}
              onClick={() => setNotice(onTake(id))}
            >
              <ItemIcon id={id} />
              <span>
                {getItem(id)!.name}
                <small>{getItem(id)!.description}</small>
              </span>
            </button>
          ))}
      </div>
      <p role="status">{notice}</p>
    </RpgDialog>
  );
}
