import assert from 'node:assert/strict';
import { buildTempleInterior } from '../src/features/rpg/demo/temple-interior';
import { buildTempleDemo } from '../src/features/rpg/demo/forest-expansion';
import { AdventureJourney } from '../src/features/rpg/adventure/journey';
import { CHOIR, hollowChoirStory } from '../src/features/rpg/adventure/hollow-choir';
import { createStoryBook } from '../src/domain/adventure/storybook';
import { ScenarioProgress } from '../src/domain/adventure/scenario';
import { RpgPathfinder } from '../src/features/rpg/pathfinding';
import { RpgSimulation } from '../src/features/rpg/simulation';
import { footprint, overlaps, WORLD_PLAYER_FEET } from '../src/domain/world/geometry';
import { AdventureSession } from '../src/features/rpg/adventure/session';
import { DEMO_EQUIPMENT_POLICY } from '../src/domain/adventure/equipment';

const interior = buildTempleInterior(),
  courtyard = buildTempleDemo();
assert.deepEqual(
  [
    ...interior.demo!.jungle!.scenario!.interactions,
    ...courtyard.demo!.jungle!.scenario!.interactions,
  ]
    .map((entry) => entry.id)
    .sort(),
  Object.keys(hollowChoirStory.content.interactions).sort(),
  'the readable script covers exactly the interactions used by the game',
);
const invalidReference = structuredClone(hollowChoirStory.content);
invalidReference.chapters[0]!.interactions.push('missing-dialogue');
assert.throws(() => createStoryBook(invalidReference), /unknown interaction/);
const emptyPage = structuredClone(hollowChoirStory.content);
emptyPage.interactions.mira.dialogue.lines = [];
assert.throws(() => createStoryBook(emptyPage), /mira.dialogue.lines/);
const editable = structuredClone(hollowChoirStory.content);
editable.interactions.mira.dialogue.lines[0] = 'A new line from the story file.';
const editedBook = createStoryBook(editable);
const speech = editedBook.interaction('mira').dialogue;
assert.equal(speech.lines[0], 'A new line from the story file.');
speech.lines[0] = 'Changed by a dialogue session';
assert.equal(
  editedBook.interaction('mira').dialogue.lines[0],
  'A new line from the story file.',
  'sessions cannot mutate shared dialogue pages',
);
// Actual walking and routing must respect the body without losing Talk on its other sides.
for (const sample of [courtyard, interior]) {
  const model = new AdventureSession(
    sample.demo!.jungle!,
    sample.colliders,
    sample.bounds,
    sample.spawn,
  );
  for (const id of sample === courtyard ? ['mira', 'oren'] : ['cantor']) {
    const npc = model.scenario!.definition.interactions.find((entry) => entry.id === id)!;
    const body = npc.body!;
    assert(body, `${id} has a solid footprint`);
    const center = { x: body.x + body.width / 2, y: body.y + body.height / 2 };
    const approaches = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [x, y] of approaches) {
      const simulation = new RpgSimulation(sample);
      simulation.player = {
        x: x === 1 ? body.x - 15 : x === -1 ? body.x + body.width + 15 : center.x,
        y: y === 1 ? body.y - 6 : y === -1 ? body.y + body.height + 18 : center.y,
      };
      for (let frame = 0; frame < 60; frame++)
        simulation.tick(0.025, { x: x!, y: y!, moving: true, sprinting: true });
      assert(
        !overlaps(footprint(simulation.player), body),
        `${id} blocks walking through its body`,
      );
      assert.equal(
        model.nearbyStory(simulation.player)?.id,
        id,
        `${id} can be spoken to from (${x}, ${y}) at ${JSON.stringify(simulation.player)}`,
      );
    }
    const simulation = new RpgSimulation(sample);
    simulation.player = { x: center.x - 70, y: center.y };
    const target = { x: center.x + 70, y: center.y };
    simulation.navigate(target);
    for (let frame = 0; frame < 100; frame++) {
      simulation.tick(0.025, { x: 0, y: 0, moving: false, sprinting: false });
      assert(!overlaps(footprint(simulation.player), body), `${id} is avoided by pathfinding`);
    }
    assert(
      Math.hypot(simulation.player.x - target.x, simulation.player.y - target.y) < 1,
      `${id} can be walked around`,
    );
  }
  assert(sample.storySprites!.every((sprite) => !sprite.label?.includes('NPC')));
}
for (const cultist of interior.storySprites!.filter((sprite) => sprite.id.startsWith('cultist-'))) {
  const simulation = new RpgSimulation(interior);
  simulation.player = { x: cultist.x - 40, y: cultist.y - 6 };
  for (let frame = 0; frame < 60; frame++)
    simulation.tick(0.025, { x: 1, y: 0, moving: true, sprinting: true });
  assert(simulation.player.x <= cultist.x - 20, `${cultist.id} cannot be walked through`);
}
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
let session = enter(courtyard);
const entrance = courtyard.landmarks.find((entry) => entry.id === 'sanctuary-entry')!;
const rootBeast = session.enemies.find((enemy) => enemy.id === 'temple-root-beast')!;
assert(journey.blockedEntry(interior.demo!.jungle));
assert.equal(session.nearbyStory(entrance)?.id, 'sanctuary-entry');
assert.match(session.interactStory(entrance)!.lines.join(' '), /Defeat the Root Beast/);
assert.match(session.status().story!.text, /Defeat the courtyard Root Beast/);
session.health = 61;
const beforeRejectedEntry = session.traveler();
assert.throws(() => enter(interior), /Adventure entry blocked/);
assert.equal(enter(courtyard), session, 'denied admission retains the current area');
assert.deepEqual(session.traveler(), beforeRejectedEntry, 'denied admission keeps the traveler');
session.enemies.find((enemy) => enemy.id === 'temple-venus-west')!.health = 0;
rootBeast.health = 1;
session.tick(0.05, courtyard.spawn);
assert(journey.blockedEntry(interior.demo!.jungle), 'other kills and low boss HP do not unlock');
rootBeast.health = 0;
session.tick(0.05, courtyard.spawn);
assert(progress.has(CHOIR.rootBeast), 'the specific courtyard boss defeat unlocks the entrance');
assert.equal(journey.blockedEntry(interior.demo!.jungle), null);
assert.equal(session.nearbyStory(entrance), null, 'the locked doorway stops intercepting travel');
assert.match(session.status().story!.text, /entrance seal is broken/);
assert.equal(
  new AdventureJourney({
    scenarioProgress: new ScenarioProgress(progress.snapshot()),
  }).blockedEntry(interior.demo!.jungle),
  null,
  'restoring a saved expedition retains admission',
);
session = enter(interior);
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
const eastBlade = session.scenario!.definition.hazards!.find(
  (hazard) => hazard.id === 'east-blade',
)!;
session.health = 100;
session.invincibleUntil = 0;
session.tick(0.05, eastBlade);
assert.equal(session.health, 80, 'the sun blade is still dangerous after opening its gate');
const herbs = session.herbs;
use('supplies');
use('supplies');
assert.equal(session.herbs, herbs + 2, 'supply reward is granted once');
use('east-seal');
session.invincibleUntil = 0;
session.tick(0.05, eastBlade);
assert.equal(session.health, 80, 'releasing the sun seal stops its blade damage');
assert(session.isEnemyActive(session.enemies[0]!), 'both seals wake the boss');
assert.match(session.status().story!.text, /Defeat the Bound Warden/);

