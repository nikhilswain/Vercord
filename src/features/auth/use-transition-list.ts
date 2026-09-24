import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface TransitionItem<T> {
  key: string;
  item: T;
  leaving: boolean;
  /** Viewport-flow offset/size when the item left, used to pin it while it exits. */
  rect: Rect | null;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/* Movement uses the strong in-out curve; entrances/exits use the strong
   ease-out already shared by the pixel layer. */
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
const ENTER_MS = 340;
const MOVE_MS = 280;
const EXIT_MS = 180;
const STAGGER_MS = 40;
const MAX_STAGGER = 8;

/* Without WAAPI there is no way to play an exit, so removed items are dropped
   immediately instead of being pinned as `leaving` placeholders. */
const canAnimate =
  typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function readRect(element: HTMLElement): Rect {
  return {
    x: element.offsetLeft,
    y: element.offsetTop,
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

/**
 * Animates a keyed list through add / remove / reflow changes.
 *
 * Removed items are held in the render output as `leaving` placeholders (pin
 * them with `position: absolute` at `rect`) so they can play an exit while the
 * survivors reflow. Survivors that change grid position get a FLIP pass.
 * Motion runs through WAAPI, so it stays on the compositor and needs no
 * library; reduced-motion keeps only short opacity fades.
 */
export function useTransitionList<T>(
  items: readonly T[],
  getKey: (item: T) => string,
): { listRef: RefObject<HTMLUListElement | null>; rendered: TransitionItem<T>[] } {
  const listRef = useRef<HTMLUListElement>(null);
  const rectsRef = useRef(new Map<string, Rect>());
  const exitAnimsRef = useRef(new Map<string, Animation>());
  const [rendered, setRendered] = useState<TransitionItem<T>[]>(() =>
    items.map((item) => ({ key: getKey(item), item, leaving: false, rect: null })),
  );

  useLayoutEffect(() => {
    setRendered((previous) => {
      const nextKeys = new Set(items.map(getKey));
      const byKey = new Map(previous.map((entry) => [entry.key, entry]));

      const next: TransitionItem<T>[] = items.map((item) => {
        const key = getKey(item);
        const existing = byKey.get(key);
        return existing !== undefined && !existing.leaving
          ? existing
          : { key, item, leaving: false, rect: null };
      });

      if (canAnimate) {
        for (const entry of previous) {
          if (nextKeys.has(entry.key)) continue;
          next.push(
            entry.leaving
              ? entry
              : { ...entry, leaving: true, rect: rectsRef.current.get(entry.key) ?? null },
          );
        }
      }

      const unchanged =
        next.length === previous.length && next.every((entry, index) => entry === previous[index]);
      return unchanged ? previous : next;
    });
  }, [items, getKey]);

  const removeLeaver = useCallback((key: string) => {
    setRendered((previous) => previous.filter((entry) => !(entry.leaving && entry.key === key)));
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) return;

    const nodes = new Map<string, HTMLElement>();
    for (const node of list.querySelectorAll<HTMLElement>('[data-key]')) {
      const key = node.dataset.key;
      if (key !== undefined) nodes.set(key, node);
    }

    const reduced = prefersReducedMotion();
    const previous = rectsRef.current;
    const next = new Map<string, Rect>();
    let order = 0;

    for (const entry of rendered) {
      const element = nodes.get(entry.key);
      if (element === undefined) continue;
      const rect = readRect(element);
      next.set(entry.key, rect);
      const index = order;
      order += 1;

      if (typeof element.animate !== 'function') continue;

      if (entry.leaving) {
        // Only start once per key; a second effect pass must not restart it.
        if (!exitAnimsRef.current.has(entry.key)) {
          const animation = element.animate(
            reduced
              ? [{ opacity: 1 }, { opacity: 0 }]
              : [
                  { opacity: 1, transform: 'none' },
                  { opacity: 0, transform: 'translateY(6px) scale(0.98)' },
                ],
            { duration: reduced ? 120 : EXIT_MS, easing: EASE_OUT, fill: 'forwards' },
          );
          exitAnimsRef.current.set(entry.key, animation);
          const key = entry.key;
          void animation.finished
            .then(() => {
              // Deliberately not cancelled: `fill: forwards` holds opacity 0
              // until React unmounts the node, so it never flashes back to 1.
              exitAnimsRef.current.delete(key);
              removeLeaver(key);
            })
            .catch(() => undefined);
        }
        continue;
      }

      // The item came back before its exit finished — cancel and show it.
      const pendingExit = exitAnimsRef.current.get(entry.key);
      if (pendingExit !== undefined) {
        pendingExit.cancel();
        exitAnimsRef.current.delete(entry.key);
      }

      const old = previous.get(entry.key);
      if (old === undefined) {
        const delay = reduced ? 0 : Math.min(index, MAX_STAGGER) * STAGGER_MS;
        const animation = element.animate(
          reduced
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, transform: 'translateY(10px) scale(0.985)' },
                { opacity: 1, transform: 'none' },
              ],
          { duration: reduced ? 160 : ENTER_MS, delay, easing: EASE_OUT, fill: 'both' },
        );
        void animation.finished.then(() => animation.cancel()).catch(() => undefined);
        continue;
      }

      if (reduced) continue;
      const dx = old.x - rect.x;
      const dy = old.y - rect.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      const animation = element.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: MOVE_MS, easing: EASE_IN_OUT },
      );
      void animation.finished.then(() => animation.cancel()).catch(() => undefined);
    }

    rectsRef.current = next;
  }, [rendered, removeLeaver]);

  return { listRef, rendered };
}
