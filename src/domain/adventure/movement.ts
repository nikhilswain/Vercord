/** Shared travel envelope for simulation and the existing movement admission guard. */
export const TRAVEL_SPEED = { walk: 108, run: 174, autoRun: 240 } as const;
export const SWIFTSTEP_MULTIPLIER = 1.25;
export const MAX_TRAVEL_SPEED = TRAVEL_SPEED.autoRun * SWIFTSTEP_MULTIPLIER;
