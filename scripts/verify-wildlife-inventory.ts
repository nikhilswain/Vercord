import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createInventory,
  grantItem,
  itemCount,
  sanitizeInventory,
  takeItem,
  consumeItem,
} from '../src/domain/adventure/inventory';
import { WILDLIFE, type WildlifeKind } from '../src/domain/adventure/wildlife';
import { AdventureSession } from '../src/features/rpg/adventure/session';
import { AdventureJourney } from '../src/features/rpg/adventure/journey';
import { DEMO_EQUIPMENT_POLICY } from '../src/domain/adventure/equipment';
import { FOREST_WILDLIFE_ASSETS } from '../src/features/rpg/adventure/wildlife-assets';

const bounds = { x: 0, y: 0, width: 1800, height: 1800 };
const player = { x: 600, y: 600 };
const options = { equipmentPolicy: DEMO_EQUIPMENT_POLICY, enemyLevelOverride: 1 };
const content = (kind: WildlifeKind) => ({
  enemies: [{ id: kind, kind, x: 640, y: 600 }],
  water: [],
  flowers: [],
});
const make = (kind: WildlifeKind, walls: (typeof bounds)[] = []) =>
  new AdventureSession(content(kind), walls, bounds, { x: 100, y: 100 }, undefined, options);
function step(model: AdventureSession, seconds: number, position = player) {
  for (let t = 0; t < seconds; t += 0.01) model.tick(0.01, position);
}

