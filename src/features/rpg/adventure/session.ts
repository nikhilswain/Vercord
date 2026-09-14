import { containsPoint, resolveMovement } from '../../world/engine/collision';
import type { Point, Rect } from '../../world/engine/types';
import type { RpgDirection } from '../types';
import {
  ENEMY_DEFINITIONS as STATS,
  spawnEnemyPower,
  enemyBehavior,
  type EnemyBehavior,
} from '../../../domain/adventure/enemies';
import {
  crossesPressurePlate,
  pressureTrapState,
  trapState,
} from '../../../domain/adventure/traps';
import { attackAim, SPELL_DEFINITIONS } from '../../../domain/adventure/spells';
export { trapState } from '../../../domain/adventure/traps';
import {
  createPlayerProgression,
  equipWeapon,
  grantExperience,
  NORMAL_EQUIPMENT_POLICY,
  sanitizePlayerProgression,
  type PlayerProgression,
} from '../../../domain/adventure/equipment';
import { getWeaponDefinition, type WeaponDefinition } from '../../../domain/adventure/weapons';
import {
  experienceForLevel,
  levelForExperience,
  MAX_CHARACTER_LEVEL,
  normalizeEncounterLevel,
} from '../../../domain/adventure/progression';
import type {
  AdventureStatus,
  CombatMode,
  EncounterSpawn,
  FlowerSpawn,
  AdventureDefinition,
  SpellId,
} from './types';

export type EnemyPhase = 'idle' | 'walk' | 'windup' | 'attack' | 'hurt' | 'death';
export interface Enemy extends EncounterSpawn {
  attackCount: number;
  behavior: Readonly<EnemyBehavior>;
  windupDurationMs: number;
  comboRemaining: number;
  staggerReadyAt: number;
  level: number;
  damage: number;
  home: Point;
  health: number;
  maxHealth: number;
  phase: EnemyPhase;
  phaseAt: number;
  readyAt: number;
  direction: RpgDirection;
  target: Point;
  hit: boolean;
  slowedUntil: number;
  burningUntil: number;
  burnTickAt: number;
}
export interface SpellCast {
  damage: number;
  at: number;
  origin: Point;
  direction: RpgDirection;
  aim: Point;
  spell: SpellId;
  released: boolean;
}
export interface Projectile extends Point {
  damage: number;
  id: number;
  spell: SpellId;
  velocity: Point;
  at: number;
  distance: number;
}
export interface EnemyProjectile extends Point {
  id: number;
  owner: string;
  velocity: Point;
  distance: number;
  range: number;
  damage: number;
  invulnerabilityMs: number;
}
export interface AdventureTraveler {
  progression: PlayerProgression;
  health: number;
  herbs: number;
  spell: SpellId;
  combatMode: CombatMode;
}
export interface MeleeAttack {
  at: number;
  origin: Point;
  direction: RpgDirection;
  weapon: WeaponDefinition;
  hit: boolean;
}
export interface AdventureOptions {
  progression?: PlayerProgression;
  equipmentPolicy?: typeof NORMAL_EQUIPMENT_POLICY;
  /** Explicit sandbox override; normal encounters derive their level from the profile. */
  enemyLevelOverride?: number;
  /** Authored safe areas are content, never inferred from the spawn's direction. */
  safeAreas?: readonly Rect[];
}
export interface AdventureEffect extends Point {
  id: number;
  at: number;
  kind:
    | 'hit'
    | 'gather'
    | 'heal'
    | 'fire'
    | 'water'
    | 'fire-death'
    | 'water-death'
    | 'poison-death'
    | 'level';
}

const vectors: Record<RpgDirection, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function facing(a: Point, b: Point): RpgDirection {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}

/** Shared encounter simulation. The journey retains one session for each visited area.
 * Bounded effects and static collision data; no timers or per-tick React state.
 */
