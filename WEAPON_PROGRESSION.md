# Weapons: current rules and proposed rewards

## Available now

Every traveler owns a Practice sword, Practice axe, Practice spear and Practice
staff from level 1. Inventory → Weapons has a tab for each family. The sword is
equipped initially; choosing another weapon does not spend an item.

Existing sword-only saves receive the missing starters when loaded. Earned
weapons, the equipped choice, XP, supplies and story progress are preserved.
Reloading does not create duplicate weapons.

The catalog contains six tiers in each of four families. These are the existing
**levels required to equip** each tier, not automatic level-up rewards:

| Tier | Required level | Current acquisition                              |
| ---- | -------------- | ------------------------------------------------ |
| 1    | 1              | All four Practice weapons are starting equipment |
| 2    | 2              | Not yet assigned to a live reward source         |
| 3    | 4              | Not yet assigned to a live reward source         |
| 4    | 7              | Not yet assigned to a live reward source         |
| 5    | 10             | Not yet assigned to a live reward source         |
| 6    | 15             | Not yet assigned to a live reward source         |

The original combat demo permits all 24 weapons for testing. Saved server
adventures require ownership and the level requirement. Ordinary creature loot,
guardian supply caches and existing temple rewards do not award weapons yet.

Ember now awakens at **level 10**, Tide at **level 16**. Each retains its independent
two-minute cooldown. Unlocks and UI labels come from `SPELL_DEFINITIONS`.

## Recommended direction — not implemented yet

**Earn weapons through exploration and accomplishments, with modest level
requirements.** Leveling should develop the traveler; obtaining a weapon should
reward a memorable place, puzzle, encounter or NPC relationship.

- Early upgrades: clearly signposted, hand-placed caches near the first camps.
  Guarantee a useful first upgrade; let the player choose the weapon family.
- Middle tiers: regional puzzles, restored camps and NPC quest rewards. Keep a
  predictable way to earn an upgrade in the player's preferred family.
- Rare tiers: tougher guardians, temple milestones and secret rooms. Random
  bonus drops can supplement guaranteed milestone rewards.
- Ordinary enemies: ingredients and useful supplies, rather than constant weapon
  clutter or mandatory repeated killing for one lucky drop.
- Later crafting: provide a deliberate alternative using materials from relevant
  regions. Do not introduce a new currency or recipe until its station exists.

Keep the present level requirements as provisional tuning. Scale encounter
difficulty and reward placement together; a rare discovery should be useful
soon, rather than spending hours locked in the bag. A reward does not silently
change the equipped weapon.

This recommendation takes cues from [Guild Wars 2's equipment acquisition](https://wiki.guildwars2.com/wiki/Equipment)
and [Terraria's exploration progression](https://terraria.wiki.gg/wiki/Guide:Game_progression):
multiple acquisition paths and discoveries give players reasons to explore.
The exact reward placements above are a proposal for Dmap, not a copied loot table.

## Implementation ownership

`domain/adventure/weapons.ts` owns weapon balance and starter IDs;
`domain/adventure/equipment.ts` owns ownership, save migration and equip rules.
`grantWeapon` is the shared grant operation, but no reward source calls it yet.
`WeaponInventory` displays owned equipment and its required level.

When adding real reward sources, persist each claimed cache/quest/milestone ID
with the weapon grant so reloads cannot duplicate a reward. Retain the portable
domain rules when progression moves to the server and PostgreSQL, as described
in [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md). Request-board quest acceptance
remains the later phase in [TOWN_HALL.md](TOWN_HALL.md).
