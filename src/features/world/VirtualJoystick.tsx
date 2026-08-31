import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface VirtualJoystickProps {
  onChange: (x: number, y: number, sprinting: boolean) => void;
}

const MAX_DISTANCE = 34;

export function VirtualJoystick({ onChange }: VirtualJoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const deltaX = event.clientX - (rect.left + rect.width / 2);
    const deltaY = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(deltaX, deltaY);
    const scale = distance > MAX_DISTANCE ? MAX_DISTANCE / distance : 1;
    const x = deltaX * scale;
    const y = deltaY * scale;
    setKnob({ x, y });
    onChange(x / MAX_DISTANCE, y / MAX_DISTANCE, distance > MAX_DISTANCE * 1.35);
  };

  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== activePointer.current) return;
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0, false);
  };

  return (
    <div className="world-joystick" aria-label="Movement joystick">
      <div
        ref={baseRef}
        className="world-joystick-base"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          activePointer.current = event.pointerId;
          update(event);
        }}
        onPointerMove={(event) => {
          if (event.pointerId === activePointer.current) update(event);
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <span
          className="world-joystick-knob"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
          aria-hidden="true"
        >
          ✦
        </span>
      </div>
    </div>
  );
}