export class AdventureSession {
  readonly enemies: Enemy[];
  readonly gathered = new Set<string>();
  readonly effects: AdventureEffect[] = [];
  readonly enemyProjectiles: EnemyProjectile[] = [];
  health = 100;
  herbs = 1;
  time = 0;
  cast: SpellCast | null = null;
  melee: MeleeAttack | null = null;
  readonly projectiles: Projectile[] = [];
  spell: SpellId = 'fire';
  combatMode: CombatMode = 'fire';
  private progression: PlayerProgression;
  private readonly rewardedEnemies = new Set<string>();
  invincibleUntil = 0;
  private message =
    'Aim with the cursor, then left click. 1 / 2 choose magic; 3 chooses your weapon. I opens equipment.';
  private messageUntil = 8;
  private attackReadyAt = 0;
  private sequence = 0;
  private encounterLevelValue: number;
  private readonly previousPlayer: Point;
  private trapEpoch = 0;
  private readonly trapContacts: number[];
  get encounterLevel(): number {
    return this.encounterLevelValue;
  }
  get trapTime(): number {
    return this.time - this.trapEpoch;
  }

  constructor(
    readonly content: AdventureDefinition,
    private readonly colliders: Rect[],
    private readonly bounds: Rect,
    readonly spawn: Point,
    readonly casting = { durationMs: 700, releaseMs: 400 },
    readonly options: AdventureOptions = {},
  ) {
    this.progression = sanitizePlayerProgression(
      options.progression ?? createPlayerProgression(),
      options.equipmentPolicy ?? NORMAL_EQUIPMENT_POLICY,
    );
    this.encounterLevelValue = normalizeEncounterLevel(options.enemyLevelOverride ?? this.level);
    this.previousPlayer = { ...spawn };
    this.trapContacts = (content.traps ?? []).map(() => -Infinity);
    this.enemies = content.enemies.map((entry) => {
      const power = spawnEnemyPower(entry.kind, this.level, {
        elite: entry.elite,
        levelOverride: options.enemyLevelOverride,
      });
      const behavior = enemyBehavior(entry.kind, power.level);
      return {
        attackCount: 0,
        ...entry,
        ...power,
        behavior,
        windupDurationMs: behavior.windupMs,
        comboRemaining: 0,
        staggerReadyAt: 0,
        home: { x: entry.x, y: entry.y },
        maxHealth: power.health,
        phase: 'idle',
        phaseAt: 0,
        readyAt: 0,
        direction: 'down',
        target: { x: entry.x, y: entry.y },
        hit: false,
        slowedUntil: 0,
        burningUntil: 0,
        burnTickAt: 0,
      };
    });
  }

  status(): AdventureStatus {
    const boss = this.enemies.find((enemy) => STATS[enemy.kind].boss);
    return {
      boss: boss
        ? {
            name: STATS[boss.kind].name,
            health: boss.health,
            maxHealth: boss.maxHealth,
            level: boss.level,
            enraged: boss.health > 0 && boss.health <= boss.maxHealth / 2,
          }
        : undefined,
      health: this.health,
      maxHealth: 100,
      herbs: this.herbs,
      blossoms: this.content.flowers.filter(
        (f) => f.kind === 'collection' && this.gathered.has(f.id),
      ).length,
      blossomGoal: this.content.flowers.filter((f) => f.kind === 'collection').length,
      defeated: this.enemies.filter((e) => e.health === 0).length,
      enemyGoal: this.enemies.length,
      message: this.time < this.messageUntil ? this.message : '',
      level: this.level,
      experience: this.experience,
      nextLevel: this.level < MAX_CHARACTER_LEVEL ? experienceForLevel(this.level + 1) : null,
      spell: this.spell,
      waterUnlocked: this.level >= 2,
      castReady: this.time >= this.attackReadyAt && !this.cast && !this.melee,
      combatMode: this.combatMode,
      weaponId: this.progression.equippedWeaponId,
      enemyLevel: this.encounterLevel,
      encounterHealth: Math.max(0, ...this.enemies.map((e) => e.maxHealth)),
      encounterDamage: Math.max(0, ...this.enemies.map((e) => e.damage)),
    };
  }

