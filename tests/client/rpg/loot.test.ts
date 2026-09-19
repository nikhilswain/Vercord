import { describe, expect, it } from 'vitest';
import { AdventureSession } from '../../../src/features/rpg/adventure/session';
import { AdventureJourney } from '../../../src/features/rpg/adventure/journey';
import { creatureLoot, groundLootId, type GroundLoot } from '../../../src/domain/adventure/loot';
import { craftItem } from '../../../src/domain/adventure/crafting';
import {
  consumeItem,
  createInventory,
  grantItem,
  itemCount,
} from '../../../src/domain/adventure/inventory';
import type { CreatureKind } from '../../../src/domain/adventure/enemies';
import type { Rect } from '../../../src/features/world/engine/types';
import { footprint, overlaps } from '../../../src/domain/world/geometry';

const bounds = { x: 0, y: 0, width: 1000, height: 1000 };
const spawn = { x: 100, y: 100 };
const content = (kind: CreatureKind = 'slime') => ({
  enemies: [{ id: 'target', kind, x: 420, y: 400 }],
  flowers: [],
  water: [],
});
const session = (kind: CreatureKind = 'slime', colliders: Rect[] = []) =>
  new AdventureSession(content(kind), colliders, bounds, spawn, undefined, {
    enemyLevelOverride: 1,
  });
const enter = (journey: AdventureJourney) =>
  journey.enter('forest:test', content(), [], bounds, spawn, spawn, {
    durationMs: 700,
    releaseMs: 400,
  });

function defeat(model: AdventureSession) {
  const enemy = model.enemies[0]!;
  enemy.health = 1;
  const player = { x: enemy.x - 24, y: enemy.y };
  model.invincibleUntil = Infinity;
  model.selectMelee();
  model.attack(player, 'right');
  for (let frame = 0; frame < 30; frame++) model.tick(0.05, player);
  expect(enemy.health).toBe(0);
}
function savedDrop(x = 420, y = 400): GroundLoot {
  return {
    id: groundLootId('target', 0),
    sourceId: 'target',
    itemId: 'slime-resin',
    quantity: 1,
    x,
    y,
  };
}

