import { MAX_TRAVEL_SPEED } from '../../../domain/adventure/movement';
import {
  SUPPLY_RENEWAL_MS,
  cycleLootSource,
  type SupplyRenewal,
} from '../../../domain/adventure/renewal';
import { completeCampProject } from '../../../domain/adventure/camp-projects';
import { FORAGE_ITEMS } from '../../../domain/adventure/forage';
import { containsPoint, resolveMovement } from '../../world/engine/collision';
import { SpatialIndex } from '../pathfinding';
import type { Point, Rect } from '../../world/engine/types';
import type { RpgDirection } from '../types';
import {
  createInventory,
  sanitizeInventory,
  grantItem,
  takeItem,
  itemCount,
  getItem,
  migrateItemId,
  type InventorySnapshot,
  type UseItemResult,
} from '../../../domain/adventure/inventory';
import { wildlifeDefinition } from '../../../domain/adventure/wildlife';
import {
  creatureLoot,
  legacyCreatureLoot,
  groundLootId,
  LOOT_PICKUP_RADIUS,
  type GroundLoot,
} from '../../../domain/adventure/loot';
import {
  Provisions,
  USE_ITEM_MESSAGES,
  type ProvisionsSnapshot,
} from '../../../domain/adventure/provisions';
import {
  craftItem,
  type CraftAccess,
  type CraftItemResult,
} from '../../../domain/adventure/crafting';
import { containsRect, footprint, overlaps } from '../../../domain/world/geometry';
import {
  ENEMY_DEFINITIONS as STATS,
  spawnEnemyPower,
  enemyBehavior,
  enemyProjectileOrigin,
  type EnemyBehavior,
} from '../../../domain/adventure/enemies';
import {
  crossesPressurePlate,
  pressureTrapState,
  trapState,
} from '../../../domain/adventure/traps';
import {
  attackAim,
  SPELL_DEFINITIONS,
  sanitizeSpellCooldowns,
  spellDamage,
  spellTimeLabel,
  type SpellCooldowns,
} from '../../../domain/adventure/spells';
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
  ScenarioProgress,
  ScenarioSession,
  type StoryInteraction,
  type StoryDialogue,
} from '../../../domain/adventure/scenario';
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
  sideFacing: 'left' | 'right';
  roamAt: number;
  roamTarget: Point;
  provokedUntil: number;
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
  frozenUntil: number;
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
  visual: 'seed' | 'spark';
  velocity: Point;
  distance: number;
  range: number;
  damage: number;
  invulnerabilityMs: number;
}
export const MAX_ENEMY_PROJECTILES = 32;
export interface AdventureTraveler {
  inventory?: InventorySnapshot;
  progression: PlayerProgression;
  provisions?: ProvisionsSnapshot;
  spellCooldowns?: SpellCooldowns;
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
  /** Town keeps timers running, but preparing supplies and consuming them are separate actions. */
  canUseSupplies?: boolean;
  inventory?: InventorySnapshot;
  scenarioProgress?: ScenarioProgress;
  progression?: PlayerProgression;
  equipmentPolicy?: typeof NORMAL_EQUIPMENT_POLICY;
  /** Explicit sandbox override; normal encounters derive their level from the profile. */
  enemyLevelOverride?: number;
  /** Authored safe areas are content, never inferred from the spawn's direction. */
  safeAreas?: readonly Rect[];
}
export interface EncounterSnapshot {
  defeated: string[];
  gathered: string[];
  rewarded: string[];
  loot?: GroundLoot[];
  renewals?: SupplyRenewal[];
  claimedCaches?: string[];
}
export interface AdventureEffect extends Point {
  id: number;
  at: number;
  kind:
    | 'hit'
    | 'hurt'
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
  readonly scenario: ScenarioSession | null;
  readonly collision: Rect[];
  private collisionIndex: SpatialIndex<Rect>;
  private scenarioCollisionRevision = -1;
  readonly enemies: Enemy[];
  readonly gathered = new Set<string>();
  readonly effects: AdventureEffect[] = [];
  readonly enemyProjectiles: EnemyProjectile[] = [];
  health = 100;
  defeated = false;
  playerHurtAt = -Infinity;
  /** Transient completion signal; never persisted or replayed on arrival. */
  lastConsumption: { itemId: string; sequence: number } | null = null;
  provisions = new Provisions();
  private inventory: InventorySnapshot;
  get herbs(): number {
    return itemCount(this.inventory, 'healing-herb');
  }
  set herbs(value: number) {
    const current = this.herbs;
    if (value > current)
      this.inventory = grantItem(this.inventory, 'healing-herb', value - current);
    else if (value < current)
      this.inventory = takeItem(this.inventory, 'healing-herb', current - value) ?? this.inventory;
  }
  time = 0;
  cast: SpellCast | null = null;
  melee: MeleeAttack | null = null;
  storyPresentation: { at: number; durationMs: number; dialogue: StoryDialogue } | null = null;
  readonly projectiles: Projectile[] = [];
  spell: SpellId = 'fire';
  combatMode: CombatMode = 'melee';
  spellCooldowns: SpellCooldowns = { fire: 0, water: 0 };
  private progression: PlayerProgression;
  private readonly rewardedEnemies = new Set<string>();
  private renewals = new Map<string, SupplyRenewal>();
  private renewalCheckAt = 0;
  private claimedCaches = new Set<string>();
  private readonly groundLoot: GroundLoot[] = [];
  /** Increments only when loot/inventory changes, so the runtime can checkpoint atomically. */
  lootRevision = 0;
  get loot(): readonly GroundLoot[] {
    return this.groundLoot;
  }
  invincibleUntil = 0;
  private message =
    'Aim with the cursor, then left click. 1 / 2 choose magic; 3 chooses your weapon. I opens inventory.';
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
    this.inventory = sanitizeInventory(options.inventory ?? createInventory());
    this.scenario = content.scenario
      ? new ScenarioSession(content.scenario, options.scenarioProgress ?? new ScenarioProgress())
      : null;
    this.collision = [...colliders];
    this.collisionIndex = new SpatialIndex(this.collision);
    this.syncScenarioCollision();
    this.progression = sanitizePlayerProgression(
      options.progression ?? createPlayerProgression(),
      options.equipmentPolicy ?? NORMAL_EQUIPMENT_POLICY,
    );
    this.encounterLevelValue = normalizeEncounterLevel(options.enemyLevelOverride ?? this.level);
    this.previousPlayer = { ...spawn };
    this.trapContacts = (content.traps ?? []).map(() => -Infinity);
    this.enemies = content.enemies.map((entry, index) => {
      const power = spawnEnemyPower(entry.kind, this.level, {
        elite: entry.elite,
        levelOffset: entry.levelOffset,
        levelOverride: options.enemyLevelOverride,
      });
      const behavior = enemyBehavior(entry.kind, power.level);
      return {
        sideFacing: 'right',
        roamAt: index * 0.37,
        roamTarget: { x: entry.x, y: entry.y },
        provokedUntil: 0,
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
        frozenUntil: 0,
        burningUntil: 0,
        burnTickAt: 0,
      };
    });
  }

  status(): AdventureStatus {
    const bosses = this.enemies.filter(
      (enemy) => STATS[enemy.kind].boss && this.isEnemyActive(enemy),
    );
    const boss = this.content.simulationRadius
      ? bosses
          .filter(
            (enemy) =>
              enemy.health > 0 && distance(enemy, this.previousPlayer) < enemy.behavior.aggro + 160,
          )
          .sort((a, b) => distance(a, this.previousPlayer) - distance(b, this.previousPlayer))[0]
      : bosses[0];
    return {
      inventory: this.getInventory(),
      equipment: this.getProgression(),
      equipmentPolicy: this.options.equipmentPolicy ?? NORMAL_EQUIPMENT_POLICY,
      canAdjustEncounters: this.options.enemyLevelOverride !== undefined,
      story: this.scenario?.objective(),
      boss: boss
        ? {
            name: boss.name ?? STATS[boss.kind].name,
            health: boss.health,
            maxHealth: boss.maxHealth,
            level: boss.level,
            enraged: boss.health > 0 && boss.health <= boss.maxHealth / 2,
          }
        : undefined,
      health: this.health,
      maxHealth: this.provisions.stats.maxHealth,
      provisions: this.provisions.snapshot(),
      pendingUse: this.provisions.pending ? { ...this.provisions.pending } : null,
      canUseSupplies: this.options.canUseSupplies !== false,
      herbs: this.herbs,
      blossoms: this.content.flowers.filter(
        (f) => f.kind === 'collection' && this.gathered.has(f.id),
      ).length,
      blossomGoal: this.content.flowers.filter((f) => f.kind === 'collection').length,
      defeated: this.enemies.filter((e) => !wildlifeDefinition(e.kind) && e.health === 0).length,
      enemyGoal: this.enemies.filter((e) => !wildlifeDefinition(e.kind)).length,
      message: this.time < this.messageUntil ? this.message : '',
      level: this.level,
      experience: this.experience,
      nextLevel: this.level < MAX_CHARACTER_LEVEL ? experienceForLevel(this.level + 1) : null,
      spell: this.spell,
      waterUnlocked: this.level >= SPELL_DEFINITIONS.water.unlockLevel,
      spellCooldowns: { ...this.spellCooldowns },
      castReady:
        !this.defeated &&
        this.health > 0 &&
        this.time >= this.attackReadyAt &&
        !this.cast &&
        !this.melee &&
        !this.storyPresentation &&
        (this.combatMode === 'melee' ||
          (this.level >= SPELL_DEFINITIONS[this.spell].unlockLevel &&
            this.spellCooldowns[this.spell] <= 0)),
      combatMode: this.combatMode,
      weaponId: this.progression.equippedWeaponId,
      enemyLevel: this.encounterLevel,
      encounterHealth: Math.max(0, ...this.enemies.map((e) => e.maxHealth)),
      encounterDamage: Math.max(0, ...this.enemies.map((e) => e.damage)),
    };
  }

  /** Returns true once, when this visit ends in defeat. Town recovery belongs to travel. */
  tick(dt: number, player: Point): boolean {
    if (this.defeated) return false;
    if (this.health <= 0) return this.finishDefeat();
    this.tickSupplies(dt, player);
    dt = Math.max(0, Math.min(dt, 0.05));
    const velocityX =
      dt > 0
        ? Math.max(
            -MAX_TRAVEL_SPEED,
            Math.min(MAX_TRAVEL_SPEED, (player.x - this.previousPlayer.x) / dt),
          )
        : 0;
    const velocityY =
      dt > 0
        ? Math.max(
            -MAX_TRAVEL_SPEED,
            Math.min(MAX_TRAVEL_SPEED, (player.y - this.previousPlayer.y) / dt),
          )
        : 0;
    this.time += dt;
    this.scenario?.tick(dt, this.enemies);
    this.syncScenarioCollision();
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
    for (const hazard of this.scenario?.definition.hazards ?? []) {
      if (
        this.scenario!.matches(hazard) &&
        distance(hazard, player) < hazard.radius &&
        this.time >= this.invincibleUntil
      ) {
        this.provisions.combat();
        this.health = Math.max(
          0,
          this.health - Math.round(hazard.damage * (1 + (this.encounterLevel - 1) * 0.05)),
        );
        this.invincibleUntil = this.time + 1;
        this.playerHurtAt = this.time;
        this.effect(player, 'hurt');
        this.say('Spinning blades! Stay outside their reach; a clear path runs around them.');
      }
    }
    for (const [index, trap] of (this.content.traps ?? []).entries()) {
      const contact = crossesPressurePlate(this.previousPlayer, player, trap);
      if (trap.activation !== 'timed' && contact) this.trapContacts[index] = this.time;
      const state = this.getTrapState(index);
      if (state.active && contact && this.time >= this.invincibleUntil) {
        this.provisions.combat();
        this.health = Math.max(0, this.health - state.damage);
        this.invincibleUntil = this.time + 1.15;
        this.playerHurtAt = this.time;
        this.effect(player, 'hurt');
        this.say('Spike plate! Stay off the plates; they trigger when you step on them.');
      }
    }
    this.previousPlayer.x = player.x;
    this.previousPlayer.y = player.y;
    while (this.effects[0] && this.time - this.effects[0].at > 0.85) this.effects.shift();
    for (const enemy of this.enemies) {
      if (enemy.health === 0 || !this.isEnemyActive(enemy)) continue;
      // Freeze the committed attack and animation as well as locomotion. Resume its
      // remaining windup afterwards so thawing cannot cause an invisible instant hit.
      const frozen = Math.max(
        0,
        Math.min(this.time, enemy.frozenUntil) -
          Math.max(this.time - dt, enemy.frozenUntil - SPELL_DEFINITIONS.water.freeze),
      );
      if (frozen > 0 || this.time < enemy.frozenUntil) {
        enemy.phaseAt += frozen;
        enemy.readyAt += frozen;
        enemy.roamAt += frozen;
        continue;
      }
      // Scale untouched encounters outside combat, including those asleep across the map.
      // Never heal an injured creature or change an attack already facing the player.
      if (distance(enemy, player) > enemy.behavior.aggro + 100) this.refreshEnemyLevel(enemy);
      if (this.content.simulationRadius && distance(enemy, player) > this.content.simulationRadius)
        continue;
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
            this.provisions.combat();
            this.health = Math.max(0, this.health - enemy.damage);
            this.invincibleUntil = this.time + stats.playerInvulnerabilityMs / 1000;
            this.playerHurtAt = this.time;
            this.effect(player, 'hurt');
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
      if (this.tickWildlife(enemy, player, dt)) continue;
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
      } else if (enemy.patrolRadius && distance(enemy, enemy.home) < enemy.patrolRadius + 8) {
        enemy.comboRemaining = 0;
        if (this.time >= enemy.roamAt) {
          const angle = enemy.home.x * 0.13 + enemy.home.y * 0.17 + enemy.roamAt * 1.7;
          enemy.roamTarget = {
            x: enemy.home.x + Math.cos(angle) * enemy.patrolRadius,
            y: enemy.home.y + Math.sin(angle) * enemy.patrolRadius * 0.5,
          };
          enemy.roamAt = this.time + 5 + Math.abs(Math.sin(angle)) * 3;
        }
        if (enemy.roamAt - this.time > 3 && distance(enemy, enemy.roamTarget) > 5) {
          this.phase(enemy, 'walk');
          this.move(enemy, enemy.roamTarget, stats.speed * 0.45, dt, true);
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
    return this.finishDefeat();
  }

  private finishDefeat(): boolean {
    if (this.defeated) return false;
    this.health = 0;
    this.defeated = true;
    this.suspend();
    this.provisions.defeat();
    this.say('You fell. Returning to town.', 7);
    return true;
  }

  get level(): number {
    return levelForExperience(this.experience);
  }

  isEnemyActive(enemy: EncounterSpawn): boolean {
    return this.scenario ? this.scenario.matches(enemy) : !enemy.requires?.length;
  }
  nearbyStory(player: Point): StoryInteraction | null {
    return this.scenario?.nearby(player, (target) => this.clearLine(player, target)) ?? null;
  }
  interactStory(player: Point): StoryDialogue | null {
    const interaction = this.nearbyStory(player);
    if (!interaction || !this.scenario || this.cast || this.melee || this.storyPresentation)
      return null;
    const present =
      interaction.presentation &&
      this.scenario.matches(interaction) &&
      interaction.grant?.some((flag) => !this.scenario!.progress.has(flag));
    const result = this.scenario.interact(interaction);
    this.herbs += result.herbs;
    for (const item of result.items ?? [])
      this.inventory = grantItem(this.inventory, item.id, item.quantity);
    for (const item of result.removeItems ?? [])
      this.inventory = takeItem(this.inventory, item.id, item.quantity) ?? this.inventory;
    this.syncScenarioCollision();
    if (present) {
      this.storyPresentation = {
        at: this.time,
        durationMs: interaction.presentation!.durationMs,
        dialogue: result.dialogue,
      };
      return null;
    }
    return result.dialogue;
  }
  takeStoryDialogue(): StoryDialogue | null {
    const presentation = this.storyPresentation;
    if (!presentation || (this.time - presentation.at) * 1000 < presentation.durationMs)
      return null;
    this.storyPresentation = null;
    return presentation.dialogue;
  }
  private syncScenarioCollision(): void {
    if (!this.scenario || this.scenarioCollisionRevision === this.scenario.collisionRevision)
      return;
    this.scenarioCollisionRevision = this.scenario.collisionRevision;
    this.collision.splice(0, this.collision.length, ...this.colliders, ...this.scenario.colliders);
    this.collisionIndex = new SpatialIndex(this.collision);
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
      inventory: this.getInventory(),
      progression: this.getProgression(),
      health: this.health,
      provisions: this.provisions.snapshot(),
      spellCooldowns: { ...this.spellCooldowns },
      herbs: this.herbs,
      spell: this.spell,
      combatMode: this.combatMode,
    };
  }

  encounterSnapshot(): EncounterSnapshot {
    return {
      defeated: this.enemies.filter((e) => e.health === 0).map((e) => e.id),
      gathered: [...this.gathered],
      rewarded: [...this.rewardedEnemies],
      loot: this.groundLoot.map((drop) => ({ ...drop })),
      renewals: [...this.renewals.values()].map((entry) => ({ ...entry })),
      claimedCaches: [...this.claimedCaches],
    };
  }

  restoreEncounters(saved: EncounterSnapshot): void {
    this.claimedCaches = new Set(saved.claimedCaches ?? saved.defeated);
    const possible = new Set([
      ...this.enemies.map((e) => e.id),
      ...this.content.flowers.map((f) => f.id),
    ]);
    for (const entry of saved.renewals ?? [])
      if (possible.has(entry.id)) this.renewals.set(entry.id, { ...entry });
    const defeated = new Set(saved.defeated),
      rewarded = new Set(saved.rewarded);
    for (const enemy of this.enemies) {
      if (defeated.has(enemy.id)) {
        enemy.health = 0;
        enemy.phase = 'death';
        enemy.phaseAt = -10;
        if (!this.renewals.has(enemy.id)) this.scheduleRenewal(enemy.id, 'enemy');
      }
      if (rewarded.has(enemy.id) || defeated.has(enemy.id)) this.rewardedEnemies.add(enemy.id);
    }
    const gathered = new Set(saved.gathered);
    for (const flower of this.content.flowers)
      if (gathered.has(flower.id)) {
        this.gathered.add(flower.id);
        if (!this.renewals.has(flower.id)) this.scheduleRenewal(flower.id, 'forage');
      }
    // Old saves already awarded animal supplies; never manufacture drops from old kills.
    this.groundLoot.length = 0;
    const seen = new Set<string>();
    const enemies = new Map(this.enemies.map((enemy) => [enemy.id, enemy]));
    for (const drop of saved.loot ?? []) {
      const enemy = enemies.get(drop.sourceId);
      if (!enemy || !this.rewardedEnemies.has(enemy.id) || seen.has(drop.id)) continue;
      const cycle = this.renewals.get(enemy.id)?.cycle ?? 0;
      const policy = cycle ? creatureLoot(enemy.kind) : [...creatureLoot(enemy.kind)];
      const current = policy.find(
        (part, index) =>
          part.id === drop.itemId &&
          groundLootId(cycleLootSource(enemy.id, cycle), index) === drop.id,
      );
      const legacy = !cycle
        ? legacyCreatureLoot(enemy.kind).find(
            (part, index) => part.id === drop.itemId && groundLootId(enemy.id, index) === drop.id,
          )
        : undefined;
      const expected = current ?? legacy;
      if (
        !expected ||
        !Number.isSafeInteger(drop.quantity) ||
        drop.quantity < 1 ||
        drop.quantity > expected.quantity ||
        !Number.isFinite(drop.x) ||
        !Number.isFinite(drop.y)
      )
        continue;
      const point = this.lootPosition(drop, 0);
      if (!point) continue;
      seen.add(drop.id);
      this.groundLoot.push({
        ...drop,
        itemId: migrateItemId(drop.itemId) as GroundLoot['itemId'],
        ...point,
      });
    }
  }

  /** Arrival cannot sweep a trap from the previous map or carry a half-finished attack. */
  arrive(traveler: AdventureTraveler | undefined, position: Point): void {
    this.defeated = false;
    this.playerHurtAt = -Infinity;
    this.lastConsumption = null;
    if (traveler) {
      this.progression = sanitizePlayerProgression(
        traveler.progression,
        this.options.equipmentPolicy,
      );
      this.provisions = new Provisions(traveler.provisions);
      this.spellCooldowns = sanitizeSpellCooldowns(traveler.spellCooldowns);
      this.health = Math.min(traveler.health, this.provisions.stats.maxHealth);
      this.inventory = traveler.inventory
        ? sanitizeInventory(traveler.inventory)
        : sanitizeInventory({ version: 1, stacks: [] });
      if (!traveler.inventory) this.herbs = traveler.herbs;
      this.spell = traveler.spell;
      this.combatMode = traveler.combatMode;
      if (
        this.combatMode !== 'melee' &&
        this.level < SPELL_DEFINITIONS[this.combatMode].unlockLevel
      )
        this.combatMode = 'melee';
    }
    this.suspend();
    for (const enemy of this.enemies) this.refreshEnemyLevel(enemy);
    Object.assign(this.previousPlayer, position);
    this.invincibleUntil = this.time + 0.8;
  }

  private refreshEnemyLevel(enemy: Enemy): void {
    if (
      this.options.enemyLevelOverride !== undefined ||
      enemy.levelOffset === undefined ||
      enemy.health !== enemy.maxHealth ||
      enemy.health <= 0 ||
      (enemy.phase !== 'idle' && enemy.phase !== 'walk')
    )
      return;
    if (normalizeEncounterLevel(this.level + enemy.levelOffset) <= enemy.level) return;
    const power = spawnEnemyPower(enemy.kind, this.level, { levelOffset: enemy.levelOffset });
    Object.assign(enemy, power, {
      maxHealth: power.health,
      behavior: enemyBehavior(enemy.kind, power.level),
    });
  }

  suspend(): void {
    this.provisions.cancel();
    this.storyPresentation = null;
    this.cast = null;
    this.melee = null;
    this.projectiles.length = 0;
    this.enemyProjectiles.length = 0;
    this.effects.length = 0;
    this.trapContacts.fill(-Infinity);
    for (const enemy of this.enemies) {
      enemy.comboRemaining = 0;
      enemy.provokedUntil = 0;
      enemy.burningUntil = 0;
      enemy.slowedUntil = 0;
      enemy.frozenUntil = 0;
      if (enemy.health > 0) {
        this.phase(enemy, 'idle');
        enemy.readyAt = this.time + 0.8;
      }
    }
  }

  equip(id: string): boolean {
    if (this.storyPresentation) return false;
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
    if (!this.cast && !this.melee && !this.storyPresentation) this.combatMode = 'melee';
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
        provokedUntil: 0,
        roamAt: this.time + 1,
        roamTarget: { ...enemy.home },
      });
    }
    this.say(`Level ${this.enemies[0]?.level ?? 1} encounters reset. Flowers and XP kept.`, 6);
    return true;
  }

  selectSpell(spell: SpellId): void {
    if (this.cast || this.melee || this.storyPresentation) return;
    if (this.level < SPELL_DEFINITIONS[spell].unlockLevel) {
      this.say(
        `${SPELL_DEFINITIONS[spell].name} unlocks at level ${SPELL_DEFINITIONS[spell].unlockLevel}.`,
      );
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
    if (
      this.defeated ||
      this.health <= 0 ||
      this.time < this.attackReadyAt ||
      this.cast ||
      this.melee ||
      this.storyPresentation
    )
      return null;
    const aim = attackAim(player, vectors[direction], target);
    direction = facing({ x: 0, y: 0 }, aim);
    if (this.combatMode === 'melee') {
      this.provisions.combat();
      const weapon = getWeaponDefinition(this.progression.equippedWeaponId)!;
      this.melee = { at: this.time, origin: { ...player }, direction, weapon, hit: false };
      this.attackReadyAt = this.time + weapon.cooldownMs / 1000;
      return direction;
    }
    if (this.projectiles.length >= 8) return null;
    const ability = SPELL_DEFINITIONS[this.spell];
    if (this.level < ability.unlockLevel) {
      this.say(`${ability.name} unlocks at level ${ability.unlockLevel}.`);
      return null;
    }
    if (this.spellCooldowns[this.spell] > 0) {
      this.say(
        `${ability.name} ready in ${spellTimeLabel(this.spellCooldowns[this.spell])}. Press 3 for your weapon.`,
      );
      return null;
    }
    this.provisions.combat();
    this.spellCooldowns[this.spell] = ability.cooldown;
    this.cast = {
      damage: spellDamage(
        this.level,
        getWeaponDefinition(this.progression.equippedWeaponId)!.spellBonus,
      ),
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
    const origin = enemyProjectileOrigin(enemy.kind, enemy, enemy.target);
    if (!this.clearLine(enemy, origin)) return;
    const angle = Math.atan2(enemy.target.y - origin.y, enemy.target.x - origin.x);
    const speed = shot.speed * (1 + Math.max(0, enemy.level - 5) * 0.035);
    for (let i = 0; i < count && this.enemyProjectiles.length < MAX_ENEMY_PROJECTILES; i++) {
      const a = angle + (i - (count - 1) / 2) * shot.spread;
      this.enemyProjectiles.push({
        id: ++this.sequence,
        owner: enemy.id,
        visual: shot.visual ?? 'seed',
        ...origin,
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
            this.provisions.combat();
            this.health = Math.max(0, this.health - p.damage);
            this.invincibleUntil = this.time + p.invulnerabilityMs / 1000;
            this.playerHurtAt = this.time;
            this.effect(player, 'hurt');
            this.say(
              p.visual === 'spark'
                ? 'Spark hit! Sidestep the shot; H uses a healing herb.'
                : 'Spore hit! Move across the volley; H uses a healing herb.',
            );
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
            this.isEnemyActive(e) &&
            distance(e, p) <
              (STATS[e.kind].boss ? 36 : e.kind === 'bear' || e.kind === 'guardian' ? 27 : 19) &&
            this.clearLine(p, e),
        );
        if (hit) {
          this.damage(hit, p.damage, p.spell);
          if (hit.health > 0) {
            if (p.spell === 'water') {
              hit.burningUntil = 0;
              hit.frozenUntil = this.time + SPELL_DEFINITIONS.water.freeze;
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
          this.isEnemyActive(enemy) &&
          d <= swing.weapon.reach &&
          ahead > 0 &&
          (thrust ? side <= 22 : ahead / Math.max(1, d) > 0.2) &&
          this.clearLine(swing.origin, enemy)
        ) {
          this.damage(enemy, swing.weapon.damage, 'melee');
          if (
            enemy.health > 0 &&
            this.isEnemyActive(enemy) &&
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
    if (enemy.health === 0 || !this.isEnemyActive(enemy)) return;
    enemy.health = Math.max(0, enemy.health - Math.round(amount * this.provisions.stats.damage));
    enemy.provokedUntil = this.time + 12;
    if (enemy.health === 0) {
      this.phase(enemy, 'death');
      for (let i = this.enemyProjectiles.length - 1; i >= 0; i--)
        if (this.enemyProjectiles[i]!.owner === enemy.id) this.enemyProjectiles.splice(i, 1);
      this.effect(
        enemy,
        wildlifeDefinition(enemy.kind)
          ? 'hit'
          : enemy.kind === 'guardian' || enemy.kind === 'snake'
            ? 'poison-death'
            : spell === 'fire'
              ? 'fire-death'
              : spell === 'water'
                ? 'water-death'
                : 'hit',
      );
      if (!this.rewardedEnemies.has(enemy.id)) {
        this.rewardedEnemies.add(enemy.id);
        this.scheduleRenewal(enemy.id, 'enemy');
        this.reward(STATS[enemy.kind].xp, enemy);
        creatureLoot(enemy.kind).forEach((drop, index) => {
          const point =
            this.lootPosition(enemy, index + 1) ??
            this.lootPosition(enemy.home, index + 1) ??
            this.spawn;
          this.groundLoot.push({
            id: groundLootId(
              cycleLootSource(enemy.id, this.renewals.get(enemy.id)?.cycle ?? 0),
              index,
            ),
            sourceId: enemy.id,
            itemId: drop.id,
            quantity: drop.quantity,
            ...point,
          });
        });
        this.lootRevision++;
      }
      if (STATS[enemy.kind].boss)
        this.say(
          enemy.id === 'temple-root-beast'
            ? 'The courtyard guardian falls. The northern sanctuary seal is broken.'
            : enemy.id === 'choir-bound-warden'
              ? 'The Bound Warden falls. Use the central altar to free the keeper.'
              : 'Guardian defeated. Your reward and discoveries are safe.',
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
        Object.values(SPELL_DEFINITIONS)
          .filter((s) => before < s.unlockLevel && this.level >= s.unlockLevel)
          .map((s) => `${s.name} learned! Press ${s.key}.`)
          .join(' ') || `Level ${this.level} · New weapon tiers await!`,
        7,
      );
    }
  }

  /** Place at walkable feet, never inside a tree, pond or wall. Offsets separate stacks. */
  private lootPosition(origin: Point, index: number): Point | undefined {
    const candidates: Point[] = index === 0 ? [{ ...origin }] : [];
    for (const radius of [18, 30, 46]) {
      for (let step = 0; step < 8; step++) {
        const angle = ((step + index * 3) * Math.PI) / 4;
        candidates.push({
          x: Math.round(origin.x + Math.cos(angle) * radius),
          y: Math.round(origin.y + Math.sin(angle) * radius),
        });
      }
    }
    candidates.push({ ...origin });
    return candidates.find((point) => {
      const box = footprint(point);
      return (
        containsRect(this.bounds, box) &&
        !this.collisionIndex.query(box).some((rect) => overlaps(box, rect)) &&
        !this.content.water.some((rect) => overlaps(box, rect)) &&
        this.clearLine(origin, point)
      );
    });
  }

  nearbyLoot(player: Point): GroundLoot | undefined {
    if (this.health <= 0) return;
    let nearest: GroundLoot | undefined;
    let range = LOOT_PICKUP_RADIUS;
    for (const drop of this.groundLoot) {
      const gap = distance(player, drop);
      if (gap <= range && this.clearLine(player, drop)) {
        nearest = drop;
        range = gap;
      }
    }
    return nearest;
  }

  pickupLoot(player: Point): boolean {
    const drop = this.nearbyLoot(player);
    if (!drop) return false;
    const item = getItem(drop.itemId)!;
    const quantity = Math.min(
      drop.quantity,
      item.maxStack - itemCount(this.inventory, drop.itemId),
    );
    if (quantity <= 0) {
      this.say(`${item.name} stack is full. The drop stays here.`);
      return false;
    }
    this.inventory = grantItem(this.inventory, drop.itemId, quantity);
    drop.quantity -= quantity;
    if (drop.quantity === 0) this.groundLoot.splice(this.groundLoot.indexOf(drop), 1);
    this.lootRevision++;
    this.effect(drop, 'gather');
    this.say(`+${quantity} ${item.name} · Inventory [I]`);
    return true;
  }

  nearbyFlower(player: Point): FlowerSpawn | undefined {
    return this.content.flowers.find(
      (flower) =>
        !this.gathered.has(flower.id) &&
        (!flower.project || this.provisions.state.projects.includes(flower.project)) &&
        distance(player, flower) < 48 &&
        this.clearLine(player, flower),
    );
  }

  gather(player: Point): boolean {
    const flower = this.nearbyFlower(player);
    if (!flower) return false;
    const id = FORAGE_ITEMS[flower.kind];
    if (itemCount(this.inventory, id) >= getItem(id)!.maxStack) {
      this.say('That stack is full.');
      return false;
    }
    this.gathered.add(flower.id);
    this.scheduleRenewal(flower.id, 'forage');
    this.inventory = grantItem(this.inventory, id, 1);
    this.lootRevision++;
    this.effect(flower, 'gather');
    this.say(`Gathered ${getItem(id)!.name}. ${getItem(id)!.description}`);
    this.reward(flower.kind === 'collection' ? 15 : 10, player);
    return true;
  }

  heal(player: Point): void {
    this.useInventoryItem(this.provisions.state.recovery, player);
  }

  getInventory(): InventorySnapshot {
    return structuredClone(this.inventory);
  }

  /** Only nearby living road guards obstruct travel. Corpses/wildlife never seal a route. */
  roadBlockers(player: Point): Rect[] {
    return this.enemies
      .filter(
        (e) =>
          e.encounter === 'road' &&
          e.health > 0 &&
          this.isEnemyActive(e) &&
          distance(e, player) < 140,
      )
      .map((e) => ({ x: e.x - 19, y: e.y - 11, width: 38, height: 22 }));
  }

  tickSupplies(dt: number, player: Point): void {
    const elapsed = Math.max(0, Math.min(1, dt));
    for (const spell of ['fire', 'water'] as const)
      this.spellCooldowns[spell] = Math.max(0, this.spellCooldowns[spell] - elapsed);
    if (this.defeated || this.health <= 0) return;
    const result = this.provisions.tick(dt, player, this.inventory, this.health);
    this.inventory = result.inventory;
    this.health = result.health;
    if (result.used) {
      this.inventory = sanitizeInventory(this.inventory); // claim conversion overflow as room opens
      this.lastConsumption = { itemId: result.used, sequence: ++this.sequence };
      this.say(`Used ${getItem(result.used)!.name}.`);
      this.lootRevision++;
    } else if (result.canceled) this.say('Interrupted. Your supply was kept.');
  }

  useInventoryItem(id: string, player: Point): UseItemResult {
    if (this.options.canUseSupplies === false) {
      this.say(USE_ITEM_MESSAGES['adventure-only']);
      return { success: false, reason: 'adventure-only' };
    }
    if (this.defeated || this.health <= 0 || this.cast || this.melee)
      return { success: false, reason: 'busy' };
    const result = this.provisions.begin(id, this.inventory, this.health, player);
    this.say(
      result.success
        ? `${getItem(id)!.benefit === 'meal' || getItem(id)!.plainFood ? 'Eating' : 'Using'} ${getItem(id)!.name}… Stay still.`
        : USE_ITEM_MESSAGES[result.reason],
    );
    return result;
  }

  craftInventoryItem(id: string, access?: CraftAccess, requestId?: string): CraftItemResult {
    if (requestId && this.provisions.state.actions.includes(requestId))
      return { success: false, reason: 'duplicate' };
    const result = craftItem(this.inventory, id, access);
    if (result.success) {
      this.inventory = sanitizeInventory(result.inventory);
      if (requestId) {
        this.provisions.state.actions.push(requestId);
        if (this.provisions.state.actions.length > 128) this.provisions.state.actions.shift();
      }
      if (!this.provisions.state.crafted.includes(id)) this.provisions.state.crafted.push(id);
      this.say(`Made ${getItem(id)!.name}. Ready in your inventory.`);
      this.lootRevision++;
    }
    return result;
  }

  private scheduleRenewal(id: string, kind: 'enemy' | 'forage'): void {
    if (!this.content.simulationRadius) return; // authored temple/story encounters never renew
    const enemy = kind === 'enemy' ? this.enemies.find((e) => e.id === id) : undefined;
    if (enemy?.name) return;
    this.renewals.set(id, {
      id,
      kind,
      readyAt: Date.now() + SUPPLY_RENEWAL_MS,
      cycle: this.renewals.get(id)?.cycle ?? 0,
    });
  }
  renewSupplies(now: number, occupied: readonly Point[], view?: Rect): void {
    if (now < this.renewalCheckAt || this.provisions.state.combatRemaining > 0) return;
    this.renewalCheckAt = now + 1000;
    for (const entry of this.renewals.values()) {
      if (!entry.readyAt || entry.readyAt > now) continue;
      const enemy =
        entry.kind === 'enemy' ? this.enemies.find((e) => e.id === entry.id) : undefined;
      const flower =
        entry.kind === 'forage' ? this.content.flowers.find((f) => f.id === entry.id) : undefined;
      const p = enemy?.home ?? flower;
      if (
        !p ||
        occupied.some((other) => distance(p, other) < 1200) ||
        (view &&
          containsPoint(
            {
              x: view.x - 160,
              y: view.y - 160,
              width: view.width + 320,
              height: view.height + 320,
            },
            p.x,
            p.y,
          )) ||
        this.groundLoot.some((drop) => drop.sourceId === entry.id) ||
        (enemy && this.guardianCaches().some((c) => c.id === enemy.id))
      )
        continue;
      if (enemy) {
        // Keep the balanced territory; move within its existing small patrol space.
        const shift = {
          x: enemy.home.x + Math.sin(entry.cycle * 2.3 + enemy.home.x) * 18,
          y: enemy.home.y + Math.cos(entry.cycle * 2.1 + enemy.home.y) * 18,
        };
        const p = this.lootPosition(shift, 0) ?? enemy.home;
        Object.assign(enemy, {
          x: p.x,
          y: p.y,
          health: enemy.maxHealth,
          phase: 'idle',
          phaseAt: this.time,
          readyAt: this.time + 2,
          burningUntil: 0,
          slowedUntil: 0,
          frozenUntil: 0,
          comboRemaining: 0,
        });
        this.rewardedEnemies.delete(enemy.id);
        this.claimedCaches.delete(enemy.id);
      } else if (flower) this.gathered.delete(flower.id);
      entry.cycle++;
      entry.readyAt = 0;
      this.lootRevision++;
    }
  }

  guardianCaches(): Array<Point & { id: string }> {
    if (!this.content.simulationRadius) return [];
    return this.enemies
      .filter(
        (e) =>
          !e.name &&
          (e.kind === 'guardian' || e.kind === 'root-beast') &&
          e.health === 0 &&
          !this.claimedCaches.has(e.id),
      )
      .map((e) => ({ ...(this.lootPosition(e.home, 0) ?? e.home), id: e.id }));
  }
  nearbyCache(player: Point): (Point & { id: string }) | undefined {
    return this.guardianCaches().find((c) => distance(c, player) < 64 && this.clearLine(c, player));
  }
  takeCache(id: string, itemId: string, player: Point): string | null {
    const cache = this.nearbyCache(player);
    if (
      cache?.id !== id ||
      !['healing-bottle', 'battle-bottle', 'swiftstep-bottle'].includes(itemId) ||
      (itemId !== 'healing-bottle' && !this.provisions.state.learned.includes(itemId))
    )
      return 'That preparation is unavailable.';
    if (itemCount(this.inventory, itemId) >= 9999)
      return 'That stack is full. The preparation remains in the cache.';
    this.inventory = grantItem(this.inventory, itemId, 1);
    this.claimedCaches.add(id);
    this.lootRevision++;
    this.say(`Collected ${getItem(itemId)!.name}.`);
    return null;
  }

  completeProject(region: string): string {
    const result = completeCampProject(this.inventory, this.provisions.state, region);
    if (!result) return 'Bring the requested ingredients. No supplies were spent.';
    this.inventory = result.inventory;
    this.provisions.state = result.state;
    this.lootRevision++;
    return result.message;
  }
  starterSupplies(): string {
    if (this.provisions.state.projects.includes('town-supplies'))
      return 'You already collected the welcome supplies.';
    for (const id of ['slime-resin', 'healing-herb', 'forest-mushroom']) {
      if (itemCount(this.inventory, id) >= 9999)
        return 'Make room in your bag before collecting the supplies.';
    }
    for (const id of ['slime-resin', 'healing-herb', 'forest-mushroom'])
      this.inventory = grantItem(this.inventory, id, 1);
    this.provisions.state.projects.push('town-supplies');
    this.lootRevision++;
    return 'Welcome supplies collected: resin, a healing herb and a mushroom.';
  }

  /** Wildlife shares damage/collision rules, but never attacks merely on contact. */
  private tickWildlife(enemy: Enemy, player: Point, dt: number): boolean {
    const wildlife = wildlifeDefinition(enemy.kind);
    if (!wildlife) return false;
    const close = this.clearLine(enemy, player);
    if (
      wildlife.temperament === 'defensive' &&
      this.time < enemy.provokedUntil &&
      close &&
      !this.isSafe(player) &&
      distance(player, enemy.home) < enemy.behavior.leash
    )
      return false;
    if (
      wildlife.temperament === 'timid' &&
      close &&
      distance(enemy, player) < wildlife.fleeRadius
    ) {
      const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      this.phase(enemy, 'walk');
      // Try alternate escape headings when trees or water block the direct route.
      for (const turn of [0, 0.8, -0.8, 1.5, -1.5]) {
        const before = { x: enemy.x, y: enemy.y };
        this.move(
          enemy,
          { x: enemy.x + Math.cos(angle + turn) * 90, y: enemy.y + Math.sin(angle + turn) * 90 },
          enemy.behavior.speed * (this.time < enemy.slowedUntil ? 0.45 : 1),
          dt,
          false,
        );
        if (distance(before, enemy) > 0.1) break;
      }
      enemy.roamAt = this.time + 2;
      return true;
    }
    if (this.time >= enemy.roamAt) {
      const seed = [...enemy.id].reduce((value, character) => value + character.charCodeAt(0), 0);
      const angle = seed * 2.4 + Math.floor(this.time / 4) * 1.7;
      enemy.roamTarget = {
        x: enemy.home.x + Math.cos(angle) * wildlife.roamRadius,
        y: enemy.home.y + Math.sin(angle) * wildlife.roamRadius * 0.65,
      };
      enemy.roamAt = this.time + 4;
    }
    if (enemy.roamAt - this.time < 2 || distance(enemy, enemy.roamTarget) < 22)
      this.phase(enemy, 'idle');
    else {
      this.phase(enemy, 'walk');
      this.move(enemy, enemy.roamTarget, enemy.behavior.speed * 0.35, dt, false);
    }
    return true;
  }

  rest(): void {
    this.defeated = false;
    this.lastConsumption = null;
    this.playerHurtAt = -Infinity;
    this.suspend();
    this.previousPlayer.x = this.spawn.x;
    this.previousPlayer.y = this.spawn.y;
    this.trapContacts.fill(-Infinity);
    this.health = this.provisions.stats.maxHealth;
    this.cast = null;
    this.melee = null;
    this.projectiles.length = 0;
    this.effects.length = 0;
    for (const enemy of this.enemies) {
      enemy.comboRemaining = 0;
      enemy.staggerReadyAt = 0;
      enemy.burningUntil = 0;
      enemy.slowedUntil = 0;
      enemy.frozenUntil = 0;
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
    for (const rect of this.collisionIndex.query({
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(dx),
      height: Math.abs(dy),
    })) {
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
      this.collisionIndex.query({
        x: enemy.x - size - step,
        y: enemy.y - 8 - step,
        width: size * 2 + step * 2,
        height: 12 + step * 2,
      }),
      this.bounds,
    );
    enemy.x = next.x + size;
    enemy.y = next.y + 8;
    if (Math.abs(dx) > 0.01) enemy.sideFacing = dx < 0 ? 'left' : 'right';
  }
  private advanceLunge(enemy: Enemy, fromMs: number, toMs: number): void {
    const until = enemy.behavior.lungeMs;
    const dt = Math.max(0, Math.min(until, toMs) - Math.min(until, fromMs)) / 1000;
    if (dt > 0) this.move(enemy, enemy.target, enemy.behavior.lungeSpeed, dt, false);
  }
}
