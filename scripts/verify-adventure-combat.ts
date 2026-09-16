import assert from 'node:assert/strict';
import { AdventureSession } from '../src/features/rpg/adventure/session';
import {
  DEMO_EQUIPMENT_POLICY,
  createPlayerProgression,
  grantExperience,
} from '../src/domain/adventure/equipment';
import { WEAPONS } from '../src/domain/adventure/weapons';
import { ENEMY_DEFINITIONS, spawnEnemyPower, enemyBehavior } from '../src/domain/adventure/enemies';
import { FOREST_ENEMY_ASSETS } from '../src/features/rpg/demo/enemy-assets';
import { attackAnimationTime } from '../src/features/rpg/adventure/animation-clock';
import { JUNGLE_WILDLIFE_ASSETS } from '../src/features/rpg/demo/wildlife-assets';
import { MOMO_SLIME_ASSET } from '../src/features/rpg/adventure/slime-assets';
import { slimeMotion } from '../src/features/rpg/adventure/slime-motion';
import { FOREST_GUARDIAN_ASSET, GREEN_SLIME_ASSET } from '../src/features/rpg/demo/magic-assets';
import type { AdventureDefinition } from '../src/features/rpg/adventure/types';

const bounds = { x: 0, y: 0, width: 1000, height: 1000 };
const player = { x: 250, y: 250 };
const content: AdventureDefinition = {
  enemies: [{ id: 'front', kind: 'bear', x: 250, y: 300 }],
  flowers: [],
  water: [],
};
const make = (walls: (typeof bounds)[] = [], data = content) =>
  new AdventureSession(data, walls, bounds, player, undefined, {
    equipmentPolicy: DEMO_EQUIPMENT_POLICY,
    enemyLevelOverride: 1,
  });
const advance = (model: AdventureSession, ms: number) => {
  for (let t = 0; t < ms; t += 5) model.tick(Math.min(5, ms - t) / 1000, player);
};

for (const weapon of WEAPONS) {
  const model = make();
  assert(model.equip(weapon.id));
  assert.equal(model.status().combatMode, 'melee');
  assert.equal(model.attack(player, 'down'), 'down');
  advance(model, weapon.impactMs - 5);
  assert.equal(model.enemies[0]!.health, 130, weapon.id + ' damage before contact');
  advance(model, 10);
  assert.equal(model.enemies[0]!.health, 130 - weapon.damage, weapon.id + ' contact damage');
  advance(model, weapon.animationMs - weapon.impactMs);
  assert.equal(model.enemies[0]!.health, 130 - weapon.damage, 'one hit per animation');
  assert.equal(model.melee, null);
  assert.equal(model.attack(player, 'down'), null, 'recovery still blocks attack');
  advance(model, weapon.cooldownMs);
  assert(model.attack(player, 'down'));
}

const arc = make([], {
  ...content,
  enemies: [
    ...content.enemies,
    { id: 'behind', kind: 'bear', x: 250, y: 220 },
    { id: 'outside', kind: 'bear', x: 250, y: 400 },
  ],
});
arc.equip('sword-0');
arc.attack(player, 'down');
advance(arc, 300);
assert.deepEqual(
  arc.enemies.map((e) => e.health),
  [113, 130, 130],
);
const wall = make([{ x: 230, y: 270, width: 40, height: 10 }]);
wall.equip('spear-5');
wall.attack(player, 'down');
advance(wall, 700);
assert.equal(wall.enemies[0]!.health, 130, 'melee cannot cross walls');
const narrow = make([], { ...content, enemies: [{ id: 'side', kind: 'bear', x: 280, y: 285 }] });
narrow.equip('spear-0');
narrow.attack(player, 'down');
advance(narrow, 700);
assert.equal(narrow.enemies[0]!.health, 130, 'thrust has narrow corridor');

const reset = make([], {
  ...content,
  enemies: [{ id: 'slime', kind: 'slime', x: 250, y: 295 }],
  flowers: [{ id: 'herb', kind: 'healing', ...player }],
});
reset.gather(player);
reset.equip('sword-5');
reset.attack(player, 'down');
advance(reset, 700);
assert.equal(reset.enemies[0]!.health, 0);
assert.equal(reset.experience, 30);
assert(reset.setEnemyLevel(20));
assert.equal(reset.enemies[0]!.health, spawnEnemyPower('slime', 1, { levelOverride: 20 }).health);
assert.equal(reset.enemies[0]!.level, 20);
assert.equal(reset.experience, 30);
assert.equal(reset.gathered.size, 1);
reset.setEnemyLevel(1);
reset.attack(player, 'down');
advance(reset, 700);
assert.equal(reset.enemies[0]!.health, 0);
assert.equal(reset.experience, 30, 'sandbox resets never farm duplicate XP');