test('inventory stacks are immutable, bounded, validated and serialize without hidden state', () => {
  const initial = createInventory();
  const inventory = grantItem(grantItem(initial, 'raw-meat', 3), 'raw-meat', 4);
  assert.equal(itemCount(initial, 'raw-meat'), 0);
  assert.equal(itemCount(inventory, 'raw-meat'), 7);
  assert.equal(itemCount(grantItem(inventory, 'raw-meat', 99999), 'raw-meat'), 9999);
  for (const bad of [-1, NaN, Infinity, 1.1])
    assert.equal(grantItem(inventory, 'raw-meat', bad), inventory);
  assert.equal(grantItem(inventory, '__proto__', 3), inventory);
  assert.equal(takeItem(inventory, 'raw-meat', 8), null);
  assert.equal(itemCount(takeItem(inventory, 'raw-meat', 7)!, 'raw-meat'), 0);
  assert.deepEqual(sanitizeInventory(JSON.parse(JSON.stringify(inventory))), inventory);
  const corrupt = sanitizeInventory({
    version: 1,
    stacks: [
      { id: 'raw-meat', quantity: 2 },
      { id: 'raw-meat', quantity: 3 },
      { id: 'unknown', quantity: 2 },
      { id: 'healing-herb', quantity: -8 },
    ],
  });
  assert.deepEqual(corrupt.stacks, [{ id: 'raw-meat', quantity: 5 }]);
  assert.deepEqual(sanitizeInventory({ version: 20, stacks: [] }), createInventory());
});
test('raw food cannot heal; herbs consume exactly one and never waste at full health', () => {
  const inventory = grantItem(createInventory(), 'raw-meat', 2);
  assert.deepEqual(consumeItem(inventory, 'raw-meat', 10, 100), {
    success: false,
    reason: 'cooking',
  });
  assert.deepEqual(consumeItem(inventory, 'healing-herb', 100, 100), {
    success: false,
    reason: 'full-health',
  });
  const healed = consumeItem(inventory, 'healing-herb', 85, 100);
  assert(healed.success);
  assert.equal(healed.restored, 15);
  assert.equal(itemCount(healed.inventory, 'healing-herb'), 0);
  assert.equal(itemCount(healed.inventory, 'raw-meat'), 2);
  assert.deepEqual(consumeItem(grantItem(inventory, 'mira-notes', 1), 'mira-notes', 10, 100), {
    success: false,
    reason: 'not-consumable',
  });
});
test('all eight animals stay neutral, roam and timid wildlife flees without contact damage', () => {
  for (const kind of Object.keys(WILDLIFE) as WildlifeKind[]) {
    const model = make(kind);
    const enemy = model.enemies[0]!;
    const start = { x: enemy.x, y: enemy.y };
    step(model, 1);
    assert.equal(model.health, 100, `${kind} cannot attack an unprovoking player`);
    assert.equal(model.status().enemyGoal, 0, 'hunting is not a combat objective');
    if (WILDLIFE[kind].temperament === 'timid')
      assert(
        Math.hypot(enemy.x - player.x, enemy.y - player.y) >
          Math.hypot(start.x - player.x, start.y - player.y),
        `${kind} flees`,
      );
    else assert(Math.hypot(enemy.x - start.x, enemy.y - start.y) > 1, `${kind} roams`);
    const asset = FOREST_WILDLIFE_ASSETS[kind];
    for (const animation of Object.values(asset.animations))
      for (const frames of Object.values(animation.frames))
        assert(frames.length && frames.every((frame) => frame >= 0 && frame < asset.frameCount));
    assert.equal(asset.animations.attack.impactAtMs, WILDLIFE[kind].combat.impactMs);
    assert(asset.animations.death.frames.right.length >= 3);
  }
});
test('defensive animals retaliate with a committed timed strike only after being hit', () => {
  for (const kind of ['wild-boar', 'wild-wolf', 'wild-bear'] as const) {
    const model = make(kind);
    model.selectMelee();
    model.attack(player, 'right', { x: 640, y: 600 });
    step(model, 0.9);
    assert(model.enemies[0]!.health < model.enemies[0]!.maxHealth);
    assert.equal(model.health, 100, 'hurt + windup cannot cause collision damage');
    step(model, 1.1);
    assert(model.health < 100, `${kind} native attack lands`);
  }
});
test('hunting grants species loot once, never contributes to kills, and respects solid walls', () => {
  for (const kind of Object.keys(WILDLIFE) as WildlifeKind[]) {
    const model = make(kind);
    model.equip('axe-5');
    model.selectMelee();
    // Put each wounded animal within the actual weapon arc, then let its authored contact land.
    const enemy = model.enemies[0]!;
    enemy.health = 1;
    enemy.x = player.x + 20;
    model.attack(player, 'right', enemy);
    step(model, 0.5);
    assert.equal(enemy.health, 0, `${kind} can be hunted`);
    for (const drop of WILDLIFE[kind].loot)
      assert.equal(itemCount(model.getInventory(), drop.id), drop.quantity);
    const inventory = model.getInventory();
    assert.equal(model.status().defeated, 0);
    assert.equal(model.experience, 0);
    model.setEnemyLevel(1);
    step(model, 1.1, { x: 100, y: 100 });
    enemy.x = player.x + 20;
    enemy.y = 600;
    enemy.health = 1;
    model.attack(player, 'right', enemy);
    step(model, 0.5);
    assert.equal(enemy.health, 0);
    assert.deepEqual(model.getInventory(), inventory, 'demo reset cannot duplicate loot');
  }
  const blocked = make('wild-boar', [{ x: 618, y: 570, width: 8, height: 65 }]);
  blocked.equip('axe-5');
  blocked.selectMelee();
  blocked.attack(player, 'right');
  step(blocked, 0.5);
  assert.equal(blocked.enemies[0]!.health, blocked.enemies[0]!.maxHealth);
  assert.equal(itemCount(blocked.getInventory(), 'raw-meat'), 0);
});
test('inventory and equipment persist through new areas, returning areas, and village rest', () => {
  const journey = new AdventureJourney(options);
  const enter = (id: string) =>
    journey.enter(id, content('wild-boar'), [], bounds, player, player, {
      durationMs: 700,
      releaseMs: 400,
    });
  const first = enter('first');
  first.equip('axe-5');
  first.selectMelee();
  first.enemies[0]!.health = 1;
  first.attack(player, 'right');
  step(first, 0.5);
  const inventory = first.getInventory();
  assert.equal(itemCount(inventory, 'raw-meat'), 2);
  assert.deepEqual(enter('second').getInventory(), inventory);
  journey.leave(true);
  assert.deepEqual(journey.supplies.getInventory(), inventory);
  assert(journey.supplies.equip('spear-5'), 'equipment is available at camp');
  assert.equal(enter('first').status().weaponId, 'spear-5');
  assert.deepEqual(first.getInventory(), inventory);
  assert.equal(first.enemies[0]!.health, 0, 'travel never respawns hunted animals');
  first.health = 50;
  assert(first.useInventoryItem('healing-herb', player).success);
  assert.equal(
    itemCount(enter('second').getInventory(), 'healing-herb'),
    0,
    'used herbs never return when changing areas',
  );
});
test('quest hand-ins grant and remove real items exactly once', () => {
  const notes = {
    id: 'notes',
    label: 'Notes',
    action: 'Open' as const,
    ...player,
    grant: ['notes-found'],
    items: [{ id: 'mira-notes' as const, quantity: 1 }],
    dialogue: { name: 'Notes', role: 'Quest', lines: ['Found.'] },
  };
  const handIn = {
    id: 'return',
    label: 'Mira',
    action: 'Talk' as const,
    x: 900,
    y: 600,
    requires: ['notes-found'],
    grant: ['notes-returned'],
    removeItems: [{ id: 'mira-notes' as const, quantity: 1 }],
    dialogue: { name: 'Mira', role: 'Scholar', lines: ['Thank you.'] },
  };
  const model = new AdventureSession(
    {
      enemies: [],
      flowers: [],
      water: [],
      scenario: { title: 'Quest', objectives: [], interactions: [notes, handIn] },
    },
    [],
    bounds,
    player,
  );
  model.interactStory(player);
  model.interactStory(player);
  assert.equal(itemCount(model.getInventory(), 'mira-notes'), 1);
  model.interactStory(handIn);
  model.interactStory(handIn);
  assert.equal(itemCount(model.getInventory(), 'mira-notes'), 0);
  model.interactStory(player);
  assert.equal(
    itemCount(model.getInventory(), 'mira-notes'),
    0,
    'opened chest cannot give another copy',
  );
});
