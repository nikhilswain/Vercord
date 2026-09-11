import { containsPoint, resolveMovement } from '../../world/engine/collision';
import type { Point, Rect } from '../../world/engine/types';
import type { RpgDirection } from '../types';
import type {
  AdventureStatus,
  CreatureKind,
  EncounterSpawn,
  FlowerSpawn,
  JungleDefinition,
  SpellId,
} from './types';

export type EnemyPhase = 'idle' | 'walk' | 'windup' | 'attack' | 'hurt' | 'death';
export interface Enemy extends EncounterSpawn {
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
  at: number;
  origin: Point;
  direction: RpgDirection;
  aim: Point;
  spell: SpellId;
  released: boolean;
}
export interface Projectile extends Point {
  id: number;
  spell: SpellId;
  velocity: Point;
  at: number;
  distance: number;
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

const STATS: Record<
  CreatureKind,
  { health: number; speed: number; reach: number; damage: number; aggro: number }
> = {
  slime: { health: 50, speed: 48, reach: 95, damage: 16, aggro: 175 },
  snake: { health: 65, speed: 65, reach: 66, damage: 20, aggro: 160 },
  bear: { health: 130, speed: 57, reach: 78, damage: 28, aggro: 200 },
  guardian: { health: 175, speed: 38, reach: 100, damage: 24, aggro: 230 },
};
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

/** Renderer-free encounter rules. One session survives village/jungle transitions.
 * Five enemies, bounded effects, and static collision data; no timers or per-tick React state.
 */
export class JungleAdventure {
  readonly enemies: Enemy[];
  readonly gathered = new Set<string>();
  readonly effects: AdventureEffect[] = [];
  health = 100;
  herbs = 1;
  time = 0;
  cast: SpellCast | null = null;
  readonly projectiles: Projectile[] = [];
  spell: SpellId = 'fire';
  experience = 0;
  invincibleUntil = 0;
  private message =
    'Ember learned. Space to cast; E to gather; H to heal. Water unlocks at level 2.';
  private messageUntil = 8;
  private attackReadyAt = 0;
  private sequence = 0;

  constructor(
    readonly content: JungleDefinition,
    private readonly colliders: Rect[],
    private readonly bounds: Rect,
    readonly spawn: Point,
    readonly casting = { durationMs: 700, releaseMs: 400 },
  ) {
    this.enemies = content.enemies.map((entry) => ({
      ...entry,
      home: { x: entry.x, y: entry.y },
      health: STATS[entry.kind].health,
      maxHealth: STATS[entry.kind].health,
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
      nextLevel: this.level === 1 ? 30 : this.level === 2 ? 100 : null,
      spell: this.spell,
      waterUnlocked: this.level >= 2,
      castReady: this.time >= this.attackReadyAt && !this.cast,
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
        if (age >= 0.6) {
          this.phase(enemy, 'attack');
          enemy.hit = false;
        }
        continue;
      }
      if (enemy.phase === 'attack') {
        // The target is locked when the warning begins: walking away really dodges it.
        if (age < 0.33)
          this.move(enemy, enemy.target, enemy.kind === 'slime' ? 250 : 125, dt, false);
        if (
          !enemy.hit &&
          age >=
            (enemy.kind === 'guardian'
              ? 0.36
              : enemy.kind === 'slime'
                ? 0.33
                : enemy.kind === 'bear'
                  ? 0.26
                  : 0.22)
        ) {
          enemy.hit = true;
          if (
            distance(enemy, player) <
              (enemy.kind === 'bear' || enemy.kind === 'guardian' ? 52 : 37) &&
            this.clearLine(enemy, player) &&
            this.time >= this.invincibleUntil &&
            player.y < this.spawn.y - 64
          ) {
            this.health = Math.max(0, this.health - stats.damage);
            this.invincibleUntil = this.time + 1.15;
            this.effect(player, 'hit');
            this.say('Hit! Step out of the warning circle. H uses a healing herb.');
          }
        }
        if (age >= (enemy.kind === 'guardian' ? 0.72 : 0.6)) {
          enemy.readyAt = this.time + 0.85;
          this.phase(enemy, 'idle');
        }
        continue;
      }
      const inTerritory = distance(player, enemy.home) < 235 && player.y < this.spawn.y - 64;
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
    return this.experience >= 100 ? 3 : this.experience >= 30 ? 2 : 1;
  }

  selectSpell(spell: SpellId): void {
    if (this.cast) return;
    if (spell === 'water' && this.level < 2) {
      this.say('Tide unlocks at level 2. Gather flowers and clear the trail to learn it.');
      return;
    }
    this.spell = spell;
  }

  attack(player: Point, direction: RpgDirection): RpgDirection | null {
    if (this.time < this.attackReadyAt || this.cast || this.projectiles.length >= 8) return null;
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
          this.damage(hit, p.spell === 'fire' ? 30 : 24, p.spell);
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

  private damage(enemy: Enemy, amount: number, spell: SpellId, stagger = true): void {
    if (enemy.health === 0) return;
    enemy.health = Math.max(0, enemy.health - amount - (this.level === 3 ? 3 : 0));
    if (enemy.health === 0) {
      this.phase(enemy, 'death');
      this.effect(
        enemy,
        enemy.kind === 'guardian' || enemy.kind === 'snake'
          ? 'poison-death'
          : spell === 'fire'
            ? 'fire-death'
            : 'water-death',
      );
      this.reward(enemy.kind === 'guardian' ? 50 : enemy.kind === 'bear' ? 35 : 20, enemy);
    } else {
      if (stagger) {
        this.phase(enemy, 'hurt');
        enemy.readyAt = this.time + 0.5;
      }
      this.effect(enemy, spell);
    }
  }

  private reward(amount: number, point: Point): void {
    const before = this.level;
    this.experience += amount;
    if (this.level > before) {
      this.effect(point, 'level');
      this.say(
        this.level === 2
          ? 'Level 2 · Tide learned! Press 2 to slow enemies with water.'
          : 'Level 3 · Your spells are stronger. Explore the rest of the forest!',
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