  /** Returns true when the player needs to be placed back at the safe camp. */
  tick(dt: number, player: Point): boolean {
    dt = Math.max(0, Math.min(dt, 0.05));
    const velocityX =
      dt > 0 ? Math.max(-240, Math.min(240, (player.x - this.previousPlayer.x) / dt)) : 0;
    const velocityY =
      dt > 0 ? Math.max(-240, Math.min(240, (player.y - this.previousPlayer.y) / dt)) : 0;
    this.time += dt;
    if (this.cast) {
      const age = (this.time - this.cast.at) * 1000;
      if (!this.cast.released && age >= this.casting.releaseMs) {
        this.cast.released = true;
        this.release(this.cast);
      }
      if (age >= this.casting.durationMs) this.cast = null;
    }
    this.tickMelee();
    this.tickProjectiles(dt);
    this.tickEnemyProjectiles(dt, player);
    for (const [index, trap] of (this.content.traps ?? []).entries()) {
      const contact = crossesPressurePlate(this.previousPlayer, player, trap);
      if (trap.activation !== 'timed' && contact) this.trapContacts[index] = this.time;
      const state = this.getTrapState(index);
      if (state.active && contact && this.time >= this.invincibleUntil) {
        this.health = Math.max(0, this.health - state.damage);
        this.invincibleUntil = this.time + 1.15;
        this.effect(player, 'hit');
        this.say('Spike plate! Stay off the plates; they trigger when you step on them.');
      }
    }
    this.previousPlayer.x = player.x;
    this.previousPlayer.y = player.y;
    while (this.effects[0] && this.time - this.effects[0].at > 0.85) this.effects.shift();
    for (const enemy of this.enemies) {
      if (enemy.health === 0) continue;
      if (this.time < enemy.burningUntil && this.time >= enemy.burnTickAt) {
        enemy.burnTickAt = this.time + 0.5;
        this.damage(enemy, 4, 'fire', false);
        if (enemy.health === 0) continue;
      }
      const age = this.time - enemy.phaseAt;
      const stats = enemy.behavior;
      if (enemy.phase === 'hurt') {
        if (age * 1000 >= stats.staggerMs) this.phase(enemy, 'idle');
        continue;
      }
      if (enemy.phase === 'windup') {
        const trackUntil = Math.min(stats.trackUntilMs, enemy.windupDurationMs - 90);
        if (age * 1000 < trackUntil && !this.isSafe(player) && this.clearLine(enemy, player)) {
          enemy.target.x = player.x + (velocityX * stats.leadMs) / 1000;
          enemy.target.y = player.y + (velocityY * stats.leadMs) / 1000;
          enemy.direction = facing(enemy, enemy.target);
        }
        if (age * 1000 >= enemy.windupDurationMs) {
          this.phase(enemy, 'attack');
          enemy.hit = false;
        }
        continue;
      }
      if (enemy.phase === 'attack') {
        // Even veteran attacks commit to a fixed target before their lunge begins.
        const ageMs = age * 1000;
        const previousMs = Math.max(0, (age - dt) * 1000);
        const contact = !enemy.hit && ageMs >= stats.impactMs;
        this.advanceLunge(enemy, previousMs, contact ? stats.impactMs : ageMs);
        if (contact) {
          enemy.hit = true;
          const profile = STATS[enemy.kind];
          if (
            profile.projectile &&
            (!profile.boss || enemy.attackCount % 2 === 0 || enemy.health <= enemy.maxHealth / 2)
          )
            this.releaseEnemyProjectiles(enemy);
          if (
            (!profile.projectile || profile.boss) &&
            distance(enemy, player) < stats.hitRadius &&
            this.clearLine(enemy, player) &&
            this.time >= this.invincibleUntil &&
            !this.isSafe(player)
          ) {
            this.health = Math.max(0, this.health - enemy.damage);
            this.invincibleUntil = this.time + stats.playerInvulnerabilityMs / 1000;
            this.effect(player, 'hit');
            this.say('Hit! Sidestep the attack; watch for a follow-up. H uses a healing herb.');
          }
          this.advanceLunge(enemy, Math.max(previousMs, stats.impactMs), ageMs);
        }
        if (age * 1000 >= stats.durationMs) {
          if (
            distance(player, enemy.home) > stats.leash ||
            this.isSafe(player) ||
            !this.clearLine(enemy, player)
          )
            enemy.comboRemaining = 0;
          enemy.readyAt =
            this.time +
            (enemy.comboRemaining > 0 ? stats.comboRecoveryMs : stats.recoveryMs) / 1000;
          this.phase(enemy, 'idle');
        }
        continue;
      }
      const inTerritory = distance(player, enemy.home) < stats.leash && !this.isSafe(player);
      const seesPlayer =
        inTerritory && distance(enemy, player) < stats.aggro && this.clearLine(enemy, player);
      if (seesPlayer) {
        if (distance(enemy, player) <= stats.reach && this.time >= enemy.readyAt) {
          const chained = enemy.comboRemaining > 0;
          enemy.comboRemaining = chained ? enemy.comboRemaining - 1 : stats.comboSize - 1;
          enemy.windupDurationMs = chained ? stats.comboWindupMs : stats.windupMs;
          enemy.direction = facing(enemy, player);
          enemy.target = { ...player };
          enemy.attackCount++;
          this.phase(enemy, 'windup');
        } else if (
          distance(enemy, player) >
          (STATS[enemy.kind].projectile && !STATS[enemy.kind].boss ? stats.reach * 0.8 : 40)
        ) {
          this.phase(enemy, 'walk');
          this.move(
            enemy,
            player,
            stats.speed * (this.time < enemy.slowedUntil ? 0.45 : 1),
            dt,
            true,
          );
        } else this.phase(enemy, 'idle');
      } else if (distance(enemy, enemy.home) > 4) {
        enemy.comboRemaining = 0;
        this.phase(enemy, 'walk');
        this.move(enemy, enemy.home, stats.speed, dt, true);
      } else {
        enemy.comboRemaining = 0;
        this.phase(enemy, 'idle');
      }
    }
    if (this.health > 0) return false;
    this.rest();
    for (const enemy of this.enemies)
      if (enemy.health > 0) {
        enemy.x = enemy.home.x;
        enemy.y = enemy.home.y;
        enemy.readyAt = this.time + 1;
        this.phase(enemy, 'idle');
      }
    this.say('You caught your breath at camp. Your flowers and progress are safe.', 7);
    return true;
  }

