import assert from 'node:assert/strict';
import {
  enemyBehavior,
  ENEMY_DEFINITIONS,
  type CreatureKind,
} from '../src/domain/adventure/enemies';
import { trapState } from '../src/domain/adventure/traps';
import { AdventureSession } from '../src/features/rpg/adventure/session';
import { DEMO_EQUIPMENT_POLICY } from '../src/domain/adventure/equipment';
import { FOREST_ENEMY_ASSETS } from '../src/features/rpg/demo/enemy-assets';
import { attackAnimationTime } from '../src/features/rpg/adventure/animation-clock';
import { FOREST_CAST_HAND_OFFSETS } from '../src/features/rpg/adventure/forest-casting';
import { SPELL_VISUAL_HEIGHT } from '../src/features/rpg/adventure/aim';
import { wildlifeDefinition } from '../src/domain/adventure/wildlife';

const bounds = { x: 0, y: 0, width: 2000, height: 2000 };
const player = { x: 800, y: 800 };
const make = (kind: CreatureKind, level: number, gap = 50, walls: (typeof bounds)[] = []) =>
  new AdventureSession(
    { enemies: [{ id: 'enemy', kind, x: player.x, y: player.y + gap }], flowers: [], water: [] },
    walls,
    bounds,
    { x: 100, y: 100 },
    undefined,
    { enemyLevelOverride: level, equipmentPolicy: DEMO_EQUIPMENT_POLICY },
  );
function step(model: AdventureSession, ms: number, point = player) {
  for (let i = 0; i < ms; i += 5) model.tick(0.005, point);
}
for (const kind of Object.keys(ENEMY_DEFINITIONS) as CreatureKind[]) {
  // Neutral wildlife only retaliates when provoked; its behavior is verified separately.
  if (wildlifeDefinition(kind)) continue;
  const easy = enemyBehavior(kind, 1),
    training = enemyBehavior(kind, 5),
    hard = enemyBehavior(kind, 20);
  assert.equal(easy.comboSize, 1);
  assert.equal(training.comboSize, 1);
  assert(hard.speed > easy.speed * 1.5);
  assert(hard.windupMs < easy.windupMs * 0.6);
  assert(hard.recoveryMs < easy.recoveryMs * 0.6);
  assert(hard.impactMs < easy.impactMs);
  assert(hard.comboSize >= 2);
  assert(hard.staggerImmunityMs > easy.staggerImmunityMs);
  assert(hard.impactMs < hard.durationMs);
  // Maximum reach must connect through contact or finite projectile travel.
  for (const level of [1, 5, 10, 20]) {
    for (const dtMs of [5, 16, 33, 50]) {
      const model = make(kind, level, enemyBehavior(kind, level).reach - 1);
      const behavior = enemyBehavior(kind, level);
      const projectile = ENEMY_DEFINITIONS[kind].projectile;
      const travelMs =
        projectile && !ENEMY_DEFINITIONS[kind].boss
          ? (behavior.reach / (projectile.speed * (1 + Math.max(0, level - 5) * 0.035))) * 1000
          : 0;
      for (
        let t = 0;
        t < behavior.windupMs + behavior.impactMs + travelMs + 110 && model.health === 100;
        t += dtMs
      )
        model.tick(dtMs / 1000, player);
      assert(
        model.health < 100,
        `${kind} level ${level}, ${dtMs}ms tick: initial attack cannot fall short`,
      );
    }
  }
}
const easy = make('forest-skirmisher', 1),
  hard = make('forest-skirmisher', 20);
step(easy, 5);
step(hard, 5);
const moved = { x: player.x + 22, y: player.y };
step(easy, 30, moved);
step(hard, 30, moved);
assert.equal(easy.enemies[0]!.target.x, player.x, 'starter attacks lock their aim early');
assert.equal(hard.enemies[0]!.target.x, moved.x, 'veterans track during early preparation');
step(hard, hard.enemies[0]!.windupDurationMs + 20, moved);
const locked = { ...hard.enemies[0]!.target };
step(hard, 10, { x: player.x + 70, y: player.y });
assert.deepEqual(hard.enemies[0]!.target, locked, 'committed lunge never homes');

const blocked = make('forest-brute', 20, 40, [{ x: 780, y: 815, width: 40, height: 10 }]);
step(blocked, 2000);
assert.equal(blocked.health, 100, 'higher difficulty still respects solid walls');

