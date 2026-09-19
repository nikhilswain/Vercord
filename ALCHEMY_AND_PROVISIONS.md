# Mosswild: brewing, cooking and reasons to explore

**Approved direction; first playable implementation — September 20, 2026.**

The initial preparation loop is implemented. [LOOT_AND_ITEMS.md](LOOT_AND_ITEMS.md)
is the short guide to what currently works. Numbers below are initial playtest
values. The later regional stories and specialized items remain a roadmap.

### Implementation status

- **Working now:** seven recipes; three bottles; meals with temporary vitality; one
  meal and one bottle effect; interruption, replacement and cooldown rules; H
  recovery selection and B buff selection; atomic batches at physical stations;
  a recipe book, ingredient tracking and optional source guidance.
- **Places and rewards:** a separate town provisions courtyard, animated camp
  cauldrons, free camp rest and one-time starter supplies. Juniper's Verge bench
  request restores brewing and a gatherable garden and teaches Battle Bottle.
  Alder Run's garden request teaches Trail Stew. Oren's Lantern Wood supply
  request teaches Swiftstep. These are optional ingredient hand-ins; the authored
  river-crossing puzzle and scouting story below have not been substituted by them.
- **Supplies:** guaranteed species-specific drops, distinct leafy herb artwork,
  mushrooms, Emberleaf and Rivercress; ordinary forest guardians defend a cache
  with one chosen known bottle. Common enemies and forage renew after 20 minutes
  only while unseen and far from nearby travelers. Unclaimed loot/cache rewards
  prevent renewal. Named encounters and the authored temple do not reset.
- **Saves:** old wraps become bottles and cloth becomes Emberleaf, with quantities,
  overflow, claim identities and story progress preserved. Effect time remaining,
  recipes, camp improvements and renewal cycles survive travel/reload.
- **Still to build after playtesting:** the crossing/shortcut story, the dedicated
  temple preparation camp, three authored discoveries and the lantern's first
  puzzle. Specialized defense, poison and rescue items remain gated on the actual
  combat/status/rescue systems described in section 12.
- **Storage boundary:** these rules run in the existing per-player local adventure
  save. They are not authenticated shared combat or a database migration. The
  presence gateway accepts the shared 300 px/s travel ceiling with collision checks;
  it does not yet verify ownership of a Swiftstep effect. Authenticated effect,
  inventory and personal-loot authority remain part of the documented backend work.

## 1. The direction in plain language

Players should bring something back from an expedition that makes the next one
different: a useful potion, a meal, a recipe, a restored place, a shortcut, a piece
of a mystery, or a permanent tool.

Three connected systems give those rewards different jobs:

| System                   | The player's reason to care                                                                | Typical timescale                   |
| ------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| Brewing                  | Recover from danger, hit harder, move faster, later prepare for a particular hazard        | Seconds to a few minutes            |
| Cooking                  | Prepare for a longer trip with healing and temporary extra maximum health                  | A short outing, roughly 3–5 minutes |
| Discoveries and projects | Learn recipes, improve a camp, find secrets, earn tools and appearances, advance the story | Permanent progress                  |

**Retire the cloth-and-wrap healing recipe.** A raw herb already heals 40 HP;
making a 40 HP wrap consumes more ingredients and attention without giving a new
capability. Adding more versions of that recipe would repeat the problem.

Keep Slime Resin as a clear alchemy ingredient. Use simple names such as Healing
Bottle, Battle Bottle and Swiftstep Bottle. Explain the effect before the lore.
Keep the Hearthstone as everyone's permanent, reusable return-to-town item.

The intended loop is:

```mermaid
flowchart LR
    Goal[Choose a story lead or personal goal] --> Trip[Explore a route]
    Trip --> Finds[Ingredients, clues and recipes]
    Finds --> Camp[Cook or brew at a real camp]
    Camp --> Choice[Choose supplies for the next challenge]
    Choice --> Challenge[Fight, investigate or solve a puzzle]
    Challenge --> Progress[New recipe, shortcut, tool or restored place]
    Progress --> Goal
```

Preparation should help a player pursue a goal. The goal should not always be
collecting enough supplies to replace the supplies spent collecting them.

## 2. Research: what these games actually contribute

I compared six games using publisher/developer material and official manuals. The
observations below concern the named editions, not every installment or later
balance patch. These sources establish mechanics, not proof that copying them will
make Dmap engaging. The adaptation and tradeoffs are design judgments for Mosswild.