  get level(): number {
    return levelForExperience(this.experience);
  }
  get experience(): number {
    return this.progression.experience;
  }
  /** Serializable snapshot for a storage adapter; mutation stays behind validated commands. */
  getProgression(): PlayerProgression {
    return { ...this.progression, ownedWeaponIds: [...this.progression.ownedWeaponIds] };
  }

  traveler(): AdventureTraveler {
    return {
      progression: this.getProgression(),
      health: this.health,
      herbs: this.herbs,
      spell: this.spell,
      combatMode: this.combatMode,
    };
  }

  /** Arrival cannot sweep a trap from the previous map or carry a half-finished attack. */
  arrive(traveler: AdventureTraveler | undefined, position: Point): void {
    if (traveler) {
      this.progression = sanitizePlayerProgression(
        traveler.progression,
        this.options.equipmentPolicy,
      );
      this.health = traveler.health;
      this.herbs = traveler.herbs;
      this.spell = traveler.spell;
      this.combatMode = traveler.combatMode;
    }
    this.suspend();
    Object.assign(this.previousPlayer, position);
    this.invincibleUntil = this.time + 0.8;
  }

  suspend(): void {
    this.cast = null;
    this.melee = null;
    this.projectiles.length = 0;
    this.enemyProjectiles.length = 0;
    this.effects.length = 0;
    this.trapContacts.fill(-Infinity);
    for (const enemy of this.enemies) {
      enemy.comboRemaining = 0;
      enemy.burningUntil = 0;
      enemy.slowedUntil = 0;
      if (enemy.health > 0) {
        this.phase(enemy, 'idle');
        enemy.readyAt = this.time + 0.8;
      }
    }
  }

