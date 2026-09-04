import { useEffect, useId, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
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
  error = null,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
      aria-busy={busy}
    >
      <div className="confirm-dialog__panel">
        <h2 id={titleId}>{title}</h2>
        <div id={descriptionId} className="confirm-dialog__copy">
          {children}
        </div>
        {error ? (
          <p className="confirm-dialog__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="confirm-dialog__actions">
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
            {busy ? 'Disconnecting…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
