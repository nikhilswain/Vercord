import { Dialog, type DialogProps } from '../../../components/Dialog';
import { RpgIcon } from '../RpgIcon';

/** Stable game frame with a scrolling body. Native Dialog still owns focus and modality. */
export function RpgDialog({
  className = '',
  closeLabel = 'Close panel',
  ...props
}: Omit<DialogProps, 'scrollBody' | 'headerActions'> & { closeLabel?: string }) {
  return (
    <Dialog
      {...props}
      scrollBody
      className={`rpg-dialog rpg-dialog--scrollable ${className}`}
      headerActions={
        <button
          type="button"
          className="rpg-icon-button rpg-frame-close"
          aria-label={closeLabel}
          onClick={props.onClose}
          disabled={props.busy}
        >
          <RpgIcon name="close" />
        </button>
      }
    />
  );
}
