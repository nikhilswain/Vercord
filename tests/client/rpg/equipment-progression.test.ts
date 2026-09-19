import { describe, expect, it } from 'vitest';
import {
  createPlayerProgression,
  equipWeapon,
  grantExperience,
  grantWeapon,
} from '../../../src/domain/adventure/equipment';
import { experienceForLevel } from '../../../src/domain/adventure/progression';
import { grantItem, itemCount } from '../../../src/domain/adventure/inventory';
import { AdventureJourney } from '../../../src/features/rpg/adventure/journey';

describe('starting equipment', () => {
  it('lets a new traveler switch between all four fighting styles at level one', () => {
    const journey = new AdventureJourney();
    for (const weapon of ['axe-0', 'spear-0', 'staff-0', 'sword-0']) {
      expect(journey.supplies.equip(weapon)).toBe(true);
      expect(journey.supplies.status().weaponId).toBe(weapon);
      expect(journey.supplies.status().level).toBe(1);
    }
    expect(journey.supplies.status().equipment.ownedWeaponIds).toHaveLength(4);
    expect(journey.supplies.equip('sword-1')).toBe(false);
  });

  it('upgrades old saved bags without losing earned weapons, equipment, supplies or cooldowns', () => {
    const previous = new AdventureJourney().snapshot();
    const legacy = {
      ...previous,
      traveler: {
        ...previous.traveler,
        progression: {
          version: 1,
          experience: experienceForLevel(7),
          ownedWeaponIds: ['sword-0', 'axe-2', 'axe-2', 'unknown-weapon'],
          equippedWeaponId: 'axe-2',
        },
        inventory: grantItem(previous.traveler.inventory, 'raw-meat', 4),
        health: 66,
        spellCooldowns: { fire: 72, water: 50 },
      },
    };
    const upgraded = new AdventureJourney({ snapshot: legacy }).snapshot();
    expect(new Set(upgraded.traveler.progression.ownedWeaponIds)).toEqual(
      new Set(['sword-0', 'axe-0', 'spear-0', 'staff-0', 'axe-2']),
    );
    expect(upgraded.traveler.progression.equippedWeaponId).toBe('axe-2');
    expect(upgraded.traveler.progression.experience).toBe(experienceForLevel(7));
    expect(upgraded.traveler.health).toBe(66);
    expect(upgraded.traveler.spellCooldowns).toEqual({ fire: 72, water: 50 });
    expect(itemCount(upgraded.traveler.inventory, 'raw-meat')).toBe(4);
    expect(new AdventureJourney({ snapshot: upgraded }).snapshot()).toEqual(upgraded);
  });

  it('still requires both ownership and the required level for an advanced weapon', () => {
    const starter = createPlayerProgression();
    const experienced = grantExperience(starter, experienceForLevel(15));
    expect(experienced.ownedWeaponIds).toEqual(starter.ownedWeaponIds);
    expect(equipWeapon(experienced, 'sword-5')).toEqual({ success: false, reason: 'unowned' });
    expect(equipWeapon(grantWeapon(starter, 'sword-5'), 'sword-5')).toEqual({
      success: false,
      reason: 'level',
    });
    const rewarded = grantWeapon(experienced, 'sword-5');
    expect(rewarded.equippedWeaponId).toBe('sword-0');
    expect(equipWeapon(rewarded, 'sword-5').success).toBe(true);
  });
});
