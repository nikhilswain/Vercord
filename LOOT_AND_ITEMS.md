# Mosswild supplies: current gameplay

Implemented preparation loop — September 20, 2026.

The full approved direction and later phases are in
[Alchemy and Provisions](ALCHEMY_AND_PROVISIONS.md).

Weapon ownership and proposed reward sources are documented in
[Weapon progression](WEAPON_PROGRESSION.md). Every traveler now starts with one
Practice weapon per family; higher-tier weapons are not yet in the loot tables.

## Collect, prepare, explore

Defeated creatures leave small item icons. Walk close and press **F**, or tap
**Pick up**, to collect a stack. **E** gathers plants, opens a nearby station or
opens a guardian's supply cache. **I** opens inventory and its **Recipes** tab.

The town has a **Provisions courtyard** away from channel houses and the forest
gate. Its working brewing bench and cooking hearth are also map destinations.
Collect the welcome resin, herb and mushroom once, then try a Healing Bottle and
Pan Mushrooms. Both recipes are known from the start.

Forest camps have animated cooking/brewing pots, furniture and a small supply
garden. Cooking hearths offer **free rest** outside combat. No fuel, empty bottle,
hunger or glass-collecting chores are required.

## What drops where

| Source                                          | Reward                                             | Use                                                   |
| ----------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| Slime, any color                                | 1 Slime Resin                                      | Healing Bottle                                        |
| Forest skirmisher / brute                       | 1 / 2 Emberleaf                                    | Battle Bottle                                         |
| Venus Trap                                      | 1 Thornseed                                        | Battle Bottle                                         |
| Blue Death                                      | 1 Spark Pollen                                     | Swiftstep Bottle                                      |
| Plant guardian / Root Beast                     | 3 Thornseed                                        | Battle Bottle                                         |
| Ordinary forest guardian's cache                | Choose 1 known bottle; healing is always available | Useful preparation after a tougher fight              |
| Rabbit / fox / snake                            | 1 Raw Meat                                         | Roasted Meat or Trail Stew                            |
| Deer / boar / wolf                              | 2 Raw Meat                                         | Roasted Meat or Trail Stew                            |
| Stag / bear                                     | 3 / 4 Raw Meat                                     | Roasted Meat or Trail Stew                            |
| Bird                                            | 1 Raw Fowl                                         | Same cooking alternatives as meat                     |
| Leafy green herb plants                         | 1 Healing Herb                                     | Raw recovery or Healing Bottle                        |
| Pale Moonblossoms                               | 1 Moonblossom                                      | Swiftstep Bottle                                      |
| Forest mushrooms                                | 1 Forest Mushroom                                  | Pan Mushrooms, Broth or Trail Stew; no hunting needed |
| Emberleaf plants                                | 1 Emberleaf                                        | Alternative to fighting for Battle ingredients        |
| Pool edges / restored gardens                   | 1 Rivercress                                       | Trail Stew                                            |
| Temple west reliquary, after freeing the keeper | Mira's field notes                                 | Return to Mira; existing protected story reward       |
| Everyone starts with it                         | Hearthstone                                        | **G** returns to town; permanent and reusable         |

Plant guardians in the authored temple retain their story encounter rules; they
are not renewable cache farms. The keeper is not an enemy or ingredient source.
Old hides/feathers stay in saved bags but no longer appear as routine drops until
they have real project uses.

## Seven recipes

| Recipe           | Cost                                    | Effect                                      | Learn it                      |
| ---------------- | --------------------------------------- | ------------------------------------------- | ----------------------------- |
| Healing Bottle   | 1 Resin + 1 Herb                        | Restore 70% of effective maximum HP         | Known initially               |
| Battle Bottle    | 1 Thornseed + 1 Emberleaf               | +20% weapon/spell damage for 3 minutes      | Restore Juniper's Verge bench |
| Swiftstep Bottle | 1 Spark Pollen + 1 Moonblossom          | +25% movement for 3 minutes                 | Help Oren's Lantern Wood camp |
| Roasted Meat     | 1 Meat **or** Fowl                      | Heal 25; +10% base maximum HP for 5 minutes | Known initially               |
| Pan Mushrooms    | 1 Mushroom                              | Same benefit as roast, without hunting      | Known initially               |
| Trail Stew       | Any 2 Meat/Fowl/Mushroom + 1 Rivercress | Heal 40; +20% base maximum HP for 5 minutes | Restore the Alder Run garden  |

| Mushroom Broth | 1 Forest Mushroom | Heal 25; no buff or cooldown | Known initially |

