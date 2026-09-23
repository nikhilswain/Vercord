import { useEffect, useRef } from 'react';

export interface SceneBackdropProps {
  /** Screenshot or art to use as the scene. */
  src: string;
  /** `hero` is crisp and centred; `ambient` is blurred and dimmed behind content. */
  variant?: 'hero' | 'ambient';
  /** How far the scene drifts as the page scrolls, in px per viewport height. */
  scrollFactor?: number;
  /** How far the scene drifts with the pointer, in px. */
  pointerFactor?: number;
}

/**
 * A fixed, full-viewport game scene that content scrolls over.
 *
 * Parallax runs on transform only (GPU-friendly), eased with a light lerp so
 * pointer movement feels like weight rather than a rigid attachment. Motion is
 * skipped entirely when the user prefers reduced motion.
 */
export function SceneBackdrop({
  src,
  variant = 'hero',
  scrollFactor = 0.12,
  pointerFactor = 14,
}: SceneBackdropProps) {
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = imageRef.current;
    if (element === null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let scrollY = 0;
    let currentX = 0;
    let currentY = 0;

    const draw = () => {
      frame = 0;
      const targetX = pointerX;
      const targetY = pointerY + scrollY;
      currentX += (targetX - currentX) * 0.1;
      currentY += (targetY - currentY) * 0.1;
      element.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;
      if (Math.abs(targetX - currentX) > 0.15 || Math.abs(targetY - currentY) > 0.15) {
        frame = requestAnimationFrame(draw);
      }
    };

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(draw);
    };

    const onScroll = () => {
      scrollY = -window.scrollY * scrollFactor;
      schedule();
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerX = (event.clientX / window.innerWidth - 0.5) * -pointerFactor * 2;
      pointerY = (event.clientY / window.innerHeight - 0.5) * -pointerFactor;
      schedule();
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointerMove);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [scrollFactor, pointerFactor]);

  return (
    <div className={`scene-backdrop scene-backdrop--${variant}`} aria-hidden="true">
      <div
        className="scene-backdrop__image"
        ref={imageRef}
        style={{ backgroundImage: `url(${src})` }}
      />
      <div className="scene-backdrop__scrim" />
    </div>
  );
}