// Encounter defeat is an input to the story system; existing combat owns how damage is dealt.
session.enemies[0]!.health = 0;
tick(0.05);
assert(progress.has(CHOIR.warden));
assert(journey.setEnemyLevel(7));
assert.equal(journey.blockedEntry(interior.demo!.jungle), null, 'difficulty resets keep admission');
assert(
  !session.isEnemyActive(session.enemies[0]!),
  'difficulty reset cannot revive the defeated story guardian',
);
use('keeper-release');
assert(
  !session.isEnemyActive(session.enemies[0]!),
  'released ritual no longer has a combat target',
);
// Returning early acknowledges the rescue without handing in notes or granting rewards.
session = enter(courtyard);
assert(
  !session.isEnemyActive(rootBeast),
  'difficulty reset does not revive the courtyard guardian',
);
const mira = session.scenario!.definition.interactions.find((i) => i.id === 'mira-return')!;
const miraApproach = { x: mira.x, y: mira.y + 20 };
assert.equal(session.nearbyStory(miraApproach)?.id, 'mira-freed');
assert.deepEqual(session.nearbyStory(miraApproach)?.body, mira.body);
assert.match(session.interactStory(miraApproach)!.lines.join(' '), /west reliquary/);
assert.equal(session.nearbyStory(miraApproach)?.id, 'mira-freed');
assert.match(session.status().story!.text, /west chamber/);
assert(!progress.has(CHOIR.notes) && !progress.has(CHOIR.returned));
assert(!session.status().story!.complete);
assert.equal(session.herbs, herbs + 2, 'Mira does not grant the unopened chest reward');
session = enter(interior);
use('reliquary');
use('reliquary');
assert.equal(session.herbs, herbs + 4, 'reliquary reward is also granted once');
assert(progress.has(CHOIR.notes));
const saved = progress.snapshot();
assert(new ScenarioProgress(saved).has(CHOIR.notes), 'story facts have a storage-ready snapshot');

session = enter(courtyard);
assert.equal(session.nearbyStory(miraApproach)?.id, 'mira-return');
assert.match(session.interactStory(miraApproach)!.lines.join(' '), /brought the pages back/);
assert(session.status().story!.complete, 'returning the notes finishes the story');
assert.equal(session.interactStory(miraApproach)!.role, 'A story completed');
assert.equal(session.herbs, herbs + 4, 'return and repeat dialogue do not duplicate rewards');
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
