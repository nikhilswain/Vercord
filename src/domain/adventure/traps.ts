import { normalizeEncounterLevel } from './progression';

export const PRESSURE_PLATE_RADIUS = 21;

/** Contact raises spikes immediately. Occupied plates stay dangerous until stepped off. */
export function pressureTrapState(time: number, lastContact: number, level = 1) {
  const age = time - lastContact;
  const active = age >= 0 && age < 0.35;
  return {
    active,
    warning: false,
    frame: active ? 2 + (Math.floor(time / 0.12) % 2) : age < 0.47 ? 4 : 0,
    damage: Math.round(14 * (1 + (normalizeEncounterLevel(level) - 1) * 0.05)),
  };
}

/** Swept foot contact prevents a fast step from skipping a narrow plate. */
export function crossesPressurePlate(
  from: { x: number; y: number },
  to: { x: number; y: number },
  plate: { x: number; y: number },
): boolean {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((plate.x - from.x) * dx + (plate.y - from.y) * dy) / lengthSquared),
        );
  return Math.hypot(plate.x - from.x - t * dx, plate.y - from.y - t * dy) <= PRESSURE_PLATE_RADIUS;
}

/** One deterministic clock for visible spike frames and collisions, shared across worlds. */
export function trapState(time: number, offset: number, level = 1) {
  const pressure = Math.max(0, normalizeEncounterLevel(level) - 5) / 15;
  const cycleMs = 2000 - pressure * 700;
  const warningAt = 650 - pressure * 400;
  const riseAt = warningAt + 200 - pressure * 80;
  const activeAt = riseAt + 80 - pressure * 30;
  const retractAt = activeAt + 700 - pressure * 50;
  const loweredAt = retractAt + 150 - pressure * 50;
  const phase = ((((time + offset) * 1000) % cycleMs) + cycleMs) % cycleMs;
  const active = phase >= activeAt && phase < retractAt;
  return {
    active,
    warning: phase >= warningAt && phase < riseAt,
    frame:
      phase < riseAt
        ? 0
        : phase < activeAt
          ? 1
          : active
            ? 2 + (Math.floor((phase - activeAt) / 120) % 2)
            : phase < loweredAt
              ? 4
              : 5,
    damage: Math.round(14 * (1 + (normalizeEncounterLevel(level) - 1) * 0.05)),
  };
}
