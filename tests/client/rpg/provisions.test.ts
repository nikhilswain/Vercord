import { createPlayerProgression } from '../../../src/domain/adventure/equipment';
import { experienceForLevel } from '../../../src/domain/adventure/progression';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Provisions, derivedStats } from '../../../src/domain/adventure/provisions';
import {
  createInventory,
  grantItem,
  itemCount,
  sanitizeInventory,
  type ItemId,
} from '../../../src/domain/adventure/inventory';
import { craftItem } from '../../../src/domain/adventure/crafting';
import { completeCampProject } from '../../../src/domain/adventure/camp-projects';
import { AdventureSession } from '../../../src/features/rpg/adventure/session';
import { AdventureJourney } from '../../../src/features/rpg/adventure/journey';
import { SUPPLY_RENEWAL_MS } from '../../../src/domain/adventure/renewal';
import {
  presentForest,
  PREVIEW_FOREST_SEED,
  withForestTrail,
} from '../../../src/features/rpg/forest/presentation';
import { footprint, overlaps } from '../../../src/domain/world/geometry';
import { RpgSimulation } from '../../../src/features/rpg/simulation';
import { getRpgSample } from '../../../src/features/rpg/sample-worlds';

const player = { x: 100, y: 100 };
function bag(...entries: [ItemId, number][]) {
  return entries.reduce((inv, [id, q]) => grantItem(inv, id, q), createInventory());
}
function use(model: Provisions, id: ItemId, health = 50) {
  let inventory = bag([id, 3]);
  expect(model.begin(id, inventory, health, player).success).toBe(true);
  for (let i = 0; i < 81; i++) {
    const result = model.tick(0.05, player, inventory, health);
    inventory = result.inventory;
    health = result.health;
  }
  return { inventory, health };
}
afterEach(() => vi.useRealTimers());
describe('preparation effects', () => {
  it.each(['melee', 'fire'] as const)('Battle Bottle improves actual %s hits', (mode) => {
    const damage = (boosted: boolean) => {
      const model = new AdventureSession(
        {
          enemies: [{ id: 'target', kind: 'forest-brute', x: 124, y: 100 }],
          flowers: [],
          water: [],
        },
        [],
        { x: 0, y: 0, width: 1000, height: 1000 },
        player,
        undefined,
        { progression: { ...createPlayerProgression(), experience: experienceForLevel(15) } },
      );
      model.enemies[0]!.health = 1000;
      model.invincibleUntil = Infinity;
      if (boosted) model.provisions.state.buff = { id: 'battle-bottle', remaining: 180 };
      if (mode === 'melee') model.selectMelee();
      else {
        model.selectSpell('fire');
        expect(model.combatMode).toBe('fire');
      }
      model.attack(player, 'right');
      for (let i = 0; i < 30; i++) model.tick(0.05, player);
      return 1000 - model.enemies[0]!.health;
    };
    const normal = damage(false),
      prepared = damage(true);
    expect(normal).toBeGreaterThan(0);
    expect(prepared).toBeGreaterThan(normal);
  });
  it('heals 70% of the effective cap and shares recovery cooldown with herbs', () => {
    const model = new Provisions();
    model.state.meal = { id: 'trail-stew', remaining: 1800 };
    const result = use(model, 'healing-bottle', 20);
    expect(result.health).toBe(104);
    expect(itemCount(result.inventory, 'healing-bottle')).toBe(2);
    expect(model.begin('healing-herb', result.inventory, 104, player)).toMatchObject({
      success: false,
      reason: 'cooldown',
    });
  });
  it('does not consume full-health recovery, raw food or unavailable items', () => {
    const model = new Provisions();
    const inventory = bag(['raw-meat', 1]);
    expect(model.begin('healing-herb', inventory, 100, player)).toMatchObject({
      reason: 'full-health',
    });
    expect(model.begin('raw-meat', inventory, 50, player)).toMatchObject({ reason: 'cooking' });
    expect(model.begin('battle-bottle', inventory, 50, player)).toMatchObject({
      reason: 'missing',
    });
    expect(itemCount(inventory, 'healing-herb')).toBe(1);
  });
  it('spends once at completion and cancels on movement without consuming', () => {
    const model = new Provisions(),
      inventory = bag(['healing-bottle', 2]);
    model.begin('healing-bottle', inventory, 20, player);
    expect(model.begin('healing-bottle', inventory, 20, player)).toMatchObject({ reason: 'busy' });
    expect(model.tick(0.2, player, inventory, 20).inventory).toBe(inventory);
    expect(model.tick(0.4, { x: 110, y: 100 }, inventory, 20)).toMatchObject({
      health: 20,
      canceled: true,
    });
    expect(model.state.recoveryCooldown).toBe(0);
  });
  it('meals add a cap but do not fill the bonus for free; expire without damage', () => {
    const model = new Provisions();
    const result = use(model, 'trail-stew', 60);
    expect(result.health).toBe(100);
    expect(model.stats.maxHealth).toBe(120);
    model.state.meal!.remaining = 0.05;
    expect(model.tick(0.1, player, result.inventory, 120).health).toBe(100);
    expect(model.stats.maxHealth).toBe(100);
  });
  it('prevents eating during combat and cancels a meal on taking a hit', () => {
    const model = new Provisions(),
      inventory = bag(['trail-stew', 1]);
    model.combat();
    expect(model.begin('trail-stew', inventory, 50, player)).toMatchObject({ reason: 'combat' });
    model.state.combatRemaining = 0;
    model.begin('trail-stew', inventory, 50, player);
    model.tick(1, player, inventory, 50);
    model.combat();
    expect(model.pending).toBeNull();
    expect(itemCount(inventory, 'trail-stew')).toBe(1);
  });
  it('allows one meal and one buff; switching bottles replaces instead of stacking', () => {
    const model = new Provisions();
    use(model, 'battle-bottle');
    expect(model.stats.damage).toBe(1.2);
    expect(model.stats.movement).toBe(1);
    expect(model.begin('battle-bottle', bag(['battle-bottle', 1]), 50, player)).toMatchObject({
      reason: 'already-active',
    });
    use(model, 'swiftstep-bottle');
    expect(model.stats.damage).toBe(1);
    expect(model.stats.movement).toBe(1.25);
    use(model, 'roasted-meat');
    expect(model.stats.maxHealth).toBe(110);
    expect(model.stats.movement).toBe(1.25);
    model.defeat();
    expect(model.stats.movement).toBe(1);
    expect(model.stats.maxHealth).toBe(110);
  });
  it('restores remaining effects/cooldowns without extending them or trusting arbitrary effects', () => {
    const model = new Provisions();
    use(model, 'swiftstep-bottle');
    model.state.recoveryCooldown = 13;
    const saved = model.snapshot();
    expect(new Provisions(saved).snapshot()).toEqual(saved);
    saved.meal = { id: 'hearth-stone', remaining: 999 };
    expect(derivedStats(new Provisions(saved).state).maxHealth).toBe(100);
  });
});
describe('recipes and migration', () => {
  it('rejects a repeated craft request after save/load without spending more ingredients', () => {
    const model = new AdventureSession(
      { enemies: [], flowers: [], water: [] },
      [],
      { x: 0, y: 0, width: 1000, height: 1000 },
      player,
      undefined,
      { inventory: bag(['slime-resin', 3], ['healing-herb', 3]) },
    );
    const access = { station: 'brew' as const, learned: [] };
    expect(model.craftInventoryItem('healing-bottle', access, 'test-craft-1').success).toBe(true);
    const saved = model.traveler();
    const reload = new AdventureSession(
      { enemies: [], flowers: [], water: [] },
      [],
      { x: 0, y: 0, width: 1000, height: 1000 },
      player,
    );
    reload.arrive(saved, player);
    const before = reload.getInventory();
    expect(reload.craftInventoryItem('healing-bottle', access, 'test-craft-1')).toMatchObject({
      reason: 'duplicate',
    });
    expect(reload.getInventory()).toEqual(before);
  });
  it('requires the correct physical station, learned formula and whole batch capacity', () => {
    const inv = bag(['thornseed', 5], ['emberleaf', 5]);
    expect(craftItem(inv, 'battle-bottle')).toMatchObject({ reason: 'station' });
    expect(craftItem(inv, 'battle-bottle', { station: 'cook', learned: [] })).toMatchObject({
      reason: 'station',
    });
    expect(craftItem(inv, 'battle-bottle', { station: 'brew', learned: [] })).toMatchObject({
      reason: 'locked',
    });
    expect(
      craftItem(inv, 'battle-bottle', { station: 'brew', learned: ['battle-bottle'], quantity: 0 }),
    ).toMatchObject({ reason: 'quantity' });
    const result = craftItem(inv, 'battle-bottle', {
      station: 'brew',
      learned: ['battle-bottle'],
      quantity: 3,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(itemCount(result.inventory, 'battle-bottle')).toBe(3);
    expect(itemCount(result.inventory, 'thornseed')).toBe(2);
    const full = grantItem(inv, 'battle-bottle', 9999);
    expect(
      craftItem(full, 'battle-bottle', { station: 'brew', learned: ['battle-bottle'] }),
    ).toMatchObject({ reason: 'full' });
    expect(itemCount(full, 'thornseed')).toBe(5);
  });
  it('uses mixed meat/fowl in a batch; failed recipes spend nothing', () => {
    const inv = bag(['raw-meat', 2], ['raw-fowl', 2]);
    const result = craftItem(inv, 'roasted-meat', { station: 'cook', learned: [], quantity: 4 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(itemCount(result.inventory, 'roasted-meat')).toBe(4);
    expect(itemCount(result.inventory, 'raw-fowl')).toBe(0);
    expect(
      craftItem(inv, 'roasted-meat', { station: 'cook', learned: [], quantity: 5 }),
    ).toMatchObject({ reason: 'ingredients' });
    expect(itemCount(inv, 'raw-meat')).toBe(2);
  });
  it('retires wraps and converts legacy stacks exactly once, retaining overflow', () => {
    const old = bag(
      ['resin-wrap', 3],
      ['trailcloth', 4],
      ['healing-bottle', 9998],
      ['wild-hide', 2],
    );
    const upgraded = sanitizeInventory(old);
    expect(itemCount(upgraded, 'resin-wrap')).toBe(0);
    expect(itemCount(upgraded, 'emberleaf')).toBe(4);
    expect(itemCount(upgraded, 'healing-bottle')).toBe(9999);
    expect(upgraded.overflow).toEqual([{ id: 'healing-bottle', quantity: 2 }]);
    expect(sanitizeInventory(upgraded)).toEqual(upgraded);
    expect(itemCount(upgraded, 'wild-hide')).toBe(2);
    expect(craftItem(old, 'resin-wrap')).toMatchObject({ reason: 'unknown-recipe' });
  });
  it('camp help permanently unlocks the formula and gives one preparation exactly once', () => {
    const state = new Provisions().state;
    const inv = bag(['slime-resin', 2], ['emberleaf', 1]);
    const result = completeCampProject(inv, state, 'verge');
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.state.learned).toContain('battle-bottle');
    expect(result.state.projects).toContain('verge-bench');
    expect(itemCount(result.inventory, 'battle-bottle')).toBe(1);
    expect(completeCampProject(result.inventory, result.state, 'verge')).toBeNull();
  });
});
describe('persistent expedition supplies', () => {
  it('a guardian cache offers one learned bottle, survives reload, and prevents renewal until claimed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    const guardianContent = {
      simulationRadius: 1100,
      enemies: [{ id: 'guardian', kind: 'guardian' as const, x: 420, y: 400 }],
      flowers: [],
      water: [],
    };
    const model = new AdventureSession(
      guardianContent,
      [],
      { x: 0, y: 0, width: 4000, height: 4000 },
      player,
    );
    const enemy = model.enemies[0]!;
    enemy.health = 1;
    model.invincibleUntil = Infinity;
    model.selectMelee();
    const attacker = { x: enemy.x - 24, y: enemy.y };
    model.attack(attacker, 'right');
    for (let i = 0; i < 30; i++) model.tick(0.05, attacker);
    expect(enemy.health).toBe(0);
    for (const drop of [...model.loot]) model.pickupLoot(drop);
    model.provisions.state.combatRemaining = 0;
    const cache = model.guardianCaches()[0]!;
    expect(cache).toBeDefined();
    model.renewSupplies(Date.now() + SUPPLY_RENEWAL_MS + 1, [{ x: 3000, y: 3000 }]);
    expect(enemy.health).toBe(0);
    expect(model.takeCache(cache.id, 'swiftstep-bottle', cache)).toBeTruthy();
    expect(model.takeCache(cache.id, 'healing-bottle', cache)).toBeNull();
    expect(model.takeCache(cache.id, 'healing-bottle', cache)).toBeTruthy();
    expect(itemCount(model.getInventory(), 'healing-bottle')).toBe(1);
    const reload = new AdventureSession(
      guardianContent,
      [],
      { x: 0, y: 0, width: 4000, height: 4000 },
      player,
    );
    reload.arrive(model.traveler(), player);
    reload.restoreEncounters(model.encounterSnapshot());
    expect(reload.guardianCaches()).toHaveLength(0);
    reload.renewSupplies(Date.now() + SUPPLY_RENEWAL_MS + 2000, [{ x: 3000, y: 3000 }]);
    expect(reload.enemies[0]!.health).toBeGreaterThan(0);
    const legacy = new AdventureSession(
      guardianContent,
      [],
      { x: 0, y: 0, width: 4000, height: 4000 },
      player,
    );
    legacy.restoreEncounters({
      defeated: ['guardian'],
      rewarded: ['guardian'],
      gathered: [],
      loot: [],
    });
    expect(legacy.guardianCaches()).toHaveLength(0);
  });
  it('upgrades a real v1 save with no provisions field without resetting items or story', () => {
    const snapshot = {
      version: 1,
      traveler: {
        inventory: {
          version: 1,
          stacks: [
            { id: 'raw-meat', quantity: 3 },
            { id: 'trailcloth', quantity: 4 },
            { id: 'resin-wrap', quantity: 2 },
          ],
        },
        progression: {},
        health: 52,
        herbs: 0,
        spell: 'fire',
        combatMode: 'melee',
      },
      story: ['temple:entered'],
      visited: ['verge'],
      discovered: ['verge-site-0'],
      areas: [],
    };
    const journey = new AdventureJourney({ snapshot });
    expect(itemCount(journey.supplies.getInventory(), 'raw-meat')).toBe(3);
    expect(itemCount(journey.supplies.getInventory(), 'emberleaf')).toBe(4);
    expect(itemCount(journey.supplies.getInventory(), 'healing-bottle')).toBe(2);
    expect(journey.supplies.health).toBe(52);
    expect(journey.snapshot().story).toContain('temple:entered');
    expect(journey.snapshot().discovered).toContain('verge-site-0');
  });

  const content = {
    simulationRadius: 1100,
    enemies: [{ id: 'patrol', kind: 'slime' as const, x: 420, y: 400 }],
    flowers: [{ id: 'plant', kind: 'healing' as const, x: 100, y: 100 }],
    water: [],
  };
  const bounds = { x: 0, y: 0, width: 4000, height: 4000 };
  it('does not reset buff/cooldown through town, portal, save or reload', () => {
    const journey = new AdventureJourney();
    const model = journey.enter('forest:test', content, [], bounds, player, player, {
      durationMs: 700,
      releaseMs: 400,
    });
    model.provisions.state.buff = { id: 'battle-bottle', remaining: 87 };
    model.provisions.state.meal = { id: 'trail-stew', remaining: 700 };
    model.provisions.state.recoveryCooldown = 12;
    model.health = 113;
    journey.leave();
    const snapshot = journey.snapshot();
    const restored = new AdventureJourney({ snapshot });
    expect(restored.supplies.health).toBe(113);
    expect(restored.supplies.provisions.state.buff?.remaining).toBe(87);
    expect(restored.supplies.provisions.state.recoveryCooldown).toBe(12);
    expect(restored.snapshot().areas[0]!.state).toEqual(snapshot.areas[0]!.state);
  });
  it('renews forage only when eligible and unseen, retaining the deadline across reloads', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    const model = new AdventureSession(content, [], bounds, player);
    expect(model.gather(player)).toBe(true);
    const saved = model.encounterSnapshot();
    const reload = new AdventureSession(content, [], bounds, player);
    reload.restoreEncounters(saved);
    expect(reload.encounterSnapshot().renewals).toEqual(saved.renewals);
    const later = Date.now() + SUPPLY_RENEWAL_MS + 1;
    reload.renewSupplies(later, [player]);
    expect(reload.gathered.has('plant')).toBe(true);
    reload.renewSupplies(later + 2000, [{ x: 3000, y: 3000 }], {
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    });
    expect(reload.gathered.has('plant')).toBe(true);
    reload.renewSupplies(later + 4000, [{ x: 3000, y: 3000 }]);
    expect(reload.gathered.has('plant')).toBe(false);
  });
  it('keeps unclaimed drops and never manufactures a second reward on reload', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    const model = new AdventureSession(content, [], bounds, player);
    model.restoreEncounters({
      defeated: ['patrol'],
      rewarded: ['patrol'],
      gathered: [],
      loot: [
        {
          id: 'patrol:loot:0',
          sourceId: 'patrol',
          itemId: 'slime-resin',
          quantity: 1,
          x: 420,
          y: 400,
        },
      ],
    });
    model.renewSupplies(Date.now() + SUPPLY_RENEWAL_MS + 1, [{ x: 3000, y: 3000 }]);
    expect(model.enemies[0]!.health).toBe(0);
    expect(model.loot).toHaveLength(1);
    model.pickupLoot(model.loot[0]!);
    model.renewSupplies(Date.now() + SUPPLY_RENEWAL_MS + 2000, [{ x: 3000, y: 3000 }]);
    expect(model.enemies[0]!.health).toBeGreaterThan(0);
    expect(model.loot).toHaveLength(0);
    expect(model.encounterSnapshot().renewals?.[0]?.cycle).toBe(1);
  });
});
describe('camp geometry and movement', () => {
  it.each(['village', 'norse'] as const)(
    'fits an accessible courtyard in the compact %s preview',
    (theme) => {
      const town = withForestTrail(getRpgSample(theme));
      const simulation = new RpgSimulation(town);
      for (const station of town.provisionStations!) {
        expect(town.colliders.some((box) => overlaps(box, footprint(station)))).toBe(false);
        expect(simulation.navigationPaths.findPath(town.spawn, station).length).toBeGreaterThan(0);
      }
    },
  );
  it('adds reachable stations and distinct, conditionally restored garden nodes', () => {
    const sample = presentForest({
      contentVersion: 'mosswild-v1',
      worldId: PREVIEW_FOREST_SEED,
      seed: PREVIEW_FOREST_SEED,
      region: 'verge',
    });
    expect(sample.provisionStations).toHaveLength(2);
    for (const s of sample.provisionStations!)
      expect(sample.colliders.some((box) => overlaps(box, footprint(s)))).toBe(false);
    expect(sample.adventure!.definition!.flowers.some((f) => f.project === 'verge-bench')).toBe(
      true,
    );
    const sim = new RpgSimulation(sample);
    sim.player = { ...sample.provisionStations![0]! };
    const before = sim.player.x;
    sim.speedMultiplier = 1.25;
    sim.tick(0.05, { x: 0, y: 1, moving: true, sprinting: true });
    expect(sim.player.x).toBe(before);
    expect(sim.player.y).toBeCloseTo(sample.provisionStations![0]!.y + 174 * 1.25 * 0.05);
  });
  it('reserves a town courtyard separate from the forest gate', () => {
    const forest = presentForest({
      contentVersion: 'mosswild-v1',
      worldId: PREVIEW_FOREST_SEED,
      seed: PREVIEW_FOREST_SEED,
      region: 'verge',
    });
    const plain = {
      ...forest,
      provisionStations: undefined,
      forest: undefined,
      forestPortals: undefined,
      adventure: undefined,
    };
    const town = withForestTrail(plain);
    for (const station of town.provisionStations!)
      expect(
        Math.hypot(station.x - town.forestPortals![0]!.x, station.y - town.forestPortals![0]!.y),
      ).toBeGreaterThan(180);
  });
});