// The skirmisher casts a visible shot; sharing its position must never cause touch damage.
const castAsset = FOREST_ENEMY_ASSETS['forest-skirmisher'];
const releaseFrame = Math.floor(
  (castAsset.animations.attack.impactAtMs! / castAsset.animations.attack.durationMs) *
    castAsset.animations.attack.frames.left.length,
);
const releaseHand = FOREST_CAST_HAND_OFFSETS[releaseFrame]!;
const launch = ENEMY_DEFINITIONS['forest-skirmisher'].projectile!.origin!;
assert.equal(launch.x, -releaseHand.x * castAsset.suggestedScale);
assert.equal(
  launch.y - SPELL_VISUAL_HEIGHT,
  releaseHand.y * castAsset.suggestedScale,
  'the projectile starts at the visible casting hand',
);
for (const level of [1, 5, 10, 20]) {
  const cast = make('forest-skirmisher', level, 0);
  const enemy = cast.enemies[0]!;
  for (let t = 0; enemy.phase !== 'attack' && t < 2500; t += 5) step(cast, 5);
  assert.equal(enemy.phase, 'attack');
  assert.equal(cast.health, 100, 'overlap and preparation cause no damage');
  assert.equal(cast.enemyProjectiles.length, 0);
  const native = FOREST_ENEMY_ASSETS['forest-skirmisher'].animations.attack;
  assert.equal(attackAnimationTime(0, enemy.behavior, native), native.windupEndAtMs);
  for (let t = 0; !cast.enemyProjectiles.length && t < enemy.behavior.durationMs; t += 5)
    step(cast, 5);
  assert(cast.enemyProjectiles.length > 0, 'cast releases native spark at every difficulty');
  assert.equal(cast.health, 100, 'the release frame alone cannot damage the player');
  const spark = cast.enemyProjectiles[0]!;
  assert.equal(spark.visual, 'spark');
  const velocity = { ...spark.velocity };
  step(cast, 100, { x: player.x + 120, y: player.y });
  assert.deepEqual(spark.velocity, velocity, 'released spark never homes');
  assert.equal(cast.health, 100, 'a sidestep avoids the shot');
  step(cast, 2000, { x: 1800, y: 1800 });
  assert(!cast.enemyProjectiles.includes(spark), 'missed spark expires at finite range');
}
const casterWall = make('forest-skirmisher', 20, 120, [{ x: 750, y: 850, width: 100, height: 4 }]);
step(casterWall, 3000);
assert.equal(casterWall.health, 100, 'caster cannot shoot through a wall');

function attackSequence(level: number) {
  const model = make('forest-skirmisher', level, 20);
  model.invincibleUntil = 100;
  const preparation: number[] = [];
  let previous = model.enemies[0]!.phase;
  for (let ms = 0; ms < 4000; ms += 5) {
    model.tick(0.005, player);
    const enemy = model.enemies[0]!;
    if (enemy.phase === 'attack' && previous !== 'attack') preparation.push(enemy.windupDurationMs);
    previous = enemy.phase;
  }
  return preparation;
}
const easySequence = attackSequence(1),
  hardSequence = attackSequence(20);
assert(hardSequence.length > easySequence.length * 2, 'veteran attacks apply sustained pressure');
assert(
  hardSequence[1]! < hardSequence[0]! && hardSequence[2] === hardSequence[1],
  'skirmisher chains two faster follow-ups',
);
assert.equal(hardSequence[3], hardSequence[0], 'a combo ends with full recovery/preparation');
const resistant = make('forest-brute', 20, 40);
resistant.invincibleUntil = 100;
resistant.equip('sword-0');
resistant.attack(player, 'down');
step(resistant, 280);
assert.equal(resistant.enemies[0]!.phase, 'hurt', 'first contact can stagger');
const immuneUntil = resistant.enemies[0]!.staggerReadyAt;
step(resistant, 410);
const beforeRepeat = resistant.enemies[0]!.health;
resistant.attack(player, 'down');
step(resistant, 280);
assert(resistant.enemies[0]!.health < beforeRepeat, 'poise does not prevent damage');
assert.equal(
  resistant.enemies[0]!.staggerReadyAt,
  immuneUntil,
  'repeated attacks do not renew stagger',
);
assert.notEqual(resistant.enemies[0]!.phase, 'hurt', 'veteran can fight through repeated hits');
resistant.setEnemyLevel(1);
assert.equal(resistant.enemies[0]!.behavior.comboSize, 1);
assert.equal(resistant.enemies[0]!.staggerReadyAt, 0);
assert.equal(resistant.trapTime, 0, 'reset also starts a fresh hazard cycle');

for (const kind of ['forest-skirmisher', 'bear', 'snake'] as const) {
  for (const level of [6, 8, 10, 12, 20]) {
    if (enemyBehavior(kind, level).comboSize < 2) continue;
    const model = make(kind, level, 20);
    let impacts = 0,
      damageEvents = 0,
      previouslyHit = false;
    for (let t = 0; t < 4000; t += 5) {
      model.health = 100; // Observe multiple strikes without ending the probe in a rescue.
      model.tick(0.005, player);
      if (model.enemies[0]!.hit && !previouslyHit) impacts++;
      if (model.health < 100) damageEvents++;
      previouslyHit = model.enemies[0]!.hit;
    }
    assert(impacts > 1);
    assert.equal(
      damageEvents,
      impacts,
      `${kind} level ${level}: standing still must not gain immunity to follow-ups`,
    );
  }
}

for (const level of [1, 5, 10, 20]) {
  let firstActive = -1;
  for (let ms = 0; ms < 2000; ms += 5) {
    const state = trapState(ms / 1000, 0, level);
    if (state.active && firstActive < 0) firstActive = ms;
    assert.equal(
      state.active,
      state.frame === 2 || state.frame === 3,
      'visible spikes and damage share a clock',
    );
    assert(!(state.active && state.warning));
  }
  assert(firstActive > 250 && firstActive < 1000, 'brief readable preparation before spikes rise');
}
assert(trapState(0.5, 0, 20).active);
assert(!trapState(0.5, 0, 1).active);
console.log(
  'Enemy difficulty: beginner/veteran pacing, contact reach, tracking lock, walls and faster synchronized spikes passed.',
);
