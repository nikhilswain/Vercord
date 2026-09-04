import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  busyLabel?: string;
  error?: string | null;
  onConfirm(): void | Promise<void>;
  onClose(): void;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy = false,
  busyLabel = 'Disconnecting…',
  error = null,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      busy={busy}
      error={error}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="confirm-dialog__cancel"
            onClick={onClose}
            disabled={busy}
            autoFocus
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-dialog__danger"
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-dialog__copy">{children}</div>
    </Dialog>
  );
}