const normal = new AdventureSession(content, [], bounds, player, undefined, {
  progression: grantExperience(createPlayerProgression(), 100),
});
assert.equal(normal.enemies[0]!.level, 3, 'normal spawn uses stored player XP');
assert.equal(normal.equip('sword-5'), false, 'normal equipment still enforces ownership/level');
assert.equal(normal.setEnemyLevel(20), false, 'normal session has no difficulty override');
const saved = normal.getProgression();
assert.equal(saved.experience, 100);

const swap = make();
swap.equip('staff-5');
swap.selectSpell('fire');
swap.attack(player, 'down');
advance(swap, 405);
const damage = swap.projectiles[0]!.damage;
assert.equal(damage, 48);
swap.equip('sword-0');
assert.equal(swap.projectiles[0]!.damage, damage, 'launched spells snapshot damage');
assert.equal(swap.attack(player, 'down'), null, 'swapping cannot bypass recovery');
swap.rest();
assert.equal(swap.melee, null);
assert.equal(swap.projectiles.length, 0);

for (const id of ['forest-brute', 'forest-skirmisher'] as const) {
  assert.equal(
    ENEMY_DEFINITIONS[id].impactMs,
    FOREST_ENEMY_ASSETS[id].animations.attack.impactAtMs,
  );
  assert.equal(
    ENEMY_DEFINITIONS[id].durationMs,
    FOREST_ENEMY_ASSETS[id].animations.attack.durationMs,
  );
}
const attackAssets = [
  ['slime', MOMO_SLIME_ASSET],
  ['slime', JUNGLE_WILDLIFE_ASSETS.slime],
  ['slime', GREEN_SLIME_ASSET],
  ['snake', JUNGLE_WILDLIFE_ASSETS.snake],
  ['bear', JUNGLE_WILDLIFE_ASSETS.bear],
  ['guardian', FOREST_GUARDIAN_ASSET],
  ['forest-brute', FOREST_ENEMY_ASSETS['forest-brute']],
  ['forest-skirmisher', FOREST_ENEMY_ASSETS['forest-skirmisher']],
] as const;
for (const [kind, asset] of attackAssets) {
  const definition = ENEMY_DEFINITIONS[kind];
  const native = asset.animations.attack;
  assert.equal(attackAnimationTime(definition.impactMs, definition, native), native.impactAtMs);
  assert.equal(attackAnimationTime(definition.durationMs, definition, native), native.durationMs);
}
const nearSpawn = {
  ...content,
  enemies: [{ id: 'snake', kind: 'snake' as const, x: 260, y: 250 }],
};
const unsafe = new AdventureSession(nearSpawn, [], bounds, player);
advance(unsafe, 2000);
assert(unsafe.health < 100, 'normal worlds have no implicit spawn-direction immunity');
const camp = new AdventureSession(nearSpawn, [], bounds, player, undefined, {
  safeAreas: [bounds],
});
advance(camp, 2000);
assert.equal(camp.health, 100, 'authored safe region protects camp');
for (const level of [1, 5, 10, 30]) {
  const behavior = enemyBehavior('slime', level);
  const airborne = slimeMotion('attack', behavior.impactMs / 2, 500, behavior.impactMs, false);
  const impact = slimeMotion('attack', behavior.impactMs, 500, behavior.impactMs, false);
  assert(airborne.lift > 20, 'slime visibly leaves the ground before impact');
  assert(Math.abs(impact.lift) < 0.001, 'slime lands at the gameplay hit time at every level');
  for (const phase of ['idle', 'walk', 'windup', 'attack', 'hurt'] as const) {
    const reduced = slimeMotion(phase, 100, 500, behavior.impactMs, true);
    assert.equal(reduced.lift, 0, 'reduced motion has no extra jump');
    assert.equal(reduced.scaleX, 1);
    assert.equal(reduced.scaleY, 1);
  }
}
for (const animation of Object.values(MOMO_SLIME_ASSET.animations)) {
  for (const frames of Object.values(animation.frames)) {
    assert(
      frames.every((frame) => frame >= 0 && frame < 15),
      'only free demo cells are used',
    );
  }
}
assert.notDeepEqual(
  MOMO_SLIME_ASSET.animations.walk.frames.up,
  MOMO_SLIME_ASSET.animations.walk.frames.down,
);
assert.deepEqual(MOMO_SLIME_ASSET.flipXDirections, ['right']);
assert.equal(slimeMotion('death', 500, 500, 330, false).alpha, 0);
assert.equal(slimeMotion('death', 180, 500, 330, true).alpha, 0);
console.log(
  'Momo free slime: directional frames, level-scaled landing, defeat and reduced motion passed.',
);
console.log(
  'Combat: all 24 contact timings/damage, recovery, arcs, walls, level scaling, reset rewards, shared policy and native boss timings passed.',
);