  equip(id: string): boolean {
    const result = equipWeapon(this.progression, id, this.options.equipmentPolicy);
    if (!result.success) return false;
    this.progression = result.profile;
    this.cast = null;
    this.melee = null;
    this.combatMode = 'melee';
    this.say(`${getWeaponDefinition(id)!.family} equipped. Aim and left click to attack.`);
    return true;
  }

  selectMelee(): void {
    if (!this.cast && !this.melee) this.combatMode = 'melee';
  }

  /** Only sessions constructed with a sandbox override expose difficulty resets. */
  setEnemyLevel(level: number): boolean {
    if (this.options.enemyLevelOverride === undefined || !Number.isFinite(level)) return false;
    this.rest();
    this.encounterLevelValue = normalizeEncounterLevel(level);
    this.trapEpoch = this.time;
    for (const enemy of this.enemies) {
      const power = spawnEnemyPower(enemy.kind, this.level, {
        elite: enemy.elite,
        levelOverride: level,
      });
      Object.assign(enemy, power, {
        behavior: enemyBehavior(enemy.kind, power.level),
        windupDurationMs: enemyBehavior(enemy.kind, power.level).windupMs,
        comboRemaining: 0,
        attackCount: 0,
        staggerReadyAt: 0,
        ...enemy.home,
        maxHealth: power.health,
        target: { ...enemy.home },
        phase: 'idle',
        phaseAt: this.time,
        readyAt: this.time + 1,
        hit: false,
        burnTickAt: 0,
      });
    }
    this.say(`Level ${this.enemies[0]?.level ?? 1} encounters reset. Flowers and XP kept.`, 6);
    return true;
  }

  selectSpell(spell: SpellId): void {
    if (this.cast || this.melee) return;
    if (spell === 'water' && this.level < 2) {
      this.say('Tide unlocks at level 2. Gather flowers and clear the trail to learn it.');
      return;
    }
    this.spell = spell;
    this.combatMode = spell;
  }

  getTrapState(index: number): ReturnType<typeof trapState> {
    const trap = this.content.traps?.[index];
    return trap?.activation === 'timed'
      ? trapState(this.trapTime, trap.offset, this.encounterLevel)
      : pressureTrapState(this.time, this.trapContacts[index] ?? -Infinity, this.encounterLevel);
  }

  attack(player: Point, direction: RpgDirection, target?: Point): RpgDirection | null {
    if (this.time < this.attackReadyAt || this.cast || this.melee) return null;
    const aim = attackAim(player, vectors[direction], target);
    direction = facing({ x: 0, y: 0 }, aim);
    if (this.combatMode === 'melee') {
      const weapon = getWeaponDefinition(this.progression.equippedWeaponId)!;
      this.melee = { at: this.time, origin: { ...player }, direction, weapon, hit: false };
      this.attackReadyAt = this.time + weapon.cooldownMs / 1000;
      return direction;
    }
    if (this.projectiles.length >= 8) return null;
    this.cast = {
      damage:
        (this.spell === 'fire' ? 30 : 24) +
        getWeaponDefinition(this.progression.equippedWeaponId)!.spellBonus +
        Math.max(0, this.level - 2) * 3,
      at: this.time,
      origin: { ...player },
      direction,
      aim,
      spell: this.spell,
      released: false,
    };
    this.attackReadyAt = this.time + this.casting.durationMs / 1000 + 0.14;
    return direction;
  }

  private release(cast: SpellCast): void {
    const { speed } = SPELL_DEFINITIONS[cast.spell];
    const launch = { x: cast.origin.x + cast.aim.x * 12, y: cast.origin.y + cast.aim.y * 12 };
    if (!this.clearLine(cast.origin, launch)) {
      this.effect(cast.origin, cast.spell);
      return;
    }
    this.projectiles.push({
      damage: cast.damage,
      id: ++this.sequence,
      spell: cast.spell,
      at: this.time,
      ...launch,
      velocity: { x: cast.aim.x * speed, y: cast.aim.y * speed },
      distance: 12,
    });
  }