| Reference and verified observation                                                                                                                                                                                                                                                                                     | What to adapt for Mosswild                                                                                                                               | Tradeoff to avoid here                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Zelda: Tears of the Kingdom.** Nintendo describes monster drops as ingredients for elixirs and weapon fusion; shrine and Korok discoveries also lead to lasting upgrades. [Nintendo guide](https://play.nintendo.com/news-tips/tips-tricks/hyrule-tips-and-tricks-tears-of-the-kingdom/)                             | Give combat materials recognizable uses and reward exploration with permanent progress as well as consumables.                                           | An enormous combination space would hide our few useful recipes. Start with explicit, readable combinations.                              |
| **Valheim.** Iron Gate describes food as affecting total health and stamina, while eating is not required simply to stay alive. Biomes have distinct resources and progression. [Iron Gate FAQ, gameplay section](https://www.valheimgame.com/faq/)                                                                    | Meals can make a traveler better prepared without a hunger punishment. Different habitats can make different ingredients worth seeking.                  | Avoid making a full meal a hidden admission fee for ordinary forest fights, or adding stamina just to create food demand.                 |
| **Monster Hunter Generations.** Capcom's manual links meals to temporary skills; new ingredients come from hunting and villager requests, and discovered dishes join the menu. [Official Bistro/Canteen manual](https://game.capcom.com/manual/MH_Gen/en/page-143.html)                                                | A helpful side adventure can permanently improve the camp's recipe book. The kitchen becomes a meaningful return point.                                  | Do not make every outing begin with several mandatory buff chores. Finished dishes should have guaranteed effects.                        |
| **The Witcher 2.** Its manual separates potions, oils and bombs; formulas can be found, bought or rewarded, and potion use has toxicity constraints. [Official manual, sections 3.5 and 5](https://cdn.akamai.steamstatic.com/steam/apps/20920/manuals/The%20Witcher%202%20Manual%20-%20English.pdf)                   | Consumables can answer different combat problems. Recipes themselves are rewards, and simultaneous effects need a clear limit.                           | A toxicity meter, weapon oils, resistances and bombs would be too many new systems for our current combat. Use a small effect rule first. |
| **Guild Wars 2.** ArenaNet's collection design connects discoveries to recipes, equipment and functional unlocks; collections can appear as relevant items are discovered. [ArenaNet's collection design article](https://www.guildwars2.com/en/news/introducing-the-collections-achievement-category/)                | A few connected discoveries can finish a story and grant something permanent. Record them in a journal rather than leave proof objects clogging the bag. | Avoid hundreds of disconnected checkboxes or rare random drops blocking a story collection.                                               |
| **Potion Craft.** Its developer-authored description emphasizes ingredient properties, recipe discovery, customers with specific problems, and ingredient acquisition through trade or gardening. [Developer/publisher game description](https://store.steampowered.com/app/1210320/Potion_Craft_Alchemist_Simulator/) | Give brewing a physical place, teach why an ingredient matters, and let a request lead to a useful discovery.                                            | Its full alchemy-map simulation is the central game there. Requiring that process for every refill would interrupt our adventure.         |

Genshin remains a presentation reference already chosen for Dmap. This proposal
does not assume its economy, drop rates, elemental systems or food limits fit our
single-traveler combat. We do not need daily gates or a huge ingredient catalog to
make bottles understandable.

### What follows from the comparison

1. **Supplies need distinct purposes.** Recovery, attack, travel and preparation
   should produce different decisions.
2. **A recipe is a durable reward.** After a quest, the player can make something
   new on every future expedition.
3. **Place matters.** Players remember a garden, a river bend or an occupied supply
   camp better than a random ingredient scattered identically over every map.
4. **Knowledge is progression.** Learning where to find an ingredient and when to
   use it should reduce future preparation effort.
5. **A reward should sometimes outlast consumption.** Camps, shortcuts, tools,
   cosmetics and resolved mysteries prevent the entire loop becoming maintenance.

## 3. The first playable set

Start with **three brewed bottles, two simple meal alternatives, and one improved
stew recipe**. One recovery bottle is enough. Defense, antidotes and revival come
only alongside the encounters or states that give them a purpose.

### Bottles: short, readable choices

Every listed recipe makes one bottle. Water, ordinary bottles and heat are station
supplies, not three additional inventory chores.

| Bottle               | Recipe                         | Initial effect to test                                                                | Why make it?                                                                                                                   |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Healing Bottle**   | 1 Slime Resin + 1 Healing Herb | Restore **70% of maximum HP immediately**; 70 HP with the current unbuffed 100 HP     | One herb becomes a substantially stronger emergency action when prepared, with room to scale as maximum HP grows.              |
| **Battle Bottle**    | 1 Thornseed + 1 Emberleaf      | **+20% damage for 3 minutes**, applying to the existing weapon and spell damage paths | Prepare for an elite or boss, or commit to clearing a dangerous route.                                                         |
| **Swiftstep Bottle** | 1 Spark Pollen + 1 Moonblossom | **+25% movement speed for 3 minutes**, including walking and sprinting                | Escape, reposition or take an exploration detour. This is a speed effect; it does not add a dash, teleport or invulnerability. |

**Keep the raw herb's current 40 HP recovery for the first comparison test.** It
remains a useful unprepared fallback. The bottle earns its place through increased
healing per ingredient/action, not by suddenly making herbs worthless. If healing
is too abundant, adjust sources and combat recovery together after measuring them.

Starting consumption rules:

- Raw herbs and Healing Bottles share a **20-second recovery cooldown**. This is a
  proposed new combat rule and needs testing against existing enemy damage.
- Battle and Swiftstep occupy **one temporary-effect slot**. A different bottle
  replaces the old effect; using the same one while active is disabled. Keep the
  replacement visible in the action label, not hidden in a tooltip alone.
- A brief common drinking action, about **0.6 seconds**, prevents drinking several
  types in one frame. A 3-second use lock prevents repeated replacement spam.
- A heal at full HP, an invalid action, or a canceled use spends nothing. Commit
  consumption once the use action completes. Effects are never triggered twice
  by repeated input or a reconnect.
- Potions do not alter XP, item drop rates or enemy level calculations. Temporary
  power should be useful rather than canceled by automatic enemy rescaling.
- No drink is required to cross a main-story gap, open a temple gate or solve a
  mandatory puzzle. A timed optional challenge must offer retries and an ordinary
  route to progress without that challenge.

These values are deliberately modest. A +20% damage bonus reduces an otherwise
identical damage-limited fight's duration by about **16.7%**, not 20%. It must not
erase attack telegraphs or substitute for learning the enemy.

### Food: healing plus expedition preparation

For this proposal, **Vitality means temporary extra maximum HP from a meal**.
It is not a new hunger meter, permanent stat growth or a second health bar.

Example: 100 base maximum HP + 20% meal Vitality = **120 maximum HP**.

| Meal              | Ingredients                                                  | Recovery on eating | Vitality benefit                                              |
| ----------------- | ------------------------------------------------------------ | ------------------ | ------------------------------------------------------------- |
| **Roasted Meat**  | 1 Raw Meat **or** 1 Raw Fowl                                 | 25 HP              | +10% base maximum HP for 5 minutes                            |
| **Pan Mushrooms** | 1 Forest Mushroom                                            | 25 HP              | +10% base maximum HP for 3 minutes; a non-hunting alternative |
| **Trail Stew**    | 2 Raw Meat/Fowl **or** 2 Forest Mushrooms, plus 1 Rivercress | 40 HP              | +20% base maximum HP for 5 minutes                            |

The stew has equal meat and plant versions. Hunting supplies more portions from
larger wildlife; foraging lets a player prepare without hunting neutral animals.
Do not add one new inventory item for every animal's identical cut of meat.

Food rules:

- Cook at a station, carry portions, and eat during a **4-second stationary action
  outside combat**. After damage or an attack, wait 10 seconds before eating;
  damage or movement interrupts eating without spending the portion.
- One meal effect at a time. An active meal blocks other buff meals until it expires;
  it cannot be refreshed or replaced for repeated healing. Mushroom Broth remains
  available for plain recovery: 25 HP, no buff, no cooldown, the same 4-second
  interrupted eating action outside combat. One mushroom cooks one broth.
- Apply the new maximum HP, then the meal's stated recovery, clamped to that max.
  Increasing the cap does **not** separately fill the extra HP for free.
- When the meal ends, clamp current HP to the normal maximum. Expiry causes no
  damage event and cannot kill someone. Show a quiet expiry notice.
- Ordinary meals do not also grant attack, speed, loot luck and defense. Their
  main job is a longer health buffer. The player can have **one meal + one bottle
  buff** and can still use recovery when its cooldown allows.
- No hunger damage, food spoilage, cooking fuel grind, or permanent HP from eating
  hundreds of meals. Resting at a safe camp provides basic recovery for free;
  meals add preparation beyond that recovery.

## 4. What comes from whom

This replaces the current pattern where almost every hostile eventually gives
healing. The source and effect should be learnable after one or two encounters.

| Source                                        | Proposed useful reward                                               | Main use and presentation                                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Slimes, all colors                            | 1 Slime Resin                                                        | Healing Bottle base. One shared material, without separate pink/green/blue resin clutter.                                                    |
| Forest skirmisher                             | 1 Emberleaf from carried supplies                                    | Battle Bottle. Show a visible herb bundle on a supply belt or beside its defended cache; these fighters have taken camp supplies.            |
| Forest brute                                  | 2 Emberleaf from carried supplies                                    | Same useful ingredient in a larger reward. Make its carried supply bundle visible.                                                           |
| Venus Trap                                    | 1 Thornseed                                                          | Battle Bottle. A recognizably thorny seed/pod sprite.                                                                                        |
| Blue Death plant creature                     | 1 Spark Pollen                                                       | Swiftstep Bottle. Its glowing pollen connects the ingredient to its source.                                                                  |
| Ordinary plant guardian / Root Beast          | 3 Thornseed + one chosen known bottle from the defended supply cache | A larger fight gives a useful preparation reward. The cache belongs to the encounter location; the creature itself drops botanical material. |
| Named optional guardian                       | The above supplies + its authored collection discovery, once         | A guaranteed step toward a permanent reward. Not a 1% random trophy grind.                                                                   |
| Wildlife                                      | Existing meat/fowl quantities                                        | Roasts and stew. Keep hunting optional.                                                                                                      |
| Leafy herb plants                             | Healing Herb                                                         | Raw recovery or a stronger prepared bottle.                                                                                                  |
| Pale flowers, especially clearings near water | Moonblossom                                                          | Swiftstep ingredient with an immediate first-release use.                                                                                    |
| Shaded fallen wood                            | Forest Mushroom                                                      | Non-hunting food ingredient. Use distinct gatherable clusters, not ordinary scenery.                                                         |
| Stream edges and restored garden beds         | Rivercress                                                           | Improved stew; a reason to seek the river and help restore the garden.                                                                       |
| Sunny clearings / recovered supply gardens    | Emberleaf, as an alternative source                                  | Attack brewing remains possible when a local fighter encounter was already defeated.                                                         |

All basic material drops above are guaranteed for the eligible defeat. Scarcity
comes from habitat, danger, route choice and limited recipe needs. Rarity should not
mean repeatedly receiving nothing from the advertised source.

**Hides and feathers:** do not invent a bandage recipe just to justify every old
drop. Preserve already-owned stacks. Stop adding new ones until a concrete project
uses them. The first proposed sinks are a hide awning for a rebuilt camp and a
feather-decorated lantern appearance; ship each source with its actual project.
Shed feathers should provide a non-hunting source for the cosmetic project.

**Cloth and wraps:** remove them from new progression only when the replacement
brewing loop is ready. The save migration is described below.

## 5. Regions need different reasons to visit

Use the existing twelve-region geography; do not require all twelve before the
temple. Current broad enemy distributions can remain varied. Add **habitat bias
and authored gathering spots**, not an exclusive monster species gate per map.

| Region or stage                      | Supply identity                                                    | A lasting reason to visit                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Town and Mosswild Verge              | Beginner resin/herbs, easy mushrooms, all first recipes introduced | Learn two station types, establish the first recognizable camp, earn a useful recipe through a small task. |
| Alder Run                            | Rivercress, nearby pale flowers, riverbank ingredients             | Restore the crossing/water flow; earn Trail Stew and a shorter return route.                               |
| Greater Fern Hollow / Foxglove Ridge | Garden produce and Emberleaf                                       | Reconnect the garden/apiary story; establish a convenient supply source near camp.                         |
| Lantern Wood / Old Ward              | Mixed combat supplies plus a recipe or collection clue             | A meaningful alternate temple approach and a recovered piece of community history.                         |
| Rootbound Reach                      | A reliable preparation camp and visible guardian supplies          | Choose food and one buff before the temple; Oren explains the actual danger.                               |
| Stillwater Basin / High Boughs       | Moonblossoms and Spark Pollen opportunities                        | Optional overlooks, reflection clues and a useful movement recipe application.                             |
| Bracken Marsh                        | Later antidote ingredients, only with real poison hazards          | Restore a dry shelter and find a safer route; do not release an unused antidote first.                     |
| Moonmere / Elderheart                | Authored story materials and collection sites                      | Use the lantern, resolve the forest's promise, earn permanent identity rewards.                            |

The player sees where an ingredient was found and the known habitats in the recipe
book. A region with a stronger supply identity still needs alternate resources and
interesting encounters. Avoid replacing the old repeated slime pattern with a
repeated ingredient-farming pattern.

## 6. Actual brewing and cooking places

### Town: a dependable home base

Create a **provision courtyard** on reserved, accessible town ground, with a brewing
bench and cooking hearth. It can sit near Juniper and Wren without making their
entire character identities shop menus. This is a proposed use of the campaign's
cast, not an assertion that these NPC services already exist.

Placement must respect generated Discord houses, their approaches and the forest
portal. Use a stable world anchor and collision validation, not a random marker on
the nearest channel building. The same server keeps the same station location.

- Brewing bench: mortar, small still/cauldron, ingredient jars, warm lamp, quiet
  bubbling and steam when working.
- Cooking hearth: stone fire ring, suspended pot or grill, cutting board, stools,
  nearby water and a believable supply shelf.
- Separate readable **Brew** and **Cook** interaction targets. E opens the relevant
  station; F continues to collect ground drops.

### Forest: camps the player can recognize

Upgrade one camp properly before stamping services across all twelve regions.
Use a sheltered patch, bedding, cooking fire, benches, hanging herbs, supply crates
and a clear approach. Visible warmth, smoke and inhabitants should identify it as a
camp before its label does.

Basic shelters cook simple meals. Established camps also brew. The preparation
camp at Rootbound Reach supports both. Do not make a player return to town just to
refill immediately before the temple.

A camp-restoration task should add something visible and useful: a brewing bench,
a working pot, an herb bed or a shortcut to that camp. Stable geometry must reserve
space for these additions. In multiplayer, separate shared construction state from
each player's recipe and story rewards.

### The station interaction

Show the recipe, result, effect, duration, owned/needed counts, and known ingredient
sources together. Provide **Make 1** and a bounded quantity control. Show missing
ingredients before starting, with optional tracking in the journal/map.

The first preparation can have a short, skippable 2–3 second animation. Repeated
crafting uses a quick batch action. No mandatory timing minigame, failed dish RNG,
offline multi-hour timer, individually crafted glass bottles or firewood errands.
Optional experimentation can be introduced later if it reveals useful knowledge;
the core recipes should already be legible.

## 7. Why the player goes out again

| Motivation                   | Concrete example                                                                        | What remains afterward                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Solve the next problem       | Prepare a Battle Bottle for a guardian or Swiftstep for a risky retreat                 | Knowledge of the encounter and a better chance to finish it                         |
| Discover a recipe            | Restore the Alder Run millrace and learn Trail Stew                                     | Permanent recipe + a changed river crossing                                         |
| Make a place better          | Clear and rebuild a camp's brewing corner                                               | A useful station in a better location, visible work and changed NPC dialogue        |
| Complete a connected mystery | Find three named Choir traces through a puzzle, an optional guardian and an inscription | A short keeper memory and a lantern appearance, rather than three bag slots forever |
| Gain a permanent tool        | Return Mira's notes after freeing the keeper                                            | Wayfarer's Lantern for authored faded markings; no fuel bill                        |
| Express identity             | Finish a region's restoration or campaign milestone                                     | Title, camp ornament or a named appearance for an existing weapon family            |

A recipe or functional unlock should appear within the early play session. A chest
that offers only another common herb after a long puzzle will not justify the
detour. Give the reward a visible preview when the player accepts a named task.

Keep the main temple route intact: Rootbound Reach → Mira → courtyard Root Beast →
sun and moon seals → Bound Warden → keeper → reliquary notes → Mira. Brewing is
preparation for that story, never another mandatory ingredient gate before it.

The proposed **Lastlight Seed** remains a later, guaranteed story/secret reward,
with the already discussed ten-second downed window. Implement the actual downed
and rescue system first. It does not join the ordinary potion loot table now.
The keeper is not harvested for rare monster ingredients.

## 8. Teach the loop through one short adventure

Prototype this before spreading recipes and stations across the entire forest:

1. **Town:** the player sees both working stations and the results they can make.
   First-use ingredients are provided once; no combat is required to understand
   the interface. Basic meal and healing recipes are known immediately.
2. **Verge:** Juniper offers an optional supply-recovery task. The route includes a
   fighter with Emberleaf, a visible Venus Trap and a small shelter. Completing it
   teaches Battle Bottle and restores that shelter's brewing equipment.
3. **Alder Run:** a water/crossing puzzle leads to Rivercress and the stew recipe.
   The reward makes the next expedition better and opens a shorter route home.
4. **Before the temple:** Oren introduces Swiftstep through an optional route-scouting
   task, including a guaranteed sample and a nearby known ingredient source. There
   is no potion-only jump or speed gate.
5. **After the temple:** the lantern changes how the player reads earlier places.
   A small connected collection provides a new reason to revisit them.

The journal offers **Follow story**, **Explore freely**, and recipe tracking.
Tracking a recipe may highlight an already-known habitat; it never automatically
starts the golden trail. Exact guidance remains a separate player choice.

Introductory timing targets: first meal/bottle within 10 minutes, first useful
non-healing bottle within 20–30 minutes, first permanent improvement during the
first substantial excursion. These are playtest goals, not extra compulsory tasks.

## 9. Economy and repeat visits without a grind treadmill

### Make the time cost worthwhile

- One ordinary defeat supplies one useful ingredient, larger encounters a small
  bundle. Keep common recipes at two ingredient types.
- A normal 10–15 minute mixed route should naturally provide enough for roughly
  two recovery bottles, one chosen buff and a meal. Measure actual travel and
  fighting time; do not infer this from the number of spawns alone.
- If the player specifically seeks a common missing ingredient in a known habitat,
  target a 1–3 minute detour, with multiple eligible sources and no unlucky streak.
- A 25% speed bonus covers a normally three-minute route in 144 seconds, saving
  36 seconds. Farming for several minutes solely to make that trip faster is a bad
  trade. Swiftstep must use incidentally acquired materials and also offer escape
  or repositioning value.
- Discovery should reduce future effort: a restored herb bed, a learned habitat,
  an efficient return path, and batch preparation. Do not scale ingredient costs
  upward merely because the player became stronger.

### Resources cannot stay permanently exhausted

The current prototype persists defeated enemies and harvested flowers. That is
useful for story continuity but cannot support unlimited repeatable consumption.
Do not advertise a renewable potion economy until renewal exists.

Recommended first renewal policy to test:

- Common forage and ordinary encounter territories become eligible to replenish
  after about **20 minutes**, with the territory unoccupied and no player nearby.
  Closing the map, reloading or stepping through a portal does not reset that timer.
- Never respawn into a visible area, a fight, a recently cleared path ahead of the
  player, a safe camp, or an occupied party member's location. Defer rather than
  force a timer-based spawn. Refresh varied patrols inside the existing balanced
  territories; do not rebuild the former clumps.
- Named guardians, temple bosses, quest caches and collection rewards stay completed.
  Their story facts do not reset with common supplies.
- An established garden replenishes ordinary plants conveniently when the player
  returns. No crop watering schedule or offline penalty in the first version.
- Safe-camp rest and basic forage prevent a failed expedition from leaving someone
  unable to recover. Core story progress must not require buying supplies.

The 20-minute value is a starting rule, not a countdown the player must watch.
An optional explicit repeatable hunt can be introduced later if players want it;
avoid daily chores and attendance streaks.

### Surplus and scarcity

Do not add coins, an auction house and random gear affixes to solve surplus now.
First use modest recipe costs and concrete one-time projects. A later town exchange
may trade surplus common supplies for basic herbs/cooking greens at a loss, with
no profitable conversion cycles. It must not turn every species-specific material
or rare reward into interchangeable currency.

No essential recipe depends on rare RNG. Recipe discovery, named collection pieces
and first rare rescue rewards should have authored, predictable acquisition paths.
Do not add a luck potion that becomes compulsory before every reward roll.

| Availability | What it means here                                                        | Example                                                          |
| ------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Common       | A known, repeatable source; usually consumed in ordinary preparation      | Resin, cooking ingredients, basic bottles                        |
| Uncommon     | A particular place or short activity gives a reliable opportunity         | A new meal recipe from restoring a crossing                      |
| Rare         | An authored secret or significant optional encounter, with a clear reward | Lastlight Seed from the living branch secret, once rescue exists |
| Unique       | A named, permanent story reward, granted once per player                  | Wayfarer's Lantern or a chosen Trailkeeper weapon appearance     |

These are availability labels. A rare object does not automatically have a larger
damage number, and an uncommon recipe is not a consumable scroll that must be
found again. Distinct discoveries are recorded permanently when collected; using
or handing in the associated object does not erase collection progress.

## 10. Inventory, controls and presentation

Use the existing ornate forest UI. Ingredients, cooked food and bottles need
recognizable names and silhouettes, not rarity borders to explain their use.

- Keep Weapons, Items, Food, Materials and Quest sections. Put brewed bottles in
  Items with a Potions filter; keep permanent tools distinguishable. Food contains
  raw ingredients and meals, with a Cooked filter. Materials identifies alchemy
  ingredients and their recipes. Add filters only when the contents justify them.
- Item details say **Used for: Battle Bottle → +20% damage for 3 min**, plus the
  known source. An item with no current use should not become a new routine drop.
- A recipe book is readable away from stations; preparing the recipe requires the
  appropriate station. No invisible crafting anywhere from a material detail.
- Keep the existing H recovery action; let the player choose its recovery item.
  Do not silently spend a valuable potion if their chosen herb ran out. Reserve
  one configurable quick-use control for a selected buff bottle after checking
  the existing key bindings. Ember and Tide remain abilities.
- The HUD needs at most a small food icon and one buff icon, with duration and
  plain-language effect on inspection. Inventory shows the effective HP cap and
  which benefit will be replaced. Avoid adding a permanent statistics panel.
- F/tap collects small ground icons as now. Reserve E for world/station actions.
  Text input, chat, map and dialogue block gameplay shortcuts as they do now.
- Use bottle shapes/labels and symbols as well as colors: healing leaf/heart,
  attack thorn, movement wing/step. Effect names stay visible for accessibility.
- Preserve the pixel palette, local asset delivery and documented licenses.
  Artwork is served locally with source hashes and attribution: 7Soul inventory
  icons, distinct CC0 Herb Icons, and the existing LPC Revised station furniture
  and cauldron animations. See the asset credits in `public/game-assets/`.

## 11. Make it work with the current project and future backend

This is implementation planning, not permission to migrate infrastructure. Keep
the agreed [Cloudflare + portable PostgreSQL direction](BACKEND_ARCHITECTURE.md).

The current model has inventory quantities, visible personal drops, saved encounter
IDs, story facts, timed effects, derived HP, renewable common supplies, workstation
access rules and atomic batches. Authoritative shared loot/inventory progression
is still deferred to the backend work.

Separate definitions from actions:

| Part                       | Responsibility                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Item and recipe catalog    | Stable IDs, ingredients, outputs, station requirement, unlock condition and preview text                          |
| Effect rules               | Healing, damage multiplier, movement multiplier, maximum-HP multiplier, duration and replacement group            |
| Derived traveler stats     | One calculation used by damage, healing, HP display, movement and limits; never scattered hardcoded 100 HP checks |
| Station service            | Validate station, proximity, availability, learned recipe, quantities and output capacity                         |
| Craft/use action           | Commit ingredients/output or consume/apply effect atomically, with a repeat-safe action ID                        |
| Encounter supply lifecycle | Stable spawn cycle, eligible players, defeat/drop IDs, pickup ownership and renewal timing                        |
| Storage adapter            | Persist inventory, recipe knowledge, active effects, cooldowns, station/project facts and drop claims             |

Runtime requirements:

- A speed buff must update both movement simulation and any network movement
  validation/reconciliation budget. A client-only multiplier can produce snapping
  or rejected movement. Preserve swept collision and pathfinding behavior.
- Healing uses the derived maximum HP. Meals, death, camp rest and buff expiry use
  the same rules. Buffs must not silently disappear or duplicate on map changes.
- Preserve remaining buff duration across logout; elapsed time must not be reset
  by reconnecting. While connected to a shared world, menus do not pause time.
  Recovery cooldowns likewise cannot be reset through area changes or relogging.
- On defeat, short bottle buffs end. Keep the meal's remaining duration through
  town recovery so learning a boss does not demand recooking every attempt.
  Inventory, recipes, completed story steps and permanent discoveries remain safe.
- Each common respawn gets a new, authoritative cycle ID. Old corpses and claimed
  drop IDs cannot become new rewards just because the scene reloaded.
- For shared combat, eligible party members receive personal loot. Contribution
  eligibility must include supported party participation, not only the final hit.
  A late arrival receives future common opportunities but cannot reopen completed
  unique rewards. Station crafting never consumes another player's items.
- A local adapter can prototype the same rules. Shared progression must move
  under authenticated backend authority before relying on it for multiplayer
  ownership, timers or trade. The current local save is not trusted server state.

### Upgrade existing saves without wasting players' work

The brewing implementation applies an idempotent catalog-v2 migration:

1. Preserve resin, food, herbs, progression, story facts and the Hearthstone.
2. Convert each existing Resin Wrap into one Healing Bottle.
3. Convert each Trailcloth into one Emberleaf. Present this as an item-system
   update, not a new in-world claim that cloth becomes a plant.
4. Remap uncollected legacy cloth/wrap drops using their existing claim IDs;
   never regenerate rewards from old defeated-enemy records.
5. Preserve stored hides/feathers. If output capacity is reached, retain overflow
   in a claimable delivery record rather than silently clamp it away.
6. Apply the migration once to the whole saved expedition. Retry/reload must not
   issue conversion rewards twice. Test before removing the old definitions.

Legacy definitions remain readable for pending old drops; new progression never
produces cloth or wraps. Conversion overflow is claimed as stack space becomes
available. The bounded local adapter reports a failed save instead of writing a
snapshot it cannot read back.

## 12. Build order and proof that it is worth expanding

### First: one complete preparation-and-adventure loop — implemented, ready to playtest

Implement derived stats and timed effects, one town provision courtyard, one
recognizable forest camp, the three bottles, basic meals/stew, their actual drops
and gathering nodes, recipe knowledge, small HUD indicators, source tracking and
safe migration. Introduce the first camp/recipe task with a visible permanent
result. Supply renewal must work before this loop is presented as repeatable.

Test both an unprepared ordinary route and a prepared harder route. Existing
combat should still be playable without collecting every buff first.

### Then: connect preparation to regional stories — planned

Build the Alder Run crossing/garden reward, the real temple preparation camp,
three authored collection discoveries and the lantern's first meaningful use.
Keep the temple main route accessible without finishing the cooking side story.
Add hide/feather project sinks only with their visible rewards.

### Later: specialized choices when the game supports them

| Candidate              | Required gameplay first                                        | Distinct purpose                                                                 |
| ---------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Barkskin Bottle        | Harder readable encounters and a tested defense modifier       | About 15% less incoming damage, using the same temporary-effect slot             |
| Clearwater Bottle      | Actual poison/spore status and avoidance routes                | Remove poison and provide brief protection; not a second generic heal            |
| Lastlight Seed         | Downed state, encounter rescue limit, synchronized claim rules | The ten-second self-rescue opportunity from the campaign                         |
| Party rescue supply    | Reliable baseline party revival                                | A specific rescue advantage; defer the old ribbon/cloth recipe                   |
| Echo Glass preparation | An authored optional memory puzzle with a complete reward      | Permanent clue/collection progress; never recurring fuel for the lantern         |
| Advanced cooking       | Players use the initial meals and value regional recipes       | A small number of distinct expedition choices, not dozens of percentage variants |

### Acceptance checks

- A new player can explain the difference between an herb, a Healing Bottle, a
  Battle Bottle, Swiftstep and a meal after one short excursion.
- They can find the ingredients without consulting an external wiki. Tracking a
  recipe gives helpful sources without revealing every secret or forcing a trail.
- Crafting produces an observable advantage: one bottle saves a dangerous recovery
  action, Battle changes an appropriate fight, Swiftstep changes a retreat, food
  gives a visible health buffer.
- A normal mixed route produces useful supplies without repeated farming of one
  camp. If all players farm only slimes, the reward/time balance needs revision.
- Common supplies remain available after multiple sessions. Reloading, teleporting,
  party churn and simultaneous pickup cannot duplicate them.
- One meal cannot be refreshed while active; bottle replacement works correctly; expiry, death, full HP, interrupted use,
  maximum stacks, recipe failures and offline return preserve sensible state.
- Measure time spent exploring/fighting versus preparing, unused-item accumulation,
  how often each recipe is chosen, and whether players can name the lasting reward
  they want next. Treat these as playtest questions, not fabricated engagement data.

Do not expand to the full ingredient catalog until this small loop is enjoyable.
The useful test is whether a player wants another expedition and knows why.

## Implementation verification — September 20, 2026

- Client suite: 413 tests passed, including actual weapon/spell benefit, atomic
  batches, old-save migration, effect interruption/replacement, renewal and cache
  claims. The 23 preparation tests were rerun after final use-state refinements.
- Worker suite: 453 tests passed, including 1.25× auto-run through corners with
  delayed/bunched movement packets, collision/admission and existing persistence.
- Seven Chromium map/temple regressions passed, including the untouched pin form
  and consecutive Escape presses after Tab/double-Tab opening.
- The initial browser pass covered town preparation and consumption, plus forest
  camp restoration → H recovery → B replacement → reload with a 390px recipe layout.
  Town consumption from that early pass is superseded by the adventure-only rules below. No page or asset
  errors were observed in those flows. These tests do not measure long-session fun.
- Production build, changed-file lint/format, browser import boundary, source asset
  hashes and strict UI audit passed. Existing bundle-size guidance remains in the
  build output. The final runtime refinements also passed application type checking.

The authored regional story phase still needs its own implementation and playtests;
these checks do not imply multiplayer item authority or a completed campaign.

## Implemented presentation and defeat — September 20, 2026

- Slime Resin is a loose green gel material; Healing Bottle is green, Battle Bottle amber and Swiftstep Bottle blue. Inventory, recipes and ground drops share their artwork.
- Food uses a hand-to-mouth pose and crumbs during its four-second eating action. Bottles tip and pour, then show different local effects: green recovery motes, amber battle sparks, and blue wind around the feet. Herbs use the small hand-to-mouth preparation too. Completion effects occur only after a successful spend; interruption preserves the item.
- Weapon strikes use directional authored pixel arcs and impact sprites. A brief enemy recoil and local hit flash provide contact feedback, with reduced-motion alternatives. Existing enemy attacks and death animations remain in use.
- **Current defeat rule supersedes the camp respawn proposal:** zero HP ends the current adventure visit. Combat and interaction stop, the traveler falls and dissolves into motes, and a short defeat message precedes the return to that server's town. Saved items, discoveries and story progress remain; short bottle buffs end, meal duration remains. Town arrival restores HP. Reloading at zero HP cannot revive the traveler inside the forest.
- Presentation clocks use elapsed scene time and fixed pools, not movement speed. They pause with a hidden tab and dispose with their scene.

## Current town, food and spell rules — September 20, 2026

Food and bottles can only be consumed in adventure. Town permits preparing, crafting,
equipping and browsing supplies. Meal/bottle timers and spell cooldowns continue
while the loaded game runs in town or with panels open; their HUD is hidden in town.
Offline time remains paused. Swiftstep does not accelerate town movement.

Roasted Meat: 25 HP and +10% max HP for **5 minutes**. Pan Mushrooms: 25 HP and
+10% max HP for **3 minutes**. Trail Stew: 40 HP and +20% max HP for **5 minutes**.
Old saved longer meals are capped to these durations when loaded. A new **Mushroom
Broth** recipe, known initially, cooks one mushroom into 25 HP of plain healing:
no timed benefit or cooldown, usable again after eating finishes. It does not
refresh the recovery cooldown or overwrite the active meal. Full health or an
interrupted action consumes nothing.

Ember unlocks at **10**, Tide at **16**; the reachable level cap is **30**. Each
has its own **120-second** cooldown, committed at casting start and saved across
travel, town, rest and reload. Ember reaches 192 world pixels; Tide reaches 256.
Both deal 100 + 4 per level above 15 + the equipped weapon's spell bonus, then the
Battle Bottle multiplier if active. Ember has no extra burn damage; Tide stops a
surviving target's movement and attack/animation clock for **2 seconds**. Weapons
remain usable during magic recovery. Older low-level saves using magic fall back
to the equipped weapon. The ability HUD shares these definitions and shows time
remaining with licensed 7Soul1 icons.
