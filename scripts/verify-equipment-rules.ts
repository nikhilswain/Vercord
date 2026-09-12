import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPlayerProgression,
  DEMO_EQUIPMENT_POLICY,
  equipWeapon,
  grantExperience,
  grantWeapon,
  sanitizePlayerProgression,
} from '../src/domain/adventure/equipment';
import {
  getWeaponDefinition,
  WEAPONS,
  weaponDamage,
  weaponSpellBonus,
} from '../src/domain/adventure/weapons';
import { DEMO_WEAPONS, getDemoWeapon } from '../src/features/rpg/demo/equipment';

test('a new profile owns and equips only the starter sword and is JSON serializable', () => {
  const profile = createPlayerProgression();
  assert.deepEqual(profile, {
    version: 1,
    experience: 0,
    ownedWeaponIds: ['sword-0'],
    equippedWeaponId: 'sword-0',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(profile)), profile);
  assert.deepEqual(equipWeapon(profile, 'sword-0'), { success: true, profile });
});

test('normal equipment rejects unknown and unowned weapons before checking level', () => {
  const profile = createPlayerProgression();
  assert.deepEqual(equipWeapon(profile, 'sword-6'), { success: false, reason: 'unknown' });
  assert.deepEqual(equipWeapon(profile, 'fire-sword'), { success: false, reason: 'unknown' });
  assert.deepEqual(equipWeapon(profile, '__proto__'), { success: false, reason: 'unknown' });
  assert.deepEqual(equipWeapon(profile, 'axe-0'), { success: false, reason: 'unowned' });
  assert.deepEqual(equipWeapon(profile, 'staff-5'), { success: false, reason: 'unowned' });
});

test('ownership and experience independently gate equipping across all six tiers', () => {
  // Independently calculated XP at levels 1, 2, 4, 7, 10 and 15.
  const unlockExperience = [0, 30, 185, 620, 1325, 3100];
  for (const family of ['sword', 'axe', 'spear', 'staff']) {
    for (const [tier, experience] of unlockExperience.entries()) {
      const id = `${family}-${tier}`;
      let profile = grantWeapon(createPlayerProgression(), id);
      if (experience > 0) {
        const beforeUnlock = grantExperience(profile, experience - 1);
        assert.deepEqual(equipWeapon(beforeUnlock, id), { success: false, reason: 'level' }, id);
      }
      profile = grantExperience(profile, experience);
      const result = equipWeapon(profile, id);
      assert.equal(result.success, true, id);
      if (result.success) assert.equal(result.profile.equippedWeaponId, id);
      assert.equal(profile.equippedWeaponId, 'sword-0', 'input profile was mutated');
    }
  }
});

test('the explicit demo policy bypasses ownership and level without granting either', () => {
  const profile = createPlayerProgression();
  const result = equipWeapon(profile, 'staff-5', DEMO_EQUIPMENT_POLICY);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.profile, { ...profile, equippedWeaponId: 'staff-5' });
  assert.deepEqual(profile.ownedWeaponIds, ['sword-0']);
  assert.equal(profile.experience, 0);
  assert.deepEqual(equipWeapon(profile, 'staff-6', DEMO_EQUIPMENT_POLICY), {
    success: false,
    reason: 'unknown',
  });
});

test('grants are immutable, duplicate-safe and reject invalid reward values', () => {
  const profile = createPlayerProgression();
  const owned = grantWeapon(profile, 'spear-0');
  assert.deepEqual(owned.ownedWeaponIds, ['sword-0', 'spear-0']);
  assert.deepEqual(grantWeapon(owned, 'spear-0'), owned);
  assert.deepEqual(grantWeapon(owned, 'spear-9'), owned);
  assert.deepEqual(profile.ownedWeaponIds, ['sword-0']);
  assert.equal(grantExperience(profile, 30.9).experience, 30);
  for (const invalid of [-1, NaN, Infinity, -Infinity]) {
    assert.deepEqual(grantExperience(profile, invalid), profile);
  }
  const maximum = grantExperience(profile, Number.MAX_VALUE);
  assert.equal(maximum.experience, Number.MAX_SAFE_INTEGER);
  assert.equal(grantExperience(maximum, 100).experience, Number.MAX_SAFE_INTEGER);
});

