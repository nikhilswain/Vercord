import assert from 'node:assert/strict';
import { buildTempleInterior } from '../src/features/rpg/demo/temple-interior';
import { buildTempleDemo } from '../src/features/rpg/demo/forest-expansion';
import { AdventureJourney } from '../src/features/rpg/adventure/journey';
import { CHOIR } from '../src/features/rpg/adventure/hollow-choir';
import { ScenarioProgress } from '../src/domain/adventure/scenario';
import { RpgPathfinder } from '../src/features/rpg/pathfinding';
import { WORLD_PLAYER_FEET } from '../src/domain/world/geometry';
import { DEMO_EQUIPMENT_POLICY } from '../src/domain/adventure/equipment';

const interior = buildTempleInterior(),
  courtyard = buildTempleDemo();
for (const hazard of interior.demo!.jungle!.scenario!.hazards ?? []) {
  const sprite = interior.storySprites!.find((entry) => entry.id === hazard.id)!;
  assert(sprite, `${hazard.id} has visible art`);
  assert.equal(sprite.x, hazard.x);
  assert.equal(
    sprite.y + (0.5 - (sprite.originY ?? 1)) * sprite.height,
    hazard.y,
    `${hazard.id} damage is centered on its visible blades`,
  );
}
const progress = new ScenarioProgress();
const journey = new AdventureJourney({
  scenarioProgress: progress,
  equipmentPolicy: DEMO_EQUIPMENT_POLICY,
  enemyLevelOverride: 1,
});
const enter = (sample: typeof interior) =>
  journey.enter(
    sample.demo!.area,
    sample.demo!.jungle!,
    sample.colliders,
    sample.bounds,
    sample.spawn,
    sample.spawn,
    { durationMs: 700, releaseMs: 400 },
  );
let session = enter(interior);
const tick = (seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) session.tick(0.05, interior.spawn);
};
const point = (id: string) => {
  const p = session.scenario!.definition.interactions.find((entry) => entry.id === id)!;
  return { x: p.x, y: p.y + 24 };
};
const reachable = (id: string) => {
  const target = point(id);
  const path = new RpgPathfinder(interior.bounds, session.collision, WORLD_PLAYER_FEET).findPath(
    interior.spawn,
    target,
  );
  return path.length > 0 && Math.hypot(path.at(-1)!.x - target.x, path.at(-1)!.y - target.y) < 20;
};
const use = (id: string) => {
  assert(reachable(id), `${id} is reachable at this story stage`);
  const p = point(id);
  assert.equal(session.nearbyStory(p)?.id, id, `${id} is the closest visible interaction`);
  const result = session.interactStory(p);
  assert(result, `${id} responds`);
  return result;
};
assert(!session.isEnemyActive(session.enemies[0]!), 'the warden is dormant before the seals');
assert(!reachable('west-seal') && !reachable('east-seal'), 'closed gates block both wings');
assert.match(
  use('keeper-release').lines.join(' '),
  /Break the seals/,
  'altar explains the locked state',
);
assert(!progress.has(CHOIR.freed));
use('west-lever');
assert(!reachable('west-seal'), 'the gate remains solid while opening');
tick(1.2);
use('west-seal');
session.health = 1;
session.invincibleUntil = 0;
assert(session.tick(0.05, { x: 608, y: 768 }), 'blade contact rescues a defeated traveler');
assert(progress.has(CHOIR.westSeal), 'rescue keeps broken seals');
assert(!session.isEnemyActive(session.enemies[0]!), 'one seal does not wake the boss');
assert.match(use('reliquary').lines.join(' '), /Free the keeper/, 'treasure stays locked');
use('east-lever');
tick(1.2);
const herbs = session.herbs;
use('supplies');
use('supplies');
assert.equal(session.herbs, herbs + 2, 'supply reward is granted once');
use('east-seal');
assert(session.isEnemyActive(session.enemies[0]!), 'both seals wake the boss');
assert.match(session.status().story!.text, /Defeat the Bound Warden/);

// Encounter defeat is an input to the story system; existing combat owns how damage is dealt.
session.enemies[0]!.health = 0;
tick(0.05);
assert(progress.has(CHOIR.warden));
assert(journey.setEnemyLevel(7));
assert(
  !session.isEnemyActive(session.enemies[0]!),
  'difficulty reset cannot revive the defeated story guardian',
);
use('keeper-release');
assert(
  !session.isEnemyActive(session.enemies[0]!),
  'released ritual no longer has a combat target',
);
use('reliquary');
use('reliquary');
assert.equal(session.herbs, herbs + 4, 'reliquary reward is also granted once');
assert(progress.has(CHOIR.notes));
const saved = progress.snapshot();
assert(new ScenarioProgress(saved).has(CHOIR.notes), 'story facts have a storage-ready snapshot');

session = enter(courtyard);
const mira = session.scenario!.definition.interactions.find((i) => i.id === 'mira-return')!;
assert.equal(session.nearbyStory({ x: mira.x, y: mira.y + 20 })?.id, 'mira-return');
session.interactStory({ x: mira.x, y: mira.y + 20 });
assert(session.status().story!.complete, 'returning the notes finishes the story');
session = enter(interior);
assert.equal(session.scenario!.colliders.length, 0, 'open gates stay open across travel');
assert(session.status().story!.complete);
assert(journey.setEnemyLevel(10));
assert(
  !session.isEnemyActive(session.enemies[0]!),
  'difficulty reset does not revive a completed ritual',
);
assert(session.status().story!.complete);
console.log(
  'Temple story verified: gated routes, ordered ritual, locked feedback, one-time rewards, return dialogue, saved facts and travel/reset retention.',
);