describe('ground loot', () => {
  it.each([
    'slime',
    'forest-skirmisher',
    'forest-brute',
    'venus-trap',
    'blue-death',
    'guardian',
    'root-beast',
    'wild-bird',
    'wild-boar',
  ] as const)(
    '%s leaves the expected supplies on the ground instead of auto-granting them',
    (kind) => {
      const model = session(kind);
      const before = model.getInventory();
      defeat(model);
      expect(model.getInventory()).toEqual(before);
      expect(model.loot.map((drop) => ({ id: drop.itemId, quantity: drop.quantity }))).toEqual(
        creatureLoot(kind),
      );
      expect(
        model.loot.every(
          (drop) => Math.hypot(drop.x - model.enemies[0]!.x, drop.y - model.enemies[0]!.y) < 65,
        ),
      ).toBe(true);
      for (const drop of [...model.loot]) expect(model.pickupLoot(drop)).toBe(true);
      expect(model.loot).toHaveLength(0);
      for (const drop of creatureLoot(kind))
        expect(itemCount(model.getInventory(), drop.id)).toBe(
          itemCount(before, drop.id) + drop.quantity,
        );
    },
  );

  it('requires proximity and line of sight; E gathering never collects a drop', () => {
    const model = session('slime', [{ x: 390, y: 300, width: 10, height: 200 }]);
    model.restoreEncounters({
      defeated: ['target'],
      rewarded: ['target'],
      gathered: [],
      loot: [savedDrop()],
    });
    expect(model.pickupLoot(spawn)).toBe(false);
    expect(model.pickupLoot({ x: 380, y: 400 })).toBe(false);
    expect(model.gather({ x: 420, y: 400 })).toBe(false);
    expect(model.loot).toHaveLength(1);
    expect(model.pickupLoot({ x: 418, y: 400 })).toBe(true);
    expect(model.pickupLoot({ x: 418, y: 400 })).toBe(false);
  });

  it('places a defeated creature’s drops clear of nearby collision', () => {
    const wall = { x: 421, y: 400, width: 100, height: 100 };
    const model = session('slime', [wall]);
    defeat(model);
    expect(model.loot).toHaveLength(1);
    expect(overlaps(footprint(model.loot[0]!), wall)).toBe(false);
  });

  it('leaves the remainder on the ground when a stack fills', () => {
    const model = session('wild-boar');
    const traveler = model.traveler();
    traveler.inventory = grantItem(model.getInventory(), 'raw-meat', 9998);
    model.arrive(traveler, spawn);
    defeat(model);
    const meat = model.loot.find((drop) => drop.itemId === 'raw-meat')!;
    expect(model.pickupLoot(meat)).toBe(true);
    expect(itemCount(model.getInventory(), 'raw-meat')).toBe(9999);
    expect(meat.quantity).toBe(1);
    expect(model.pickupLoot(meat)).toBe(false);
    expect(model.loot).toContain(meat);
  });

  it('does not duplicate loot or experience after a sandbox reset', () => {
    const model = session();
    defeat(model);
    const xp = model.getProgression().experience;
    model.pickupLoot(model.loot[0]!);
    model.setEnemyLevel(2);
    defeat(model);
    expect(model.loot).toHaveLength(0);
    expect(itemCount(model.getInventory(), 'slime-resin')).toBe(1);
    expect(model.getProgression().experience).toBe(xp);
  });

  it('persists uncollected drops across portals/reloads, then persists their collection', () => {
    const journey = new AdventureJourney();
    const model = enter(journey);
    defeat(model);
    journey.leave(true);
    const restored = new AdventureJourney({ snapshot: journey.snapshot() });
    const resumed = enter(restored);
    expect(resumed.loot).toHaveLength(1);
    expect(itemCount(resumed.getInventory(), 'slime-resin')).toBe(0);
    resumed.pickupLoot(resumed.loot[0]!);
    const again = enter(new AdventureJourney({ snapshot: restored.snapshot() }));
    expect(again.loot).toHaveLength(0);
    expect(itemCount(again.getInventory(), 'slime-resin')).toBe(1);
    expect(again.enemies[0]!.health).toBe(0);
  });

  it('accepts older saves without retroactive drops, preserving progress and supplies', () => {
    const journey = new AdventureJourney();
    defeat(enter(journey));
    const old = journey.snapshot();
    old.areas.forEach(({ state }) => {
      delete state.loot;
    });
    old.traveler.inventory = grantItem(old.traveler.inventory, 'raw-meat', 6);
    const restored = enter(new AdventureJourney({ snapshot: old }));
    expect(restored.loot).toHaveLength(0);
    expect(restored.enemies[0]!.health).toBe(0);
    expect(itemCount(restored.getInventory(), 'raw-meat')).toBe(6);
    expect(restored.getProgression()).toEqual(old.traveler.progression);
  });

  it('ignores a malformed saved pickup without resetting the journey or valid loot', () => {
    const journey = new AdventureJourney();
    defeat(enter(journey));
    const saved = JSON.parse(JSON.stringify(journey.snapshot()));
    saved.areas[0].state.loot.push({ itemId: 'obsolete-item' });
    const restored = enter(new AdventureJourney({ snapshot: saved }));
    expect(restored.enemies[0]!.health).toBe(0);
    expect(restored.loot).toHaveLength(1);
    expect(restored.getProgression()).toEqual(saved.traveler.progression);
  });

  it('rejects duplicate, fabricated and excessive saved drops', () => {
    const model = session();
    model.restoreEncounters({
      defeated: ['target'],
      rewarded: ['target'],
      gathered: [],
      loot: [
        savedDrop(),
        savedDrop(),
        { ...savedDrop(), id: 'invented' },
        { ...savedDrop(), quantity: 500 },
        { ...savedDrop(), itemId: 'hearth-stone' },
      ],
    });
    expect(model.loot).toHaveLength(1);
  });
});

describe('recovery recipe compatibility', () => {
  it('retires the old wrap recipe without consuming its materials', () => {
    const inventory = grantItem(grantItem(createInventory(), 'slime-resin', 2), 'trailcloth', 1);
    expect(craftItem(inventory, 'resin-wrap')).toEqual({
      success: false,
      reason: 'unknown-recipe',
    });
    expect(itemCount(inventory, 'slime-resin')).toBe(2);
  });
  it('keeps simple herb healing bounded; station recipes are covered by provisions tests', () => {
    const result = consumeItem(createInventory(), 'healing-herb', 75, 100);
    expect(result).toMatchObject({ success: true, health: 100, restored: 25 });
    expect(consumeItem(createInventory(), 'healing-herb', 100, 100)).toEqual({
      success: false,
      reason: 'full-health',
    });
  });
});
