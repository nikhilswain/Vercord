import { containsPoint, resolveMovement } from '../../world/engine/collision';
import type { Point, Rect } from '../../world/engine/types';
import type { RpgDirection } from '../types';
import type {
  AdventureStatus,
  CreatureKind,
  EncounterSpawn,
  FlowerSpawn,
  JungleDefinition,
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
}
export interface Swing {
  at: number;
  origin: Point;
  direction: RpgDirection;
}
export interface AdventureEffect extends Point {
  at: number;
  kind: 'hit' | 'gather' | 'heal';
}

const STATS: Record<
  CreatureKind,
  { health: number; speed: number; reach: number; damage: number; aggro: number }
> = {
  slime: { health: 50, speed: 48, reach: 95, damage: 16, aggro: 175 },
  snake: { health: 65, speed: 65, reach: 66, damage: 20, aggro: 160 },
  bear: { health: 130, speed: 57, reach: 78, damage: 28, aggro: 200 },
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
  swing: Swing | null = null;
  invincibleUntil = 0;
  private message = 'Follow the trail. Space to swing; E to gather; H to heal.';
  private messageUntil = 8;
  private attackReadyAt = 0;

  constructor(
    readonly content: JungleDefinition,
    private readonly colliders: Rect[],
    private readonly bounds: Rect,
    readonly spawn: Point,
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
    };
  }

  /** Returns true when the player needs to be placed back at the safe camp. */
  tick(dt: number, player: Point): boolean {
    dt = Math.max(0, Math.min(dt, 0.05));
    this.time += dt;
    if (this.swing && this.time - this.swing.at > 0.32) this.swing = null;
    while (this.effects[0] && this.time - this.effects[0].at > 0.85) this.effects.shift();
    for (const enemy of this.enemies) {
      if (enemy.health === 0) continue;
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
          age >= (enemy.kind === 'slime' ? 0.33 : enemy.kind === 'bear' ? 0.26 : 0.22)
        ) {
          enemy.hit = true;
          if (
            distance(enemy, player) < (enemy.kind === 'bear' ? 52 : 37) &&
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
        if (age >= 0.6) {
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
          this.move(enemy, player, stats.speed, dt, true);
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

  attack(player: Point, direction: RpgDirection): RpgDirection | null {
    if (this.time < this.attackReadyAt) return null;
    // Small melee aim assist; distant creatures never pull the traveler or camera.
    const nearest = this.enemies
      .filter((e) => e.health > 0 && distance(e, player) < 90 && this.clearLine(player, e))
      .sort((a, b) => distance(a, player) - distance(b, player))[0];
    if (nearest) direction = facing(player, nearest);
    this.attackReadyAt = this.time + 0.44;
    this.swing = { at: this.time, origin: { ...player }, direction };
    const forward = vectors[direction];
    for (const enemy of this.enemies) {
      const d = distance(enemy, player);
      if (enemy.health <= 0 || d > 82 || !this.clearLine(player, enemy)) continue;
      const dot =
        ((enemy.x - player.x) * forward.x + (enemy.y - player.y) * forward.y) / Math.max(d, 1);
      if (dot < 0.05 && d > 22) continue;
      enemy.health = Math.max(0, enemy.health - 26);
      this.phase(enemy, enemy.health === 0 ? 'death' : 'hurt');
      enemy.readyAt = this.time + 0.8;
      this.effect(enemy, 'hit');
      if (enemy.health === 0)
        this.say(
          `${enemy.kind === 'slime' ? 'Slime' : enemy.kind === 'bear' ? 'Bear' : 'Snake'} defeated. The trail is a little safer.`,
        );
    }
    return direction;
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
    this.swing = null;
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
    this.effects.push({ x: point.x, y: point.y, at: this.time, kind });
  }
  private clearLine(from: Point, to: Point): boolean {
    const steps = Math.max(1, Math.ceil(distance(from, to) / 8));
    for (let step = 0; step <= steps; step++) {
      const x = from.x + ((to.x - from.x) * step) / steps,
        y = from.y + ((to.y - from.y) * step) / steps;
      if (this.colliders.some((rect) => containsPoint(rect, x, y))) return false;
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
