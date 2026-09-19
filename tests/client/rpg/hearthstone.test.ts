import { describe, expect, it } from 'vitest';
import {
  createInventory,
  sanitizeInventory,
  grantItem,
  takeItem,
  consumeItem,
  itemCount,
} from '../../../src/domain/adventure/inventory';
import { TownRecall } from '../../../src/features/rpg/travel/recall';
import { AdventureJourney } from '../../../src/features/rpg/adventure/journey';
import { spawnEnemyPower } from '../../../src/domain/adventure/enemies';
import { grantExperience, createPlayerProgression } from '../../../src/domain/adventure/equipment';
import { experienceForLevel } from '../../../src/domain/adventure/progression';

describe('permanent Hearthstone', () => {
  it('is equipped in new and old saves without refilling spent consumables', () => {
    expect(itemCount(createInventory(), 'hearth-stone')).toBe(1);
    const old = sanitizeInventory({ version: 1, stacks: [{ id: 'raw-meat', quantity: 7 }] });
    expect(itemCount(old, 'hearth-stone')).toBe(1);
    expect(itemCount(old, 'raw-meat')).toBe(7);
    expect(itemCount(old, 'healing-herb')).toBe(0);
    const duplicate = sanitizeInventory({
      version: 1,
      stacks: [
        { id: 'hearth-stone', quantity: 0 },
        { id: 'hearth-stone', quantity: 99 },
      ],
    });
    expect(itemCount(duplicate, 'hearth-stone')).toBe(1);
    expect(duplicate.stacks.filter((s) => s.id === 'hearth-stone')).toHaveLength(1);
  });
  it('cannot be spent, consumed or stacked and survives a journey restore', () => {
    const inventory = grantItem(createInventory(), 'hearth-stone', 50);
    expect(itemCount(inventory, 'hearth-stone')).toBe(1);
    expect(takeItem(inventory, 'hearth-stone', 1)).toBeNull();
    expect(consumeItem(inventory, 'hearth-stone', 10, 100)).toEqual({
      success: false,
      reason: 'not-consumable',
    });
    const journey = new AdventureJourney({ inventory });
    const restored = new AdventureJourney({ snapshot: journey.snapshot() });
    expect(itemCount(restored.supplies.status().inventory, 'hearth-stone')).toBe(1);
  });
});

it('delivers one transition after the effect, ignores repeat activation and cancels on scene cleanup', () => {
  const recall = new TownRecall();
  expect(recall.start()).toBe(true);
  expect(recall.start()).toBe(false);
  expect(recall.advance(1000)).toBe(false);
  expect(recall.advance(NaN)).toBe(false);
  expect(recall.advance(400)).toBe(true);
  expect(recall.advance(1400)).toBe(false);
  recall.reset();
  expect(recall.advance(2000)).toBe(false);
  expect(recall.active).toBe(false);
  expect(recall.start()).toBe(true);
});

it('scales untouched forest encounters on return, preserving injured and defeated enemies', () => {
  const journey = new AdventureJourney();
  const definition = {
    enemies: [0, 1, 2].map((i) => ({
      id: `guard-${i}`,
      kind: 'slime' as const,
      x: 600 + i * 100,
      y: 600,
      levelOffset: i === 0 ? 2 : 1,
    })),
    flowers: [],
    water: [],
  };
  const enter = () =>
    journey.enter(
      'forest:test',
      definition,
      [],
      { x: 0, y: 0, width: 1600, height: 1600 },
      { x: 80, y: 80 },
      { x: 80, y: 80 },
      { durationMs: 700, releaseMs: 400 },
    );
  const session = enter();
  expect(session.enemies.map((e) => e.level)).toEqual([3, 2, 2]);
  session.enemies[0]!.encounter = 'road';
  expect(session.roadBlockers({ x: 610, y: 600 })).toHaveLength(1);
  expect(session.roadBlockers({ x: 80, y: 80 })).toHaveLength(0);
  session.enemies[1]!.health = 12;
  session.enemies[2]!.health = 0;
  journey.leave();
  const traveler = journey.supplies.traveler();
  traveler.progression = grantExperience(createPlayerProgression(), experienceForLevel(5));
  journey.supplies.arrive(traveler, { x: 80, y: 80 });
  const resumed = enter();
  expect(resumed.enemies[0]!.level).toBe(7);
  expect(resumed.enemies[1]!.health).toBe(12);
  expect(resumed.enemies[1]!.level).toBe(2);
  expect(resumed.enemies[2]!.health).toBe(0);
  resumed.enemies[0]!.health = 0;
  expect(resumed.roadBlockers({ x: 610, y: 600 })).toHaveLength(0);
  expect(spawnEnemyPower('slime', 30, { levelOffset: 3 }).level).toBe(30);
  expect(spawnEnemyPower('slime', 5, { levelOffset: 2, levelOverride: 1 }).level).toBe(1);
});
