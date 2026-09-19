import { describe, expect, it } from 'vitest';
import { AdventureSession } from '../../../src/features/rpg/adventure/session';
import { AdventureJourney } from '../../../src/features/rpg/adventure/journey';
import { DefeatSequence, DEFEAT_RETURN_MS } from '../../../src/features/rpg/adventure/defeat';
import { createInventory, grantItem, itemCount } from '../../../src/domain/adventure/inventory';

const player = { x: 100, y: 100 };
const bounds = { x: 0, y: 0, width: 800, height: 800 };
const content = { enemies: [], flowers: [], water: [] };
const inventory = grantItem(grantItem(createInventory(), 'roasted-meat', 2), 'healing-bottle', 2);
const session = () => new AdventureSession(content, [], bounds, player, undefined, { inventory });

describe('defeat ends the adventure visit', () => {
  it('cancels eating without spending food, clears the short buff and latches at zero HP', () => {
    const model = session();
    model.health = 30;
    model.provisions.state.buff = { id: 'battle-bottle', remaining: 100 };
    expect(model.useInventoryItem('roasted-meat', player).success).toBe(true);
    model.tick(0.05, player);
    model.health = 0;
    expect(model.tick(0.05, player)).toBe(true);
    expect(model.defeated).toBe(true);
    expect(model.provisions.pending).toBeNull();
    expect(model.provisions.state.buff).toBeNull();
    expect(itemCount(model.getInventory(), 'roasted-meat')).toBe(2);
    for (let i = 0; i < 100; i++) expect(model.tick(0.05, player)).toBe(false);
    expect(model.health).toBe(0);
    expect(model.attack(player, 'right')).toBeNull();
    expect(model.useInventoryItem('healing-bottle', player).success).toBe(false);
    expect(model.lastConsumption).toBeNull();
  });

  it('does not reload a dead traveler alive in the forest; town recovers them without losing supplies', () => {
    const journey = new AdventureJourney({ inventory });
    const enter = (owner: AdventureJourney) =>
      owner.enter('test', content, [], bounds, player, player, { durationMs: 700, releaseMs: 400 });
    const model = enter(journey);
    model.provisions.state.meal = { id: 'trail-stew', remaining: 1200 };
    model.health = 0;
    model.tick(0.05, player);
    const reloaded = new AdventureJourney({ snapshot: journey.snapshot() });
    const dead = enter(reloaded);
    expect(dead.health).toBe(0);
    expect(dead.tick(0.05, player)).toBe(true);
    reloaded.leave(true);
    expect(reloaded.supplies.health).toBe(120);
    expect(itemCount(reloaded.supplies.getInventory(), 'roasted-meat')).toBe(2);
    const nextVisit = enter(reloaded);
    expect(nextVisit.defeated).toBe(false);
    expect(nextVisit.tick(0.05, player)).toBe(false);
  });

  it('allows the presentation to finish and returns exactly once, even if routing is slow', () => {
    const sequence = new DefeatSequence();
    expect(sequence.advance(50)).toBe(false);
    expect(sequence.start()).toBe(true);
    expect(sequence.start()).toBe(false);
    for (let i = 0; i < DEFEAT_RETURN_MS / 50 - 1; i++) expect(sequence.advance(50)).toBe(false);
    expect(sequence.advance(50)).toBe(true);
    for (let i = 0; i < 100; i++) expect(sequence.advance(50)).toBe(false);
    sequence.reset();
    expect(sequence.active).toBe(false);
    expect(sequence.start()).toBe(true);
  });
});

describe('consumption presentation signals', () => {
  it('emits the actual consumed item only after it commits, including in town', () => {
    const model = session();
    model.health = 20;
    model.useInventoryItem('healing-bottle', player);
    expect(model.lastConsumption).toBeNull();
    for (let i = 0; i < 14; i++) model.tickSupplies(0.05, player);
    const signal = model.lastConsumption;
    expect(signal?.itemId).toBe('healing-bottle');
    expect(itemCount(model.getInventory(), 'healing-bottle')).toBe(1);
    for (let i = 0; i < 20; i++) model.tickSupplies(0.05, player);
    expect(model.lastConsumption).toBe(signal);
    model.arrive(model.traveler(), player);
    expect(model.lastConsumption).toBeNull();
  });
  it('never plays a successful consumption effect for interrupted food', () => {
    const model = session();
    model.health = 20;
    model.useInventoryItem('roasted-meat', player);
    model.tickSupplies(0.05, { x: 110, y: 100 });
    for (let i = 0; i < 90; i++) model.tickSupplies(0.05, player);
    expect(model.lastConsumption).toBeNull();
    expect(itemCount(model.getInventory(), 'roasted-meat')).toBe(2);
  });
});
