import assert from 'node:assert/strict';
import { AdventureSession } from '../src/features/rpg/adventure/session';
import { SPELL_DEFINITIONS } from '../src/domain/adventure/spells';
import { crossesPressurePlate } from '../src/domain/adventure/traps';
import { combatTargetAtPointer, SPELL_VISUAL_HEIGHT } from '../src/features/rpg/adventure/aim';

const origin = { x: 500, y: 500 };
const cursor = { x: 700, y: 460 };
const screenAim = combatTargetAtPointer(cursor, 'fire');
assert.equal(screenAim.y - SPELL_VISUAL_HEIGHT, cursor.y, 'visible shot and cursor share a plane');
assert.deepEqual(combatTargetAtPointer(cursor, 'melee'), cursor);
const bounds = { x: 0, y: 0, width: 2000, height: 2000 };
function session(
  enemies: AdventureSession['content']['enemies'] = [],
  walls = [] as (typeof bounds)[],
) {
  return new AdventureSession({ enemies, flowers: [], water: [] }, walls, bounds, origin);
}
function advance(model: AdventureSession, seconds: number, dt = 0.01) {
  for (let i = 0; i < Math.ceil(seconds / dt); i++) model.tick(dt, origin);
}

const freeAim = session([{ id: 'tempting-target', kind: 'slime', x: 565, y: 540 }]);
freeAim.attack(origin, 'down', { x: 1000, y: 500 });
assert.deepEqual(freeAim.cast?.aim, { x: 1, y: 0 }, 'nearby creatures cannot bend cursor aim');
assert.equal(freeAim.cast?.direction, 'right', 'native pose faces the cursor');
freeAim.enemies[0]!.x = 480;
assert.deepEqual(freeAim.cast?.aim, { x: 1, y: 0 }, 'enemy movement cannot retarget a cast');
const keyboard = session([{ id: 'off-axis', kind: 'slime', x: 535, y: 600 }]);
keyboard.attack(origin, 'down');
assert.deepEqual(keyboard.cast?.aim, { x: 0, y: 1 }, 'keyboard fallback is also free aim');
const target = { x: 900, y: 800 };
const diagonal = session();
diagonal.attack(origin, 'up', target);
assert.deepEqual(diagonal.cast?.aim, { x: 0.8, y: 0.6 });
target.x = 0;
assert.deepEqual(diagonal.cast?.aim, { x: 0.8, y: 0.6 }, 'aim is copied at cast start');
const zero = session();
zero.attack(origin, 'left', origin);
assert.deepEqual(zero.cast?.aim, { x: -1, y: 0 }, 'click at feet keeps a valid facing');

for (const spell of ['fire', 'water'] as const) {
  for (const dt of [0.005, 0.05]) {
    const model = session([{ id: 'far-away', kind: 'guardian', x: 1500, y: 500 }]);
    model.spell = spell;
    model.attack(origin, 'right', { x: 100000, y: 500 });
    const health = model.enemies[0]!.health;
    for (let i = 0; i < 2.2 / dt; i++) {
      model.tick(dt, origin);
      for (const p of model.projectiles) {
        assert(p.distance <= SPELL_DEFINITIONS[spell].range);
        assert(Math.hypot(p.x - origin.x, p.y - origin.y) <= SPELL_DEFINITIONS[spell].range);
      }
    }
    assert.equal(model.projectiles.length, 0, 'out-of-range projectiles expire');
    assert.equal(model.enemies[0]!.health, health, 'distant targets receive no damage');
  }
}
const muzzleWall = session([], [{ x: 505, y: 480, width: 2, height: 40 }]);
muzzleWall.attack(origin, 'right');
advance(muzzleWall, 0.42);
assert.equal(muzzleWall.projectiles.length, 0, 'launch offset cannot bypass a thin wall');

for (const level of [1, 20]) {
  const plate = { id: 'pressure', x: 550, y: 500, offset: 5 };
  const model = new AdventureSession(
    { enemies: [], flowers: [], water: [], traps: [plate] },
    [],
    bounds,
    origin,
    undefined,
    { enemyLevelOverride: level },
  );
  model.tick(0.05, origin);
  assert.equal(model.health, 100, 'nearby ground is safe');
  assert.equal(model.getTrapState(0).active, false, 'idle plates are lowered');
  model.tick(0.05, plate);
  const damaged = model.health;
  assert(damaged < 100, 'entering an armed plate hurts immediately at every difficulty');
  assert(model.getTrapState(0).active && model.getTrapState(0).frame >= 2);
  model.tick(0.05, plate);
  assert.equal(model.health, damaged, 'invulnerability prevents per-frame damage');
  for (let i = 0; i < 30; i++) model.tick(0.05, plate);
  assert(model.health < damaged, 'standing on a plate does not become safe');
  for (let i = 0; i < 12; i++) model.tick(0.05, origin);
  assert.equal(model.getTrapState(0).frame, 0, 'released plates retract');
  model.setEnemyLevel(level);
  assert.equal(model.getTrapState(0).active, false, 'encounter reset clears plate activation');
}
assert(
  crossesPressurePlate({ x: 510, y: 500 }, { x: 590, y: 500 }, { x: 550, y: 500 }),
  'a swept step cannot skip a plate',
);
assert(
  !crossesPressurePlate({ x: 510, y: 540 }, { x: 590, y: 540 }, { x: 550, y: 500 }),
  'passing beside a plate is safe',
);
console.log(
  'Cursor aim, locked cast direction, finite ranges, launch walls and pressure traps passed.',
);