  private releaseEnemyProjectiles(enemy: Enemy): void {
    const profile = STATS[enemy.kind];
    const shot = profile.projectile!;
    const enraged = profile.boss && enemy.health <= enemy.maxHealth / 2;
    const count = shot.count + (enraged ? 2 : enemy.level >= 10 && !profile.boss ? 2 : 0);
    const angle = Math.atan2(enemy.target.y - enemy.y, enemy.target.x - enemy.x);
    const speed = shot.speed * (1 + Math.max(0, enemy.level - 5) * 0.035);
    for (let i = 0; i < count && this.enemyProjectiles.length < 32; i++) {
      const a = angle + (i - (count - 1) / 2) * shot.spread;
      this.enemyProjectiles.push({
        id: ++this.sequence,
        owner: enemy.id,
        x: enemy.x,
        y: enemy.y,
        velocity: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
        distance: 0,
        range: shot.range,
        damage: enemy.damage,
        invulnerabilityMs: enemy.behavior.playerInvulnerabilityMs,
      });
    }
  }

  private tickEnemyProjectiles(dt: number, player: Point): void {
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const p = this.enemyProjectiles[i]!;
      const speed = Math.hypot(p.velocity.x, p.velocity.y);
      const travel = Math.min(speed * dt, Math.max(0, p.range - p.distance));
      const steps = Math.max(1, Math.ceil(travel / 5));
      let expired = false;
      for (let step = 0; step < steps && !expired; step++) {
        const previous = { x: p.x, y: p.y };
        p.x += ((p.velocity.x / speed) * travel) / steps;
        p.y += ((p.velocity.y / speed) * travel) / steps;
        p.distance += travel / steps;
        expired =
          p.distance >= p.range - 0.001 ||
          !containsPoint(this.bounds, p.x, p.y) ||
          !this.clearLine(previous, p) ||
          this.isSafe(p);
        if (!expired && distance(p, player) < 17 && this.clearLine(p, player)) {
          if (this.time >= this.invincibleUntil && !this.isSafe(player)) {
            this.health = Math.max(0, this.health - p.damage);
            this.invincibleUntil = this.time + p.invulnerabilityMs / 1000;
            this.effect(player, 'hit');
            this.say('Spore hit! Move across the volley; H uses a healing herb.');
          }
          expired = true;
        }
      }
      if (expired) this.enemyProjectiles.splice(i, 1);
    }
  }

  private tickProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      const speed = Math.hypot(p.velocity.x, p.velocity.y);
      const range = SPELL_DEFINITIONS[p.spell].range;
      const travel = Math.min(speed * dt, Math.max(0, range - p.distance));
      const steps = Math.max(1, Math.ceil(travel / 6));
      let expired = false;
      for (let step = 0; step < steps && !expired; step++) {
        const previous = { x: p.x, y: p.y };
        p.x += ((p.velocity.x / speed) * travel) / steps;
        p.y += ((p.velocity.y / speed) * travel) / steps;
        p.distance += travel / steps;
        if (
          p.distance >= range - 0.0001 ||
          !containsPoint(this.bounds, p.x, p.y) ||
          !this.clearLine(previous, p)
        ) {
          expired = true;
          this.effect(p, p.spell);
          break;
        }
        const hit = this.enemies.find(
          (e) =>
            e.health > 0 &&
            distance(e, p) <
              (STATS[e.kind].boss ? 36 : e.kind === 'bear' || e.kind === 'guardian' ? 27 : 19) &&
            this.clearLine(p, e),
        );
        if (hit) {
          this.damage(hit, p.damage, p.spell);
          if (hit.health > 0) {
            if (p.spell === 'fire') {
              hit.burningUntil = this.time + 2;
              hit.burnTickAt = this.time + 0.5;
            } else {
              hit.burningUntil = 0;
              hit.slowedUntil = this.time + 2.6;
              this.move(
                hit,
                { x: hit.x + p.velocity.x, y: hit.y + p.velocity.y },
                100,
                0.16,
                false,
              );
            }
          }
          expired = true;
        }
      }
      if (expired) this.projectiles.splice(i, 1);
    }
  }

  private tickMelee(): void {
    const swing = this.melee;
    if (!swing) return;
    const age = (this.time - swing.at) * 1000;
    if (!swing.hit && age >= swing.weapon.impactMs) {
      swing.hit = true;
      const forward = vectors[swing.direction];
      const thrust = swing.weapon.family === 'spear' || swing.weapon.family === 'staff';
      for (const enemy of this.enemies) {
        const dx = enemy.x - swing.origin.x,
          dy = enemy.y - swing.origin.y;
        const ahead = dx * forward.x + dy * forward.y;
        const side = Math.abs(dx * forward.y - dy * forward.x);
        const d = Math.hypot(dx, dy);
        if (
          enemy.health > 0 &&
          d <= swing.weapon.reach &&
          ahead > 0 &&
          (thrust ? side <= 22 : ahead / Math.max(1, d) > 0.2) &&
          this.clearLine(swing.origin, enemy)
        ) {
          this.damage(enemy, swing.weapon.damage, 'melee');
          if (
            enemy.health > 0 &&
            (enemy.behavior.staggerImmunityMs === 0 || enemy.phase === 'hurt')
          )
            this.move(
              enemy,
              { x: enemy.x + forward.x * 32, y: enemy.y + forward.y * 32 },
              100,
              0.12,
              false,
            );
        }
      }
    }
    if (age >= swing.weapon.animationMs) this.melee = null;
  }

  private damage(enemy: Enemy, amount: number, spell: CombatMode, stagger = true): void {
    if (enemy.health === 0) return;
    enemy.health = Math.max(0, enemy.health - amount);
    if (enemy.health === 0) {
      this.phase(enemy, 'death');
      for (let i = this.enemyProjectiles.length - 1; i >= 0; i--)
        if (this.enemyProjectiles[i]!.owner === enemy.id) this.enemyProjectiles.splice(i, 1);
      this.effect(
        enemy,
        enemy.kind === 'guardian' || enemy.kind === 'snake'
          ? 'poison-death'
          : spell === 'fire'
            ? 'fire-death'
            : spell === 'water'
              ? 'water-death'
              : 'hit',
      );
      if (!this.rewardedEnemies.has(enemy.id)) {
        this.rewardedEnemies.add(enemy.id);
        this.reward(STATS[enemy.kind].xp, enemy);
      }
      if (STATS[enemy.kind].boss)
        this.say(
          'Root Beast defeated! The temple is quiet. Your reward and discoveries are safe.',
          9,
        );
    } else {
      if (stagger && this.time >= enemy.staggerReadyAt) {
        this.phase(enemy, 'hurt');
        enemy.comboRemaining = 0;
        enemy.staggerReadyAt = this.time + enemy.behavior.staggerImmunityMs / 1000;
        enemy.readyAt = this.time + (enemy.behavior.staggerMs + 120) / 1000;
      }
      this.effect(enemy, spell === 'melee' ? 'hit' : spell);
    }
  }

  private reward(amount: number, point: Point): void {
    const before = this.level;
    this.progression = grantExperience(this.progression, amount);
    if (this.level > before) {
      this.effect(point, 'level');
      this.say(
        this.level === 2
          ? 'Level 2 · Tide learned! Press 2 to slow enemies with water.'
          : `Level ${this.level} · Your spells are stronger. New weapon tiers await!`,
        7,
      );
    }
  }

  nearbyFlower(player: Point): FlowerSpawn | undefined {
    return this.content.flowers.find(
      (flower) =>
        !this.gathered.has(flower.id) &&
        distance(player, flower) < 48 &&
        this.clearLine(player, flower),
    );
  }

  gather(player: Point): boolean {
    const flower = this.nearbyFlower(player);
    if (!flower) return false;
    this.gathered.add(flower.id);
    if (flower.kind === 'healing') this.herbs++;
    this.effect(flower, 'gather');
    this.say(
      flower.kind === 'healing'
        ? 'Healing herb gathered. Press H to restore 40 health.'
        : 'Moonblossom collected. Look for the others near the pool and clearings.',
    );
    this.reward(flower.kind === 'collection' ? 15 : 10, player);
    return true;
  }

  heal(player: Point): void {
    if (this.health === 100) {
      this.say('You are already at full health. Save your herbs.');
      return;
    }
    if (this.herbs === 0) {
      this.say('No herbs left. Gather a golden flower with E.');
      return;
    }
    this.herbs--;
    const restored = Math.min(40, 100 - this.health);
    this.health = Math.min(100, this.health + 40);
    this.effect(player, 'heal');
    this.say(`Restored ${restored} health.`);
  }

  rest(): void {
    this.suspend();
    this.previousPlayer.x = this.spawn.x;
    this.previousPlayer.y = this.spawn.y;
    this.trapContacts.fill(-Infinity);
    this.health = 100;
    this.cast = null;
    this.melee = null;
    this.projectiles.length = 0;
    this.effects.length = 0;
    for (const enemy of this.enemies) {
      enemy.comboRemaining = 0;
      enemy.staggerReadyAt = 0;
      enemy.burningUntil = 0;
      enemy.slowedUntil = 0;
    }
    this.invincibleUntil = this.time + 1.5;
  }

  private phase(enemy: Enemy, phase: EnemyPhase): void {
    if (enemy.phase === phase) return;
    enemy.phase = phase;
    enemy.phaseAt = this.time;
  }
  private isSafe(point: Point): boolean {
    return (
      (this.options.safeAreas ?? this.content.safeAreas)?.some((rect) =>
        containsPoint(rect, point.x, point.y),
      ) ?? false
    );
  }
  private say(message: string, seconds = 4): void {
    this.message = message;
    this.messageUntil = this.time + seconds;
  }
  private effect(point: Point, kind: AdventureEffect['kind']): void {
    if (this.effects.length >= 16) this.effects.shift();
    this.effects.push({ id: ++this.sequence, x: point.x, y: point.y, at: this.time, kind });
  }
  private clearLine(from: Point, to: Point): boolean {
    // Exact segment/rectangle slabs: sampled points can miss a thin trunk corner.
    const dx = to.x - from.x,
      dy = to.y - from.y;
    for (const rect of this.colliders) {
      let enter = 0,
        exit = 1;
      if (dx === 0) {
        if (from.x < rect.x || from.x > rect.x + rect.width) continue;
      } else {
        const a = (rect.x - from.x) / dx,
          b = (rect.x + rect.width - from.x) / dx;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
      if (dy === 0) {
        if (from.y < rect.y || from.y > rect.y + rect.height) continue;
      } else {
        const a = (rect.y - from.y) / dy,
          b = (rect.y + rect.height - from.y) / dy;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
      if (enter <= exit) return false;
    }
    return true;
  }
  private move(enemy: Enemy, target: Point, speed: number, dt: number, cardinal: boolean): void {
    let dx = target.x - enemy.x,
      dy = target.y - enemy.y;
    if (cardinal) {
      // Hold an axis until aligned, instead of alternating directions every frame
      // when both distances are similar. Lunges deliberately follow a locked vector.
      const horizontal = enemy.direction === 'left' || enemy.direction === 'right';
      if ((horizontal && Math.abs(dx) > 5) || Math.abs(dy) <= 5) dy = 0;
      else dx = 0;
    }
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    enemy.direction = facing(enemy, { x: enemy.x + dx, y: enemy.y + dy });
    const reach = cardinal ? length : Math.max(0, length - (enemy.kind === 'bear' ? 26 : 18));
    const step = Math.min(reach, speed * dt);
    const size = enemy.kind === 'bear' ? 15 : 9;
    const next = resolveMovement(
      { x: enemy.x - size, y: enemy.y - 8, width: size * 2, height: 12 },
      (dx / length) * step,
      (dy / length) * step,
      this.colliders,
      this.bounds,
    );
    enemy.x = next.x + size;
    enemy.y = next.y + 8;
  }
  private advanceLunge(enemy: Enemy, fromMs: number, toMs: number): void {
    const until = enemy.behavior.lungeMs;
    const dt = Math.max(0, Math.min(until, toMs) - Math.min(until, fromMs)) / 1000;
    if (dt > 0) this.move(enemy, enemy.target, enemy.behavior.lungeSpeed, dt, false);
  }
}
