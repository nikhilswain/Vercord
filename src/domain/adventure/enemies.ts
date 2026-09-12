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

export interface EnemyBehavior {
  speed: number;
  reach: number;
  aggro: number;
  leash: number;
  windupMs: number;
  impactMs: number;
  durationMs: number;
  recoveryMs: number;
  lungeSpeed: number;
  lungeMs: number;
  hitRadius: number;
  comboSize: number;
  comboWindupMs: number;
  comboRecoveryMs: number;
  trackUntilMs: number;
  leadMs: number;
  staggerMs: number;
  staggerImmunityMs: number;
  playerInvulnerabilityMs: number;
}

/** Level changes behavior as well as power. Cache once when an encounter spawns/resets. */
export function enemyBehavior(kind: CreatureKind, rawLevel: number): Readonly<EnemyBehavior> {
  const base = ENEMY_DEFINITIONS[kind];
  const level = normalizeEncounterLevel(rawLevel);
  const beginner = (Math.min(5, level) - 1) / 4;
  const pressure = Math.max(0, level - 5) / 15;
  const pace = 1 + beginner * 0.1 + pressure * 0.65;
  const windupMs = Math.round(base.windupMs * (1 - beginner * 0.12) * (1 - pressure * 0.65));
  const impactMs = Math.round(base.impactMs / pace);
  const durationMs = Math.round(base.durationMs / pace);
  const lungeMs = Math.round(base.lungeMs / pace);
  const lungeSpeed = base.lungeSpeed * (1 + beginner * 0.15 + pressure * 0.65);
  const comboLevel =
    kind === 'forest-skirmisher' ? 6 : kind === 'slime' || kind === 'guardian' ? 12 : 8;
  const comboSize = level < comboLevel ? 1 : kind === 'forest-skirmisher' && level >= 15 ? 3 : 2;
  const comboWindupMs = Math.max(110, Math.round(windupMs * 0.65));
  const comboRecoveryMs = Math.round(230 - pressure * 90);
  const nextComboHitMs = durationMs + comboRecoveryMs + comboWindupMs;
  return {
    speed: base.speed * (1 + beginner * 0.12 + pressure * 1.15),
    // Attack only from a distance the contact frame can actually reach.
    reach: Math.min(
      base.reach,
      base.hitRadius + ((lungeSpeed * Math.min(lungeMs, impactMs)) / 1000) * 0.85,
    ),
    aggro: base.aggro * (1 + beginner * 0.12 + pressure * 0.35),
    leash: 235 + pressure * 100,
    windupMs,
    impactMs,
    durationMs,
    lungeMs,
    lungeSpeed,
    hitRadius: base.hitRadius,
    recoveryMs: Math.round(base.recoveryMs * (1 - beginner * 0.12) * (1 - pressure * 0.68)),
    comboSize,
    comboWindupMs,
    comboRecoveryMs,
    trackUntilMs: pressure > 0 ? Math.max(0, windupMs - 90) : 0,
    leadMs: pressure * 100,
    staggerMs: Math.round(300 - pressure * 160),
    staggerImmunityMs: pressure > 0 ? 1000 + pressure * 1400 : 0,
    playerInvulnerabilityMs: Math.min(
      Math.round(1150 - pressure * 650),
      comboSize > 1 ? nextComboHitMs - 80 : 1150,
    ),
  };
}
