import assert from 'node:assert/strict';
import { buildComparisonVillage, buildJungleDemo } from '../src/features/rpg/demo/scenes';
import { buildFernHollow, buildTempleDemo } from '../src/features/rpg/demo/forest-expansion';
import { AdventureSession } from '../src/features/rpg/adventure/session';
import { AdventureJourney } from '../src/features/rpg/adventure/journey';
import { DEMO_EQUIPMENT_POLICY, createPlayerProgression } from '../src/domain/adventure/equipment';
import { WORLD_PLAYER_FEET, footprint } from '../src/domain/world/geometry';
import { overlaps } from '../src/features/world/engine/collision';
import { RpgPathfinder } from '../src/features/rpg/pathfinding';
import { PLANT_ASSETS } from '../src/features/rpg/adventure/plant-assets';
import { ENEMY_DEFINITIONS, enemyBehavior } from '../src/domain/adventure/enemies';

const samples = [buildComparisonVillage(), buildJungleDemo(), buildFernHollow(), buildTempleDemo()];
for (const sample of samples) {
  const content = sample.demo!.jungle;
  const pathfinder = new RpgPathfinder(sample.bounds, sample.colliders, WORLD_PLAYER_FEET);
  for (const point of [
    ...(content?.enemies ?? []),
    ...(content?.flowers ?? []),
    ...sample.landmarks.filter((p) => sample.demo!.portals.some((portal) => portal.id === p.id)),
  ]) {
    assert(
      !sample.colliders.some((r) => overlaps(footprint(point), r)),
      `${point.id}: spawn intersects scenery`,
    );
    const route = pathfinder.findPath(sample.spawn, point);
    assert(
      route.length && Math.hypot(route.at(-1)!.x - point.x, route.at(-1)!.y - point.y) < 20,
      `${point.id}: not reachable`,
    );
  }
  for (const portal of sample.demo!.portals) {
    assert(
      samples
        .find((destination) => destination.demo!.area === portal.target)
        ?.demo!.portals.some((p) => p.target === sample.demo!.area),
      `${portal.id}: missing return trail`,
    );
  }
}
for (const [kind, asset] of Object.entries(PLANT_ASSETS)) {
  for (const animation of Object.values(asset.animations))
    for (const frames of Object.values(animation.frames)) {
      assert(frames.length > 1 && frames.every((frame) => frame >= 0 && frame < asset.frameCount));
    }
  assert.equal(
    asset.animations.attack.impactAtMs,
    ENEMY_DEFINITIONS[kind as keyof typeof PLANT_ASSETS].impactMs,
  );
}

const journey = new AdventureJourney({
  equipmentPolicy: DEMO_EQUIPMENT_POLICY,
  enemyLevelOverride: 1,
});
const enter = (index: number) => {
  const sample = samples[index]!;
  return journey.enter(
    sample.demo!.area,
    sample.demo!.jungle!,
    sample.colliders,
    sample.bounds,
    sample.spawn,
    sample.spawn,
    { durationMs: 700, releaseMs: 400 },
  );
};
const forest = enter(2);
forest.health = 61;
assert(forest.equip('axe-5'));
const herb = forest.content.flowers.find((f) => f.kind === 'healing')!;
forest.gather(herb);
forest.enemies[0]!.health = 0;
const profile = forest.traveler();
assert.equal(profile.progression.equippedWeaponId, 'axe-5');
const temple = enter(3);
assert.deepEqual(
  temple.traveler(),
  profile,
  'travel carries one profile, health, herbs and equipment',
);
assert.equal(enter(2), forest, 'return reuses area encounter state');
assert.equal(forest.enemies[0]!.health, 0, 'defeated enemy stays defeated');
assert(forest.gathered.has(herb.id), 'picked herbs cannot be farmed by crossing areas');
assert(journey.setEnemyLevel(12));
assert.equal(enter(3).encounterLevel, 12, 'demo difficulty applies to other areas');
assert.equal(enter(1).encounterLevel, 12, 'new areas inherit difficulty');
journey.leave(true);
assert.equal(enter(2).health, 100, 'village rest restores health');

const bounds = { x: 0, y: 0, width: 1500, height: 1500 };
const player = { x: 600, y: 500 };
const normalProfile = { ...createPlayerProgression(), experience: 100 };
const normalJourney = new AdventureJourney({ progression: normalProfile });
const normalArea = normalJourney.enter(
  'saved-profile',
  { enemies: [], flowers: [], water: [] },
  [],
  bounds,
  player,
  player,
  { durationMs: 700, releaseMs: 400 },
);
assert.equal(normalArea.experience, 100, 'ordinary journeys can start from a stored profile');
function plant(kind: 'blue-death' | 'root-beast', walls: (typeof bounds)[] = []) {
  return new AdventureSession(
    { enemies: [{ id: kind, kind, x: 400, y: 500 }], flowers: [], water: [] },
    walls,
    bounds,
    player,
  );
}
function step(model: AdventureSession, seconds: number, point = player) {
  for (let i = 0; i < seconds * 100; i++) model.tick(0.01, point);
}
const blue = plant('blue-death');
step(blue, 1.1);
assert(blue.enemyProjectiles.length, 'native attack releases a spore at its impact frame');
const shot = blue.enemyProjectiles[0]!;
const velocity = { ...shot.velocity };
step(blue, 0.2, { x: 600, y: 650 });
assert.deepEqual(shot.velocity, velocity, 'spores never home after release');
step(blue, 2, { x: 1200, y: 1200 });
assert(!blue.enemyProjectiles.includes(shot), 'spores have finite range');
const hit = plant('blue-death');
step(hit, 2.3);
assert(hit.health < 100, 'spores damage a stationary target');
const blocked = plant('blue-death', [{ x: 520, y: 450, width: 4, height: 100 }]);
step(blocked, 4);
assert.equal(blocked.health, 100, 'thin walls block enemy targeting and projectiles');
const safe = new AdventureSession(hit.content, [], bounds, player, undefined, {
  safeAreas: [{ x: 580, y: 470, width: 100, height: 100 }],
});
step(safe, 4);
assert.equal(safe.health, 100, 'arrival clearings are protected');
const boss = plant('root-beast');
const root = boss.enemies[0]!;
root.health = root.maxHealth / 2;
root.phase = 'attack';
root.phaseAt = 0;
root.target = { ...player };
root.attackCount = 1;
step(boss, 0.5);
assert.equal(boss.enemyProjectiles.length, 5, 'enraged boss opens a five-seed fan');
assert(boss.status().boss?.enraged);
assert(enemyBehavior('root-beast', 16).windupMs < enemyBehavior('root-beast', 1).windupMs);
// An arrival resets swept contact to the arrival point rather than the previous area's player.
const trap = new AdventureSession(
  { enemies: [], flowers: [], water: [], traps: [{ id: 'plate', x: 500, y: 500, offset: 0 }] },
  [],
  bounds,
  { x: 400, y: 500 },
);
trap.arrive(undefined, { x: 600, y: 500 });
trap.tick(0.01, { x: 600, y: 500 });
assert.equal(trap.health, 100, 'cross-map position changes do not trigger swept traps');
console.log(
  'Forest expansion: all portals/encounters/flowers reachable; native plant frames, shared journey, spore combat, boss phase and transition safety passed.',
);
