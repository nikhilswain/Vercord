import { useEffect, useId, useRef, type ReactNode } from 'react';
import { RpgIcon } from '../RpgIcon';

/** Non-modal companion to RpgDialog. Focus can return to the world; no backdrop or trap. */
export function RpgHudPanel({
  open,
  title,
  children,
  footer,
  leading,
  actions,
  compact = false,
  onClose,
  onFocusChange,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  onClose(): void;
  onFocusChange(focused: boolean): void;
}) {
  const id = useId(),
    panel = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (!open) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      (panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current)?.focus({
        preventScroll: true,
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      onFocusChange(false);
      if (focused.current && returnFocus.current?.isConnected)
        returnFocus.current.focus({ preventScroll: true });
    };
  }, [open, onFocusChange]);
  if (!open) return null;
  return (
    <section
      ref={panel}
      className="rpg-hud-panel rpg-frame"
      data-compact={compact}
      role="dialog"
      aria-modal="false"
      aria-labelledby={id}
      tabIndex={-1}
      onFocusCapture={() => {
        focused.current = true;
        onFocusChange(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          focused.current = false;
          onFocusChange(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          onClose();
        }
        event.stopPropagation();
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="rpg-social-header">
        {leading}
        <h2 id={id}>{title}</h2>
        {actions}
        <button
          type="button"
          className="rpg-social-icon"
          aria-label={`Close ${title}`}
          onClick={onClose}
        >
          <RpgIcon name="close" />
        </button>
      </header>
      <div className="rpg-social-body">{children}</div>
      {footer && <footer className="rpg-social-footer">{footer}</footer>}
    </section>
  );
}
