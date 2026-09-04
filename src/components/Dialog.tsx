import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  error?: string | null;
  className?: string;
  onClose(): void;
}

/** Shared native top-layer dialog: focus containment and inert background are browser-owned. */
export function Dialog({
  open,
  title,
  children,
  footer,
  busy = false,
  error = null,
  className = '',
  onClose,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    }
    return () => {
      if (dialog.open) {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
        if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
      }
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`confirm-dialog ${className}`}
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="confirm-dialog__panel">
        <h2 id={titleId}>{title}</h2>
        {children}
        {error ? (
          <p className="confirm-dialog__error" role="alert">
            {error}
          </p>
        ) : null}
        {footer ? <div className="confirm-dialog__actions">{footer}</div> : null}
      </div>
    </dialog>
  );
}
