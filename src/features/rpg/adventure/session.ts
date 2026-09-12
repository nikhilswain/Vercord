import { containsPoint, resolveMovement } from '../../world/engine/collision';
import type { Point, Rect } from '../../world/engine/types';
import type { RpgDirection } from '../types';
import { ENEMY_DEFINITIONS as STATS, spawnEnemyPower } from '../../../domain/adventure/enemies';
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

/** Source frames rise 0→1→2, hold at 2/3, retract 4→5. One clock drives art and damage. */
export function trapState(time: number, offset: number) {
  const phase = (time + offset) % 3.6;
  return {
    active: phase >= 2.12 && phase < 2.85,
    warning: phase > 1.15 && phase < 2,
    frame:
      phase < 2
        ? 0
        : phase < 2.12
          ? 1
          : phase < 2.85
            ? 2 + (Math.floor((phase - 2.12) / 0.2) % 2)
            : phase < 3
              ? 4
              : 5,
  };
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

/** Shared encounter simulation. One session survives area transitions.
 * Bounded effects and static collision data; no timers or per-tick React state.
 */
export class AdventureSession {
  readonly enemies: Enemy[];
  readonly gathered = new Set<string>();
  readonly effects: AdventureEffect[] = [];
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
    'I opens equipment. 1 / 2 choose magic; 3 chooses your weapon. Space attacks; E gathers.';
  private messageUntil = 8;
  private attackReadyAt = 0;
  private sequence = 0;

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
    this.enemies = content.enemies.map((entry) => ({
      ...entry,
      ...spawnEnemyPower(entry.kind, this.level, {
        elite: entry.elite,
        levelOverride: options.enemyLevelOverride,
      }),
      home: { x: entry.x, y: entry.y },
      maxHealth: spawnEnemyPower(entry.kind, this.level, {
        elite: entry.elite,
        levelOverride: options.enemyLevelOverride,
      }).health,
      phase: 'idle',
      phaseAt: 0,
      readyAt: 0,
      direction: 'down',
      target: { x: entry.x, y: entry.y },
      hit: false,
      slowedUntil: 0,
      burningUntil: 0,
      burnTickAt: 0,
    }));
  }

  status(): AdventureStatus {
    return {
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
      enemyLevel: this.enemies[0]?.level ?? this.level,
      encounterHealth: Math.max(0, ...this.enemies.map((e) => e.maxHealth)),
      encounterDamage: Math.max(0, ...this.enemies.map((e) => e.damage)),
    };
  }

  /** Returns true when the player needs to be placed back at the safe camp. */
  tick(dt: number, player: Point): boolean {
    dt = Math.max(0, Math.min(dt, 0.05));
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
    for (const trap of this.content.traps ?? []) {
      if (
        trapState(this.time, trap.offset).active &&
        distance(trap, player) < 21 &&
        this.time >= this.invincibleUntil
      ) {
        this.health = Math.max(0, this.health - 14);
        this.invincibleUntil = this.time + 1.15;
        this.effect(player, 'hit');
        this.say('Watch the amber warning. Walk around the spikes or wait until they retract.');
      }
    }
    while (this.effects[0] && this.time - this.effects[0].at > 0.85) this.effects.shift();
    for (const enemy of this.enemies) {
      if (enemy.health === 0) continue;
      if (this.time < enemy.burningUntil && this.time >= enemy.burnTickAt) {
        enemy.burnTickAt = this.time + 0.5;
        this.damage(enemy, 4, 'fire', false);
        if (enemy.health === 0) continue;
      }
      const age = this.time - enemy.phaseAt;
      const stats = STATS[enemy.kind];
      if (enemy.phase === 'hurt') {
        if (age > 0.3) this.phase(enemy, 'idle');
        continue;
      }
      if (enemy.phase === 'windup') {
        if (age * 1000 >= stats.windupMs) {
          this.phase(enemy, 'attack');
          enemy.hit = false;
        }
        continue;
      }
      if (enemy.phase === 'attack') {
        // The target is locked when the warning begins: walking away really dodges it.
        if (age * 1000 < stats.lungeMs) this.move(enemy, enemy.target, stats.lungeSpeed, dt, false);
        if (!enemy.hit && age * 1000 >= stats.impactMs) {
          enemy.hit = true;
          if (
            distance(enemy, player) < stats.hitRadius &&
            this.clearLine(enemy, player) &&
            this.time >= this.invincibleUntil &&
            !this.isSafe(player)
          ) {
            this.health = Math.max(0, this.health - enemy.damage);
            this.invincibleUntil = this.time + 1.15;
            this.effect(player, 'hit');
            this.say('Hit! Step out of the warning circle. H uses a healing herb.');
          }
        }
        if (age * 1000 >= stats.durationMs) {
          enemy.readyAt = this.time + stats.recoveryMs / 1000;
          this.phase(enemy, 'idle');
        }
        continue;
      }
      const inTerritory = distance(player, enemy.home) < 235 && !this.isSafe(player);
      const seesPlayer =
        inTerritory && distance(enemy, player) < stats.aggro && this.clearLine(enemy, player);
      if (seesPlayer) {
        if (distance(enemy, player) <= stats.reach && this.time >= enemy.readyAt) {
          enemy.direction = facing(enemy, player);
          enemy.target = { ...player };
          this.phase(enemy, 'windup');
        } else if (distance(enemy, player) > 40) {
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
        this.phase(enemy, 'walk');
        this.move(enemy, enemy.home, stats.speed, dt, true);
      } else this.phase(enemy, 'idle');
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

  equip(id: string): boolean {
    const result = equipWeapon(this.progression, id, this.options.equipmentPolicy);
    if (!result.success) return false;
    this.progression = result.profile;
    this.cast = null;
    this.melee = null;
    this.combatMode = 'melee';
    this.say(`${getWeaponDefinition(id)!.family} equipped. Space or J to attack.`);
    return true;
  }

  selectMelee(): void {
    if (!this.cast && !this.melee) this.combatMode = 'melee';
  }

  /** Only sessions constructed with a sandbox override expose difficulty resets. */
  setEnemyLevel(level: number): boolean {
    if (this.options.enemyLevelOverride === undefined || !Number.isFinite(level)) return false;
    this.rest();
    for (const enemy of this.enemies) {
      const power = spawnEnemyPower(enemy.kind, this.level, {
        elite: enemy.elite,
        levelOverride: level,
      });
      Object.assign(enemy, power, {
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

  attack(player: Point, direction: RpgDirection): RpgDirection | null {
    if (this.time < this.attackReadyAt || this.cast || this.melee) return null;
    if (this.combatMode === 'melee') {
      const weapon = getWeaponDefinition(this.progression.equippedWeaponId)!;
      this.melee = { at: this.time, origin: { ...player }, direction, weapon, hit: false };
      this.attackReadyAt = this.time + weapon.cooldownMs / 1000;
      return direction;
    }
    if (this.projectiles.length >= 8) return null;
    // Aim at the nearest visible creature in front. Aim is locked at cast start, never homing.
    const forward = vectors[direction];
    let target: Enemy | undefined;
    let closest = 340;
    for (const enemy of this.enemies) {
      const d = distance(enemy, player);
      const dot =
        ((enemy.x - player.x) * forward.x + (enemy.y - player.y) * forward.y) / Math.max(1, d);
      if (enemy.health > 0 && d < closest && dot > 0.2 && this.clearLine(player, enemy)) {
        target = enemy;
        closest = d;
      }
    }
    const aim = target ? { x: target.x - player.x, y: target.y - player.y } : { ...forward };
    const length = Math.max(1, Math.hypot(aim.x, aim.y));
    if (target) direction = facing(player, target);
    this.cast = {
      damage:
        (this.spell === 'fire' ? 30 : 24) +
        getWeaponDefinition(this.progression.equippedWeaponId)!.spellBonus +
        Math.max(0, this.level - 2) * 3,
      at: this.time,
      origin: { ...player },
      direction,
      aim: { x: aim.x / length, y: aim.y / length },
      spell: this.spell,
      released: false,
    };
    this.attackReadyAt = this.time + this.casting.durationMs / 1000 + 0.14;
    return direction;
  }

  private release(cast: SpellCast): void {
    const speed = cast.spell === 'fire' ? 290 : 340;
    this.projectiles.push({
      damage: cast.damage,
      id: ++this.sequence,
      spell: cast.spell,
      at: this.time,
      x: cast.origin.x + cast.aim.x * 12,
      y: cast.origin.y + cast.aim.y * 12,
      velocity: { x: cast.aim.x * speed, y: cast.aim.y * speed },
      distance: 0,
    });
  }

  private tickProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      const travel = Math.hypot(p.velocity.x, p.velocity.y) * dt;
      const steps = Math.max(1, Math.ceil(travel / 6));
      let expired = false;
      for (let step = 0; step < steps && !expired; step++) {
        const previous = { x: p.x, y: p.y };
        p.x += (p.velocity.x * dt) / steps;
        p.y += (p.velocity.y * dt) / steps;
        p.distance += travel / steps;
        if (
          p.distance > 400 ||
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
            distance(e, p) < (e.kind === 'bear' || e.kind === 'guardian' ? 27 : 19) &&
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
          if (enemy.health > 0)
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
    } else {
      if (stagger) {
        this.phase(enemy, 'hurt');
        enemy.readyAt = this.time + 0.5;
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
    this.health = 100;
    this.cast = null;
    this.melee = null;
    this.projectiles.length = 0;
    this.effects.length = 0;
    for (const enemy of this.enemies) {
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
    return this.options.safeAreas?.some((rect) => containsPoint(rect, point.x, point.y)) ?? false;
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
}
