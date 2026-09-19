import { useEffect, useRef } from 'react';

const DOUBLE_TAB_MS = 350;
const editable =
  'input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])';

/** Tab belongs to the game: it opens the map, never traverses HUD or dialog controls. */
export function useMapShortcut({
  blocked,
  mapOpen,
  otherPanelOpen,
  onOpen,
}: {
  blocked: boolean;
  mapOpen: boolean;
  otherPanelOpen: boolean;
  onOpen(detail: boolean): void;
}) {
  const openingTap = useRef<number | null>(null);
  useEffect(() => {
    if (blocked || otherPanelOpen || !mapOpen) openingTap.current = null;
  }, [blocked, otherPanelOpen, mapOpen]);
  useEffect(() => {
    const reset = () => {
      openingTap.current = null;
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        reset();
        return;
      }
      // Browser/OS combinations keep their normal meaning. Bare Tab and Shift+Tab
      // are game input even while a form, chat, or another panel is open.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        reset();
        return;
      }
      const handled = event.defaultPrevented;
      event.preventDefault();
      if (
        blocked ||
        otherPanelOpen ||
        handled ||
        event.repeat ||
        event.isComposing ||
        event.shiftKey
      ) {
        if (!event.repeat) reset();
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(editable)) {
        reset();
        return;
      }
      const dialog = target?.closest('dialog');
      if (dialog && (!mapOpen || !dialog.matches('.rpg-atlas-dialog, .rpg-forest-map'))) return;
      const now = Date.now();
      const doubleTap = openingTap.current !== null && now - openingTap.current <= DOUBLE_TAB_MS;
      if (mapOpen && !doubleTap) {
        dialog?.querySelector<SVGSVGElement>('.atlas-svg')?.focus({ preventScroll: true });
        return;
      }
      if (!mapOpen && document.querySelector('dialog[open]')) return;
      openingTap.current = doubleTap ? null : now;
      onOpen(doubleTap);
    };
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('pointerdown', reset);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('blur', reset);
    };
  }, [blocked, mapOpen, otherPanelOpen, onOpen]);
}
