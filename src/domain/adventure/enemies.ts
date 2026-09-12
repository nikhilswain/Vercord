import { encounterLevelForPlayer, encounterPower, normalizeEncounterLevel } from './progression';

export type CreatureKind =
  'slime' | 'snake' | 'bear' | 'guardian' | 'forest-brute' | 'forest-skirmisher';

export interface EnemyDefinition {
  name: string;
  health: number;
  speed: number;
  reach: number;
  damage: number;
  aggro: number;
  windupMs: number;
  impactMs: number;
  durationMs: number;
  recoveryMs: number;
  lungeSpeed: number;
  lungeMs: number;
  hitRadius: number;
  xp: number;
}

/** Shared encounter balance; art adapters consume these authored attack timings. */
export const ENEMY_DEFINITIONS: Readonly<Record<CreatureKind, Readonly<EnemyDefinition>>> = {
  slime: {
    name: 'Slime',
    health: 50,
    speed: 48,
    reach: 95,
    damage: 16,
    aggro: 175,
    windupMs: 600,
    impactMs: 330,
    durationMs: 600,
    recoveryMs: 850,
    lungeSpeed: 250,
    lungeMs: 330,
    hitRadius: 37,
    xp: 20,
  },
  snake: {
    name: 'Snake',
    health: 65,
    speed: 65,
    reach: 66,
    damage: 20,
    aggro: 160,
    windupMs: 600,
    impactMs: 220,
    durationMs: 600,
    recoveryMs: 850,
    lungeSpeed: 125,
    lungeMs: 330,
    hitRadius: 37,
    xp: 20,
  },
  bear: {
    name: 'Bear',
    health: 130,
    speed: 57,
    reach: 78,
    damage: 28,
    aggro: 200,
    windupMs: 600,
    impactMs: 260,
    durationMs: 600,
    recoveryMs: 850,
    lungeSpeed: 125,
    lungeMs: 330,
    hitRadius: 52,
    xp: 35,
  },
  guardian: {
    name: 'Forest guardian',
    health: 175,
    speed: 38,
    reach: 100,
    damage: 24,
    aggro: 230,
    windupMs: 600,
    impactMs: 360,
    durationMs: 720,
    recoveryMs: 850,
    lungeSpeed: 125,
    lungeMs: 330,
    hitRadius: 52,
    xp: 50,
  },
  'forest-brute': {
    name: 'Forest brute',
    health: 250,
    speed: 38,
    reach: 80,
    damage: 30,
    aggro: 200,
    windupMs: 800,
    impactMs: 520,
    durationMs: 780,
    recoveryMs: 850,
    lungeSpeed: 90,
    lungeMs: 330,
    hitRadius: 48,
    xp: 50,
  },
  'forest-skirmisher': {
    name: 'Forest skirmisher',
    health: 150,
    speed: 80,
    reach: 100,
    damage: 18,
    aggro: 200,
    windupMs: 450,
    impactMs: 440,
    durationMs: 660,
    recoveryMs: 850,
    lungeSpeed: 160,
    lungeMs: 330,
    hitRadius: 42,
    xp: 40,
  },
};

export interface EnemySpawnOptions {
  elite?: boolean;
  /** Explicit local demo setting; ordinary spawns derive their level from the player. */
  levelOverride?: number;
}

export function spawnEnemyPower(
  kind: CreatureKind,
  playerLevel: number,
  options: EnemySpawnOptions = {},
): { level: number; health: number; damage: number } {
  const level =
    options.levelOverride === undefined
      ? encounterLevelForPlayer(playerLevel, options.elite)
      : normalizeEncounterLevel(options.levelOverride);
  return { level, ...encounterPower(ENEMY_DEFINITIONS[kind], level) };
}
