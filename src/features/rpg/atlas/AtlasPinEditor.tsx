import { useState } from 'react';
import { Dialog } from '../../../components/Dialog';
import { AtlasIcon } from './AtlasIcon';
import { PIN_LIMIT, pinCount } from './pins';
import type { AtlasPin, PinDraft, PinKind } from './types';

interface Props {
  draft: PinDraft;
  region: string;
  pins: readonly AtlasPin[];
  onClose(): void;
  onSave(kind: PinKind, name: string): void;
  onRemove(): void;
}
export function AtlasPinEditor({ draft, region, pins, onClose, onSave, onRemove }: Props) {
  const [kind, setKind] = useState<PinKind>(
    draft.existing?.kind ?? (pinCount(pins, 'location') < PIN_LIMIT ? 'location' : 'flower'),
  );
  const [name, setName] = useState(draft.existing?.name ?? draft.name ?? '');
  const count = (value: PinKind) =>
    pinCount(
      pins.filter((p) => p.id !== draft.existing?.id),
      value,
    );
  return (
    <Dialog
      open
      title={draft.existing ? 'Edit pin' : 'Leave a pin'}
      onClose={onClose}
      className="atlas-pin-dialog"
    >
      <button className="atlas-close" aria-label="Close pin editor" onClick={onClose}>
        <AtlasIcon name="close" />
      </button>
      <p className="atlas-pin-region">{region}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (count(kind) < PIN_LIMIT) onSave(kind, name);
        }}
      >
        <fieldset>
          <legend>Pin type</legend>
          {(['location', 'flower'] as const).map((value) => (
            <label key={value} className="atlas-pin-option" data-selected={kind === value}>
              <AtlasIcon name={value} />
              <input
                type="radio"
                name="atlas-pin-kind"
                value={value}
                checked={kind === value}
                disabled={count(value) >= PIN_LIMIT}
                onChange={() => setKind(value)}
              />
              <span>
                <strong>{value === 'flower' ? 'Discovery' : 'Location'}</strong>
                <small>
                  {value === 'flower' ? 'Something to find here' : 'A place to remember'}
                </small>
              </span>
              <span>
                {pinCount(pins, value)} / {PIN_LIMIT}
              </span>
            </label>
          ))}
        </fieldset>
        <label className="atlas-pin-name">
          Name (optional)
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder={kind === 'flower' ? 'Discovery' : 'Location'}
          />
        </label>
        <p className="atlas-pin-help">
          {count(kind) >= PIN_LIMIT
            ? 'All five pins of this type are placed. Remove one to make room.'
            : draft.existing
              ? 'Change the name or pin type, then update. Close or press Escape to discard changes.'
              : 'Pins are personal and saved in this browser. Close or press Escape to cancel.'}
        </p>
        <div className="atlas-pin-actions">
          {draft.existing ? (
            <button type="button" className="atlas-remove" onClick={onRemove}>
              Remove pin
            </button>
          ) : (
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          )}
          <button type="submit" className="atlas-primary" disabled={count(kind) >= PIN_LIMIT}>
            {draft.existing ? 'Update pin' : 'Place pin'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
