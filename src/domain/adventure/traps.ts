import { normalizeEncounterLevel } from './progression';

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
