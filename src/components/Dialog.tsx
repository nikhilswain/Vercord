import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  error?: string | null;
  className?: string;
  /** Optional layout slots; the caller owns the scroll styling. */
  scrollBody?: boolean;
  headerActions?: ReactNode;
  /** Optional stepped dismissal; explicit close controls still call onClose. */
  onEscape?(): void;
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
  scrollBody = false,
  headerActions,
  onEscape,
  onClose,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | SVGElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ||
        document.activeElement instanceof SVGElement
          ? document.activeElement
          : null;
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
      onKeyDown={(event) => {
        if (
          event.key !== 'Escape' ||
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          !(event.target instanceof Element) ||
          event.target.closest('dialog') !== event.currentTarget
        )
          return;
        // Native cancel can become non-cancelable on consecutive Escapes. Own the
        // key before that close request so stepped dismissal never hides a live modal.
        event.preventDefault();
        event.stopPropagation();
        if (!busy && !event.repeat) (onEscape ?? onClose)();
      }}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.stopPropagation();
        // Browser/platform close requests can bypass keydown. If the browser will
        // close regardless, let onClose synchronize the owner's state afterward.
        if (!event.cancelable) return;
        event.preventDefault();
        if (!busy) (onEscape ?? onClose)();
      }}
      onClose={(event) => {
        if (event.target !== event.currentTarget) return;
        event.stopPropagation();
        // Ignore cleanup events queued before a reopen (including Strict Mode).
        if (open && !event.currentTarget.open && event.currentTarget.isConnected) onClose();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="confirm-dialog__panel">
        {scrollBody ? (
          <div className="confirm-dialog__header">
            <h2 id={titleId}>{title}</h2>
            {headerActions}
          </div>
        ) : (
          <h2 id={titleId}>{title}</h2>
        )}
        {scrollBody ? <div className="confirm-dialog__body">{children}</div> : children}
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
