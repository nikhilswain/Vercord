# Mosswild: enemies, arenas and hazards

Research checked September 14, 2026. This pass implements mouse combat, free-aim
spells and pressure plates. The assets and encounters below are a shortlist for
the next content pass; no new pack has been purchased or imported.

## Recommendation

Keep the tall LPC traveler and build one coherent jungle encounter around
**predator plants + an overgrown temple courtyard** first. This gives us a ranged
enemy, a close-range ambusher and a boss without replacing the player's art.
Choose the terrain family once before building the larger jungle. The current
LPC forest remains provisional; the selected ELV pack is still not owned.

Animations alone do not make a new enemy interesting. New enemies should add
distinct decisions: break line of sight, sidestep a charge, close on a ranged
attacker, or leave a dangerous patch of ground. Proposed mechanics below are our
design work, not claims that an asset pack supplies those mechanics or code.

## Creatures and bosses

| Source | Verified art / commercial-use status | Proposed use and fit |
| --- | --- | --- |
| [CraftPix: Predator Plant Mobs](https://craftpix.net/freebies/free-predator-plant-mobs-pixel-art-pack/) | Free. Three pixel creatures: Venus Trap, Blue Death and Root Beast. Publisher lists four perspectives with idle, movement, attack, hurt and death; PNG/PSD, including a shadowless PNG version. | Best first import candidate: a short-range snapping plant, a ranged seed-spitter and a root boss. Inspect the actual atlas dimensions and contact frames before integration. |
| [Electric Lemon: Creatures Free Pack](https://electriclemon.itch.io/creatures-free-pack) | Free. Eight animated creatures, four-direction sheets, plus a fire-skull projectile/effect strip. Commercial use allowed; credit optional; standalone redistribution prohibited. | A coherent extension of the wildlife already used. Select goblin/orc enemies for a later forest camp; keep undead in the ruined-temple area. Compare their compact silhouettes beside LPC before committing. |
| [Electric Lemon: Creatures Extended](https://electriclemon.itch.io/creatures-extended) | Paid. Sixteen creatures, including the free set, and zombie explosion art. Same stated commercial-use terms. The author explicitly notes that knockdown has side views only. | A goblin slinger would add ranged pressure; armored enemies would require positioning. Four-direction sheets do not mean every action has four directions. Not needed for the initial free pass. |
| [Electric Lemon: Animal Wildlife](https://electriclemon.itch.io/animal-wildlife-free-pack-retro-rpg-series) | Free. Publisher lists four-direction combat and non-combat sheets; commercial use allowed, attribution optional, no asset resale/redistribution. | Keep our bear and snake, with different behaviors. Inspect remaining species before adding them; do not turn every ambient animal into a hostile creature. |
| [ELV: Sporefiend](https://elvgames.itch.io/sporefiend-sprites-fantasy-dreamland) / [Fantasy Dreamland updates](https://elvgames.itch.io/fantasy-dreamland-world/devlog) | Paid, not owned. The publisher documents Sporefiend, Foliath and other enemies with four-direction walk, attack, damage and death animations. | Strongest coordinated option if we adopt the bright Fantasy Dreamland scenery. Sporefiend could leave hazardous spores; Foliath could guard flower patches. Validate visible size alongside LPC using a single scale per source family. |
| [ELV: Abysslime](https://elvgames.itch.io/rogue-adventure-world/devlog/767656/031-added-abysslime-boss) | Paid Rogue Adventure content. The announcement establishes an authored attack animation; exact directional coverage and contact frames still require archive inspection. | Optional larger slime boss for a pond clearing. Do not assume this Rogue Adventure boss is included in Fantasy Dreamland. |

CraftPix's [Freebie Products License](https://craftpix.net/file-licenses/) permits
commercial games and modification, with optional attribution. It does not grant
standalone asset redistribution. Preserve source links and license notices in our
existing asset manifest/credits workflow; import only the sheets used in the game.
ELV's [publisher terms](https://elvgames.itch.io/terms) allow commercial projects
and modifications, with art distributed as part of the project. Retain ELV credit
and identify modifications; check each acquired pack's included notice as well.

## Jungle and arena scenery

| Source | Contents established by publisher | Direction |
| --- | --- | --- |
| [CraftPix: Ruined Temple](https://craftpix.net/freebies/free-ruined-temple-top-down-location-pixel-art/) | Free top-down tiles and props: overgrown arches, temple structures, pillars, vegetation. Lists animated water, gates, levers, fire, spikes and a spinning blade. CraftPix freebie terms apply. Sheet dimensions in its listing are not individual tile dimensions. | Recommended free arena source. Build a courtyard ourselves from modular pieces, with vines outside the fighting lanes and columns that visibly block shots. Its NPC animation list is not proof of combat-ready enemies. |
| [ELV: Fantasy Dreamland World](https://elvgames.itch.io/fantasy-dreamland-world) | Paid coordinated 16px world with forest, grassland, village, dungeon, animated terrain and creatures. See the creator's [Enchanted Forest update](https://elvgames.itch.io/fantasy-dreamland-world/devlog/573657/036-added-enchanted-forest-tileset). | Best match to the bright green reference the owner previously chose. Start with one clearing and calibrate 16px terrain at 2× against the existing 32-unit world grid. This does not require switching the LPC traveler. |
| [ELV: Rogue Adventure Jungle](https://elvgames.itch.io/rogue-adventure-jungle) | Paid 16px jungle tiles, animated trees/plants/grass and glyphs. The creator explicitly says water is **not included** in this standalone pack; it comes from Wastelands or the world pack. | A darker, denser jungle alternative. Treat it as a different art direction. Do not buy the standalone pack expecting every feature in its promotional scene. |
| [Rafael Matos: Epic RPG World — Ancient Ruins](https://rafaelmatos.itch.io/epic-rpg-world-pack-ancient-ruins) | Paid 32px top-down art: temple/ruins, pillars, bridges, vegetation, animated water and ritual props. Moose and stone golem have idle/run/attack/hurt/death listed. Commercial project use and edits allowed; no standalone redistribution; credit optional. | Strong premium alternative for larger, more detailed arenas. Native 32px terrain is a useful starting point beside LPC, but palette, outlines and camera perspective still need a trial. Golem facing coverage is not established by the action list alone. |

## Arena plan — design proposal

Build three spaces with deliberate routes, rather than scatter encounters across
an otherwise empty lawn. These are authored layouts, separate from procedural
Discord category/house generation.

```text
                         ROOT COURT
                  boss clearing + outer loop
                            |
                  OVERGROWN TEMPLE GATE
                            |
        FERN HOLLOW ---- RIVERBEND ---- RUIN COURTYARD
        ambush route      pond          ranged plants
              \            |            /
               ------ SOUTH CAMP -------
                       village return
```

- **Fern Hollow:** irregular foliage edges, an open central path, and two exits.
  Teach a plant's preparation pose before mixing it with wildlife. Put collectible
  flowers on safe ground, not directly over an invisible ambush hitbox.
- **Riverbend:** a pool as a clear boundary, two walkable routes around it, and
  a broad bank for fighting. A charging animal creates a sidestep decision; water
  and roots prevent endlessly running in a straight line. Keep a route back to camp.
- **Root Court:** start around 24×18 tiles, then tune against camera visibility
  and actual melee/projectile ranges. Leave a continuous outer escape lane and
  broad gaps between columns. Keep dense canopy outside the combat footprint.
  An encounter gate must reset/open on defeat or rescue, with no permanent trapping.

Boss proposal: a Root Beast alternates a directed root strike and a spread of
seed projectiles. Below half health, introduce a small number of temporary root
patches while preserving a safe lane. Use body anticipation, visible projectiles,
ground cracks and impact effects. The user rejected generic warning circles;
removing those circles must not remove readable preparation. Exact pose availability
may require choosing a different boss or authoring additional effects.

## Traps: responsiveness and new candidates

The implemented pressure plate reacts on the first contact tick. Spike frames and
damage share one state; remaining on a plate is unsafe. Invulnerability prevents
damage every frame. Timed traps remain an explicit content option for future puzzles.

For the next pass:

| Hazard | Asset lead | Planned behavior |
| --- | --- | --- |
| Spinning blade | Ruined Temple pack above | Contact damage while visibly spinning. Bounded authored path, with a safe bypass; never hide a blade under foliage. |
| Bursting wooden trap / barrel | [Existing CraftPix Magic and Traps pack](https://craftpix.net/freebies/free-magic-and-traps-top-down-pixel-art-asset/) | Contact triggers the mechanism immediately. A larger blast can have a short fuse so it remains readable. Art includes animated spikes, lightning and wooden bursts; the pictured terrain is not included. |
| Spore patch | Predator plant art plus separately authored effect | An enemy attack creates a visible patch; entering it hurts immediately, then at a capped interval. Pool these effects and cap active patches. A poison-cloud sprite is not confirmed in the plant pack. |
| Temple dart lane | Author a small launcher using selected temple props and a verified projectile asset | Pressure plate activates the launcher immediately; the dart still travels through space and can hit a column. This is a proposed assembly, not an advertised ready-made trap in the temple pack. |

## What to avoid

- [CraftPix Swamp Bosses](https://craftpix.net/freebies/free-swamp-bosses-pixel-art-character-pack/)
  is explicitly a platformer set. It has four attack variants, but that is not four
  facing directions. Keep it as a fallback rather than repeat side-view compromises.
- [CraftPix's four-direction boss pack](https://craftpix.net/freebies/free-top-down-boss-character-4-direction-pack/)
  advertises animated directions but uses vector cartoon art. It is a weaker visual
  fit than pixel plants, and source strips still need inspection.
- Do not use RPG-Maker-only tiles in Phaser, extract sprites from promotional GIFs,
  or replace the LPC traveler to accommodate a new creature pack.
- More health and faster animation alone are not new behaviors. Do not apply
  higher-level pressure by making off-screen or hidden attacks unavoidable.

## Integration order

1. Inspect licensed predator-plant PNGs, confirm every direction/action, and compare
   one sprite beside LPC. Record frame rectangles, foot anchors, attack contact,
   collision body and provenance before importing.
2. Add a reusable ranged-enemy action and hostile-projectile pool to the shared
   adventure simulation. Creature definitions choose actions; the demo only supplies
   spawns and level overrides. Avoid new creature-specific branches throughout the renderer.
3. Build a small temple courtyard with safe paths and one contact hazard. Cache
   static ground, use shared animation clocks, cull scenery, and keep collision
   data independent of art. Do not rebuild terrain when a projectile fires.
4. Add the boss's phases, then a second biome encounter. Evaluate attack readability,
   contact timing and real frame pacing before increasing population.

The live-world service will still need to own progression and encounter outcomes.
Reuse these domain rules there; local demo victories are not authoritative rewards.
