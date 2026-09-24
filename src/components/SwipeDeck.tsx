import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import './swipe-deck.css';

export interface DeckImage {
  src: string;
  alt?: string;
}

export interface SwipeDeckProps {
  images: DeckImage[];
  /** `fan` scatters a stack; `flow` is a 3D cover-flow carousel. */
  variant: 'fan' | 'flow';
  className?: string;
  /** Accessible name for the deck (also used in the live-region text). */
  label?: string;
  /** Decorative decks stay out of the accessibility tree but remain swipeable. */
  decorative?: boolean;
}

interface PointerState {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastT: number;
  velocity: number;
  moved: boolean;
  index: number;
  isFront: boolean;
}

/**
 * A stack of images you can drag or click through.
 *
 * The front card follows the pointer, then either springs back or cycles on
 * distance/flick; the depth change is a CSS transition, so the deck animates
 * from one state update and stays on the compositor. Neighbours are tap targets
 * that bring themselves forward, and arrow keys cycle when the deck is focused.
 *
 * Taps are handled in the pointer handlers rather than `onClick`: the browser
 * fires `click` on the same node after `pointerup`, and by then React has
 * re-rendered that node as a different card, so a click handler would act on
 * the wrong index.
 */
export function SwipeDeck({
  images,
  variant,
  className,
  label = 'Image',
  decorative = false,
}: SwipeDeckProps) {
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<PointerState | null>(null);
  const count = images.length;

  const step = (direction: 1 | -1) => {
    setActive((current) => (current + direction + count) % count);
  };

  const onCardPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== null || count < 2) return;
    const element = event.currentTarget;
    const index = Number(element.dataset.index ?? '0');
    const isFront = index === active;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; the events
      // that do arrive are still enough to drive the gesture.
    }
    if (isFront) {
      element.style.transition = 'none';
      element.style.cursor = 'grabbing';
    }
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
      moved: false,
      index,
      isFront,
    };
  };

  const onCardPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (pointer === null || event.pointerId !== pointer.id) return;
    const now = event.timeStamp;
    const elapsed = Math.max(1, now - pointer.lastT);
    pointer.velocity = (event.clientX - pointer.lastX) / elapsed;
    pointer.lastX = event.clientX;
    pointer.lastT = now;
    const dx = event.clientX - pointer.startX;
    if (Math.abs(dx) > 6) pointer.moved = true;
    if (!pointer.isFront) return;
    const dy = (event.clientY - pointer.startY) * 0.35;
    event.currentTarget.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${dx * 0.035}deg)`;
  };

  const onCardPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (pointer === null || event.pointerId !== pointer.id) return;
    pointerRef.current = null;
    const element = event.currentTarget;
    if (pointer.isFront) {
      element.style.transition = '';
      element.style.transform = '';
      element.style.cursor = '';
    }

    const dx = event.clientX - pointer.startX;
    const width = containerRef.current?.offsetWidth ?? 320;
    const flung = Math.abs(pointer.velocity) > 0.45;
    if (pointer.isFront && (Math.abs(dx) > width * 0.22 || flung)) {
      step(dx < 0 ? 1 : -1);
    } else if (!pointer.moved) {
      if (pointer.isFront) step(1);
      else setActive(pointer.index);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    }
  };

  return (
    <div
      ref={containerRef}
      className={['swipe-deck', `swipe-deck--${variant}`, className].filter(Boolean).join(' ')}
      role={decorative ? undefined : 'group'}
      aria-roledescription={decorative ? undefined : 'carousel'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      tabIndex={decorative ? undefined : 0}
      onKeyDown={decorative ? undefined : onKeyDown}
    >
      {images.map((image, index) => {
        const depth = (index - active + count) % count;
        const isFront = depth === 0;
        // Signed distance from the active card, wrapped to [-half, half], so the
        // cover-flow can place neighbours to the left and right.
        const half = Math.floor(count / 2);
        let offset = index - active;
        if (offset > half) offset -= count;
        if (offset < -half) offset += count;
        return (
          <div
            key={`${image.src}-${index}`}
            className="deck-card px-frame"
            data-index={index}
            data-depth={depth}
            data-offset={offset}
            data-hidden={variant === 'flow' && Math.abs(offset) > 1 ? true : undefined}
            style={{ zIndex: variant === 'flow' ? count - Math.abs(offset) : count - depth }}
            onPointerDown={onCardPointerDown}
            onPointerMove={onCardPointerMove}
            onPointerUp={onCardPointerUp}
            onPointerCancel={onCardPointerUp}
          >
            <img
              src={image.src}
              alt={isFront ? (image.alt ?? '') : ''}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </div>
        );
      })}
      {decorative ? null : (
        <p className="sr-only" aria-live="polite">
          {`${label} ${active + 1} of ${count}`}
        </p>
      )}
    </div>
  );
}
