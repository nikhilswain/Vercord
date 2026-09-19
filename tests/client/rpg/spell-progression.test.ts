import { describe, expect, it } from 'vitest';
import { AdventureSession } from '../../../src/features/rpg/adventure/session';
import { AdventureJourney } from '../../../src/features/rpg/adventure/journey';
import { createPlayerProgression } from '../../../src/domain/adventure/equipment';
import { experienceForLevel, levelForExperience } from '../../../src/domain/adventure/progression';
import { SPELL_DEFINITIONS } from '../../../src/domain/adventure/spells';
import type { AdventureDefinition, SpellId } from '../../../src/features/rpg/adventure/types';

const player = { x: 200, y: 200 };
const bounds = { x: 0, y: 0, width: 1000, height: 1000 };
const empty: AdventureDefinition = { enemies: [], flowers: [], water: [] };
const profile = (level: number) => ({
  ...createPlayerProgression(),
  experience: experienceForLevel(level),
});
function session(level: number, content = empty) {
  return new AdventureSession(content, [], bounds, player, undefined, {
    progression: profile(level),
  });
}
function advance(model: AdventureSession, seconds: number) {
  for (let i = 0; i < Math.round(seconds / 0.05); i++) model.tick(0.05, player);
}

describe('adventure spell progression', () => {
  it.each([
    ['fire', 15],
    ['water', 25],
  ] as const)('%s unlocks exactly at level %i, including after restore', (id, level) => {
    const locked = session(level - 1);
    locked.selectSpell(id);
    expect(locked.combatMode).toBe('melee');
    // Old saves selected Ember at level 1. Loading one must leave the player able to fight.
    locked.arrive({ ...locked.traveler(), combatMode: id, spell: id }, player);
    expect(locked.combatMode).toBe('melee');
    const ready = session(level);
    expect(levelForExperience(ready.experience)).toBe(level);
    ready.selectSpell(id);
    expect(ready.attack(player, 'right')).toBe('right');
    expect(ready.cast?.spell).toBe(id);
    expect(ready.spellCooldowns[id]).toBe(120);
  });

  it('keeps independent cooldowns through town, area changes and save/load; melee stays usable', () => {
    const journey = new AdventureJourney({ progression: profile(25) });
    const model = journey.enter('first', empty, [], bounds, player, player, {
      durationMs: 600,
      releaseMs: 200,
    });
    model.selectSpell('fire');
    model.attack(player, 'right');
    advance(model, 1);
    expect(model.attack(player, 'right')).toBeNull();
    model.selectSpell('water');
    expect(model.attack(player, 'right')).toBe('right');
    advance(model, 1);
    model.selectMelee();
    expect(model.attack(player, 'right')).toBe('right');
    journey.leave(true);
    const before = journey.supplies.spellCooldowns.fire;
    for (let i = 0; i < 10; i++) journey.supplies.tickSupplies(1, player);
    expect(journey.supplies.spellCooldowns.fire).toBeCloseTo(before - 10);
    const resumed = new AdventureJourney({ snapshot: journey.snapshot() });
    const second = resumed.enter('second', empty, [], bounds, player, player, {
      durationMs: 600,
      releaseMs: 200,
    });
    expect(second.spellCooldowns).toEqual(journey.supplies.spellCooldowns);
    second.selectSpell('water');
    expect(second.status().castReady).toBe(false);
    for (let i = 0; i < 120; i++) second.tickSupplies(1, player);
    expect(second.attack(player, 'right')).toBe('right');
    expect(second.spellCooldowns.water).toBe(120);
  });

  it('hits equally hard with both spells, at different ranges, with no added burn damage', () => {
    const hit = (spell: SpellId, offset: number) => {
      const model = session(25, {
        ...empty,
        enemies: [{ id: 'target', kind: 'forest-brute', x: player.x + offset, y: player.y }],
      });
      const enemy = model.enemies[0]!;
      enemy.health = enemy.maxHealth = 1000;
      enemy.behavior = { ...enemy.behavior, speed: 0, reach: 0, aggro: 0 };
      model.invincibleUntil = Infinity;
      model.selectSpell(spell);
      model.attack(player, 'right');
      advance(model, 4);
      return { damage: 1000 - enemy.health, burning: enemy.burningUntil };
    };
    const ember = hit('fire', 100),
      tide = hit('water', 100);
    expect(ember.damage).toBeGreaterThanOrEqual(100);
    expect(tide.damage).toBe(ember.damage);
    expect(ember.burning).toBe(0);
    expect(hit('fire', 240).damage).toBe(0);
    expect(hit('water', 240).damage).toBe(tide.damage);
    expect(SPELL_DEFINITIONS.fire.range).toBeLessThan(320);
    expect(SPELL_DEFINITIONS.water.range).toBeGreaterThan(SPELL_DEFINITIONS.fire.range);
  });

  it.each(['slime', 'forest-brute', 'forest-skirmisher', 'wild-rabbit'] as const)(
    'freezes %s movement and attack timing for two seconds',
    (kind) => {
      const model = session(25, { ...empty, enemies: [{ id: 'target', kind, x: 250, y: 200 }] });
      const enemy = model.enemies[0]!;
      enemy.health = enemy.maxHealth = 1000;
      model.invincibleUntil = Infinity;
      model.selectSpell('water');
      model.attack(player, 'right');
      for (let i = 0; i < 60 && !enemy.frozenUntil; i++) model.tick(0.05, player);
      expect(enemy.frozenUntil - model.time).toBeCloseTo(2);
      const position = { x: enemy.x, y: enemy.y },
        attacks = enemy.attackCount;
      const age = model.time - enemy.phaseAt;
      advance(model, 1.95);
      expect({ x: enemy.x, y: enemy.y }).toEqual(position);
      expect(enemy.attackCount).toBe(attacks);
      expect(model.time - enemy.phaseAt).toBeCloseTo(age);
      expect(model.enemyProjectiles).toHaveLength(0);
      advance(model, 0.15);
      expect(model.time).toBeGreaterThan(enemy.frozenUntil);
      advance(model, 1);
      expect(
        enemy.phase !== 'hurt' || Math.hypot(enemy.x - position.x, enemy.y - position.y) > 0,
      ).toBe(true);
    },
  );
});