test('saved-data sanitization rejects invalid versions and repairs corrupt fields', () => {
  const starter = createPlayerProgression();
  for (const invalid of [null, [], 'profile', 17, {}, { version: 2 }, { version: '1' }]) {
    assert.deepEqual(sanitizePlayerProgression(invalid), starter);
  }
  assert.deepEqual(
    sanitizePlayerProgression({
      version: 1,
      experience: 30.9,
      ownedWeaponIds: ['axe-1', 'axe-1', 'sword-6', {}, null, 'staff-5'],
      equippedWeaponId: 'axe-1',
      injectedField: 'ignored',
    }),
    {
      version: 1,
      experience: 30,
      ownedWeaponIds: ['sword-0', 'axe-1', 'staff-5'],
      equippedWeaponId: 'axe-1',
    },
  );
  for (const experience of [-10, '999', NaN, Infinity]) {
    assert.deepEqual(
      sanitizePlayerProgression({ version: 1, experience, ownedWeaponIds: false }),
      starter,
    );
  }
  assert.equal(
    sanitizePlayerProgression({ version: 1, experience: Number.MAX_VALUE }).experience,
    Number.MAX_SAFE_INTEGER,
  );
});

test('saved equipment is checked against the selected policy instead of trusting its ID', () => {
  const locked = {
    version: 1,
    experience: 0,
    ownedWeaponIds: ['sword-5'],
    equippedWeaponId: 'sword-5',
  };
  assert.equal(sanitizePlayerProgression(locked).equippedWeaponId, 'sword-0');
  assert.equal(
    sanitizePlayerProgression(locked, DEMO_EQUIPMENT_POLICY).equippedWeaponId,
    'sword-5',
  );
  const unowned = { version: 1, experience: 3100, ownedWeaponIds: [], equippedWeaponId: 'staff-5' };
  assert.equal(sanitizePlayerProgression(unowned).equippedWeaponId, 'sword-0');
  assert.equal(
    sanitizePlayerProgression(unowned, DEMO_EQUIPMENT_POLICY).equippedWeaponId,
    'staff-5',
  );
  assert.equal(
    sanitizePlayerProgression({ ...unowned, equippedWeaponId: 'staff-6' }, DEMO_EQUIPMENT_POLICY)
      .equippedWeaponId,
    'sword-0',
  );
});

test('every catalog weapon has a matching presentation entry and resolves without fallback', () => {
  assert.equal(WEAPONS.length, 24);
  assert.equal(new Set(WEAPONS.map((weapon) => weapon.id)).size, 24);
  assert.equal(DEMO_WEAPONS.length, 24);
  for (const weapon of WEAPONS) {
    assert.match(weapon.id, /^(sword|axe|spear|staff)-[0-5]$/);
    assert.equal(getWeaponDefinition(weapon.id)?.id, weapon.id);
    const presentation = getDemoWeapon(weapon.id);
    assert.equal(presentation.id, weapon.id);
    assert.equal(presentation.damage, weaponDamage(weapon));
    assert.equal(presentation.spellBonus, weaponSpellBonus(weapon));
    assert.ok(presentation.imageUrl.endsWith(`/${weapon.id}.png`));
    assert.ok(weapon.impactMs > 0 && weapon.impactMs < weapon.animationMs);
    assert.ok(weapon.animationMs <= weapon.cooldownMs);
  }
  assert.equal(getWeaponDefinition('unknown'), undefined);
  assert.equal(getDemoWeapon('unknown').id, 'sword-0');
  assert.equal(getDemoWeapon('staff-2').name, 'White staff');
  assert.equal(getDemoWeapon('axe-1').name, 'Woodcutter axe');
  assert.equal(weaponDamage(getWeaponDefinition('sword-5')!), 57);
  assert.equal(weaponSpellBonus(getWeaponDefinition('staff-5')!), 18);
  assert.equal(weaponSpellBonus(getWeaponDefinition('sword-5')!), 0);
});