Use a brewing bench for bottles and a cooking hearth for food. The recipe book is
readable anywhere, but does not secretly craft away from a station. Each batch is
1–20 items and validates all costs and output capacity before spending anything.
The first preparation has a short skippable presentation; repeat batches are instant.
Repeated delivery of the same action cannot spend the batch twice.

### Permanent early camp rewards

- **Verge:** give 2 Resin + 1 Emberleaf. The brewing corner warms up, the garden
  becomes gatherable, and you learn Battle Bottle and receive one sample.
- **Alder Run:** give 1 Rivercress + 1 Mushroom. Restore its garden, learn Trail
  Stew and receive one meal.
- **Lantern Wood:** give 1 Spark Pollen + 1 Moonblossom. Learn Swiftstep and receive
  one sample.

Each request can be completed once. Its recipe stays known at other eligible
stations. These requests are optional; they do not gate the existing temple story.
The richer crossing/scouting quests remain the next story phase.

## Using preparations

- Raw herbs heal **40 HP**. Herbs and Healing Bottles share a **20-second recovery
  cooldown**. Choose either for **H** in its inventory detail; an empty selected
  stack never silently consumes the other item.
- Bottles/herbs take **0.6 seconds standing still**. Choose Battle or Swiftstep for
  **B**. A common **3-second use cooldown** prevents rapid consumption.
- Food takes **4 seconds standing still**, after **10 seconds outside combat**.
  Meals have a **60-second consumption cooldown**. Raw food is inedible.
- Keep **one meal and one bottle buff**. Another type replaces the existing effect;
  the same active bottle is refused. Food gives a higher cap plus only its stated
  healing, never a free refill. Expiry clamps excess HP without damage or death.
- Moving, attacking or being hit interrupts preparation use without spending it.
  Full-health recovery and invalid uses spend nothing.
- Defeat ends the current visit and returns the traveler to their server town. Death clears the short bottle buff. Town recovery preserves remaining
  meal time. Durations/cooldowns persist between areas and sessions; offline time
  pauses them. Connected menus continue their timers.

Small HUD icons show the current meal and buff. Recipe tracking shows ingredient
counts; **Guide me to a source** is an explicit navigation choice. Tracking alone
never starts a golden trail.

## Repeat visits and saved supplies

Common forest creatures and gathered plants become eligible to renew after
**20 minutes**. Renewal waits while visible, within 1,200 pixels of a traveler,
during combat, or while that creature still has unclaimed loot/cache contents.
Only its existing territory is reused; balanced enemy locations are not rerolled.
Story bosses, unique rewards and authored temple encounters never renew.

Drops remain through travel/reload. Full stacks leave excess on the ground.
Renewals carry a cycle ID, so reloading cannot recreate old reward claims.
Legacy defeated encounters wait one full renewal interval; they do not immediately
produce replacement loot on the first load.

The catalog upgrade converts each **Resin Wrap → Healing Bottle** and
**Trailcloth → Emberleaf**, preserving quantities and old pending claim IDs.
Overflow stays saved and moves into a stack when there is space. Resin, food,
herbs, the Hearthstone and story progress are preserved.

This is still the existing **personal local adventure save**, not trusted shared
multiplayer inventory/loot authority. No database or hosting migration is included.
See [Backend Architecture](BACKEND_ARCHITECTURE.md) for that later work.

## Art and future work

Herbs now use the distinct broad-leaf **CC0 Herb Icons** plant, shared by the world,
backpack and H control. Rivercress has a different sprig silhouette. New bottle,
seed, mushroom, meat and cache icons reuse the documented 7Soul set. Station pots
reuse animated LPC Revised art. Unmodified sources, authors, licenses and hashes
are in [inventory credits](public/game-assets/inventory-icons/CREDITS.md) and
[house asset credits](public/game-assets/house-v2/CREDITS.md).

The approved follow-up is a river-crossing reward, a dedicated temple preparation
camp, authored collection discoveries and the lantern's first useful puzzle.
Antidotes, defense bottles, Lastlight rescue, party revival and advanced meals
remain planned until their required gameplay systems exist. Their candidate icons
do not imply those effects can already be obtained.

Consume food and bottles in adventure only. Town still supports cooking and brewing.
Active effects continue counting down in town, with their HUD hidden. Buff meals
cannot be refreshed or replaced while active. Broth takes 4 seconds to eat outside
combat, can be eaten again immediately afterwards, and does not change an active
meal or bottle cooldown.
