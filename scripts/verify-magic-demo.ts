import assert from 'node:assert/strict';
import { AdventureSession } from '../src/features/rpg/adventure/session';
import { buildJungleDemo, buildComparisonVillage } from '../src/features/rpg/demo/scenes';
import { RpgPathfinder } from '../src/features/rpg/pathfinding';
import { WORLD_PLAYER_FEET, footprint, sceneIsReachable } from '../src/domain/world/geometry';
import { overlaps } from '../src/features/world/engine/collision';

const bounds = { x: 0, y: 0, width: 1000, height: 1000 };
const player = { x: 250, y: 250 };
const make = (walls: (typeof bounds)[] = []) =>
  new AdventureSession(
    {
      enemies: [{ id: 'target', kind: 'slime', x: 250, y: 370 }],
      flowers: [
        { id: 'herb', kind: 'healing', x: 250, y: 250 },
        { id: 'bloom1', kind: 'collection', x: 250, y: 250 },
        { id: 'bloom2', kind: 'collection', x: 250, y: 250 },
      ],
      water: [],
    },
    walls,
    bounds,
    { x: 250, y: 900 },
  );
const advance = (m: AdventureSession, seconds: number, p = player) => {
  for (let i = 0; i < seconds * 100; i++) m.tick(0.01, p);
};
const m = make();
assert.equal(m.attack(player, 'down'), 'down');
assert.equal(m.attack(player, 'down'), null, 'no cast spam');
assert.equal(m.enemies[0]!.health, 50, 'no instant damage on cast start');
advance(m, 0.39);
assert.equal(m.projectiles.length, 0, 'wait for arm extension');
advance(m, 0.02);
assert.equal(m.projectiles.length, 1, 'release at native animation keyframe');
advance(m, 1);
assert.ok(m.enemies[0]!.health < 50, 'projectile impact damages');
assert.equal(m.cast, null, 'recovery ends');

const blocked = make([{ x: 210, y: 280, width: 80, height: 20 }]);
blocked.attack(player, 'down');
advance(blocked, 1.8);
assert.equal(blocked.enemies[0]!.health, 50, 'wall stops projectile');
assert.equal(blocked.projectiles.length, 0);
const corner = new AdventureSession(
  { enemies: [{ id: 'corner', kind: 'slime', x: 111, y: 96 }], flowers: [], water: [] },
  [{ x: 100, y: 100, width: 20.48, height: 14.4 }],
  bounds,
  { x: 0, y: 400 },
);
corner.attack({ x: 126, y: 200 }, 'up');
for (let i = 0; i < 41; i++) corner.tick(1 / 60, { x: 126, y: 200 });
assert.equal(corner.enemies[0]!.health, 50, 'hit radius cannot reach through a tree corner');

const progress = make();
progress.selectSpell('water');
assert.equal(progress.spell, 'fire', 'locked spell cannot select');
assert.ok(progress.gather(player));
assert.ok(progress.gather(player));
assert.ok(progress.gather(player));
assert.equal(progress.gather(player), false, 'no duplicate flower rewards');
assert.equal(progress.experience, 40);
assert.equal(progress.level, 2);
progress.selectSpell('water');
assert.equal(progress.spell, 'water');
progress.attack(player, 'down');
advance(progress, 0.8);
assert.ok(progress.enemies[0]!.slowedUntil > progress.time, 'Tide slows target');
progress.rest();
assert.equal(progress.experience, 40, 'crossings preserve experience');
assert.equal(progress.projectiles.length, 0);
assert.equal(progress.cast, null);
assert.equal(progress.gathered.size, 3);

const trap = new AdventureSession(
  { enemies: [], flowers: [], water: [], traps: [{ id: 'spikes', x: 250, y: 250, offset: 0 }] },
  [],
  bounds,
  { x: 250, y: 900 },
);
advance(trap, 1.9);
assert.equal(trap.health, 100, 'warning phase does not hurt');
advance(trap, 0.95);
assert.equal(trap.health, 86, 'active spikes hurt once per iframe');

const jungle = buildJungleDemo();
const village = buildComparisonVillage();
assert.equal(
  village.npcs.some((npc) => npc.id.includes('tiago')),
  false,
);
assert.equal(jungle.demo!.jungle!.enemies.length, 8);
assert(sceneIsReachable(village));
const pf = new RpgPathfinder(jungle.bounds, jungle.colliders, WORLD_PLAYER_FEET);
for (const point of [
  ...jungle.demo!.jungle!.enemies,
  ...jungle.demo!.jungle!.flowers,
  ...jungle.landmarks,
]) {
  assert(
    !jungle.colliders.some((rect) => overlaps(footprint(point), rect)),
    point.id + ' scenery collision',
  );
  const route = pf.findPath(jungle.spawn, point);
  assert(
    route.length && Math.hypot(route.at(-1)!.x - point.x, route.at(-1)!.y - point.y) < 20,
    point.id + ' unreachable',
  );
}
console.log(
  'Magic rules: cast timing, cooldown, impact, walls, progression, water, transition cleanup, trap warning all passed.',
);
