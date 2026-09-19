import { describe, expect, it } from 'vitest';
import { AdventureJourney } from '../../../src/features/rpg/adventure/journey';
import { Provisions, sanitizeProvisions } from '../../../src/domain/adventure/provisions';
import {
  createInventory,
  grantItem,
  itemCount,
  getItem,
} from '../../../src/domain/adventure/inventory';
import { craftItem } from '../../../src/domain/adventure/crafting';

const point = { x: 100, y: 100 },
  bounds = { x: 0, y: 0, width: 500, height: 500 };
const empty = { enemies: [], flowers: [], water: [] };
describe('adventure-only supplies', () => {
  it('blocks town consumption while effects and cooldowns keep counting down, then resumes adventure use', () => {
    const inventory = grantItem(
      grantItem(createInventory(), 'roasted-meat', 2),
      'battle-bottle',
      1,
    );
    const journey = new AdventureJourney({ inventory });
    expect(journey.supplies.status().canUseSupplies).toBe(false);
    expect(journey.supplies.useInventoryItem('roasted-meat', point)).toMatchObject({
      reason: 'adventure-only',
    });
    const area = journey.enter('forest', empty, [], bounds, point, point, {
      durationMs: 600,
      releaseMs: 200,
    });
    expect(area.useInventoryItem('roasted-meat', point).success).toBe(true);
    for (let i = 0; i < 5; i++) area.tickSupplies(1, point);
    area.provisions.state.buff = { id: 'battle-bottle', remaining: 180 };
    const remaining = area.provisions.state.meal!.remaining;
    journey.leave(true);
    for (let i = 0; i < 10; i++) journey.supplies.tickSupplies(1, point);
    expect(journey.supplies.provisions.state.meal!.remaining).toBe(remaining - 10);
    expect(journey.supplies.provisions.state.buff!.remaining).toBe(170);
    expect(journey.supplies.useInventoryItem('battle-bottle', point)).toMatchObject({
      reason: 'adventure-only',
    });
    expect(itemCount(journey.supplies.getInventory(), 'battle-bottle')).toBe(1);
    const resumed = new AdventureJourney({ snapshot: journey.snapshot() });
    const second = resumed.enter('forest', empty, [], bounds, point, point, {
      durationMs: 600,
      releaseMs: 200,
    });
    expect(second.status().canUseSupplies).toBe(true);
    expect(second.provisions.state.meal!.remaining).toBe(remaining - 10);
  });

  it('caps old long meals at the new durations and prevents meal refresh spam', () => {
    for (const [id, duration] of [
      ['roasted-meat', 300],
      ['pan-mushrooms', 180],
      ['trail-stew', 300],
    ] as const) {
      const saved = new Provisions().snapshot();
      saved.meal = { id, remaining: 1800 };
      expect(sanitizeProvisions(saved).meal!.remaining).toBe(duration);
      expect(getItem(id)?.duration).toBe(duration);
    }
    const model = new Provisions();
    model.state.meal = { id: 'roasted-meat', remaining: 60 };
    expect(
      model.begin('pan-mushrooms', grantItem(createInventory(), 'pan-mushrooms', 1), 50, point),
    ).toMatchObject({ reason: 'meal-active' });
  });

  it('broth heals without a buff or cooldown and cannot consume more than one serving at once', () => {
    const model = new Provisions();
    let inventory = grantItem(createInventory(), 'mushroom-broth', 3),
      health = 20;
    model.state.recoveryCooldown = 20;
    model.state.useCooldown = 3;
    model.state.meal = { id: 'roasted-meat', remaining: 100 };
    for (let serving = 0; serving < 2; serving++) {
      expect(model.begin('mushroom-broth', inventory, health, point).success).toBe(true);
      expect(model.begin('mushroom-broth', inventory, health, point)).toMatchObject({
        reason: 'busy',
      });
      for (let i = 0; i < 4; i++) {
        const used = model.tick(1, point, inventory, health);
        inventory = used.inventory;
        health = used.health;
      }
    }
    expect(health).toBe(70);
    expect(itemCount(inventory, 'mushroom-broth')).toBe(1);
    expect(model.state.buff).toBeNull();
    expect(model.state.meal).toEqual({ id: 'roasted-meat', remaining: 92 });
    expect(model.state.recoveryCooldown).toBe(12);
    expect(model.state.useCooldown).toBe(0);
    model.combat();
    expect(model.begin('mushroom-broth', inventory, health, point)).toMatchObject({
      reason: 'combat',
    });
  });

  it('lets town hearths prepare broth without requiring discovery or enabling town consumption', () => {
    const result = craftItem(grantItem(createInventory(), 'forest-mushroom', 1), 'mushroom-broth', {
      station: 'cook',
      learned: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(itemCount(result.inventory, 'forest-mushroom')).toBe(0);
      expect(itemCount(result.inventory, 'mushroom-broth')).toBe(1);
    }
  });
});
