# Forest magic and LPC: asset research and demo decisions

Research completed September 11–12, 2026. Scope: revise the local `/play/demo` with tall LPC characters, authored casting, elemental effects, forest encounters and a small progression loop. This report combines primary creator pages, downloaded production archives, pinned source repositories, measured local sprites and explicitly identified gameplay inferences. Stardew's community-maintained wiki supplies secondary mechanical detail; its official site supplies the broader game reference.

## Decision

Keep the established LPC body and wardrobe. Tiago's comparison characters and the orbiting sword have been removed from the demo. LPC Revised does not provide a cast-named action in the pinned source. Compatible Expanded LPC supplies seven authored spellcast poses; the importer aligns all six layers with the original 64×64 canvas and feet anchor. The head and hair retain their original art with verified native head offsets. Source palettes are mapped back to the existing outfits, rather than replacing a traveler when combat begins. The animation lasts 700ms; a projectile releases at the extended-arm frame at 400ms.

Six additional ivory-skin travelers introduce blonde, white, red, pink and blue hair with different full shirts. Existing darker appearances remain available. Casting assets carry their own source records: two masculine body derivatives use CC-BY-SA 3.0; other casting layers use OGA-BY 3.0. See the [casting manifest](../../../public/game-assets/lpc-characters/casting-manifest.json) and [complete character credits](../../../public/game-assets/lpc-characters/CREDITS.txt). Do not infer one blanket license for every LPC file.

Three requested CraftPix packs supply actual demo art. The requested modular vector boss pack has not been imported: its description does not establish usable animated strips. A separate free animated forest-boss pack from the same publisher supplies the Thornbloom guardian. The table and inventory below distinguish these products.

**The exact ELV forest is pending.** The owner confirmed they do not own Fantasy Dreamland World. The Art directions page showed public previews, not acquired tiles. The demo therefore retains a brighter provisional LPC forest; it is not the requested ELV scenery and should not be described as such. An owned archive and its packaged license are required for the exact replacement. No purchase, account creation or external publishing occurred.

## Playable experiment

The implemented loop is village → forest → gather/fight → gain experience → return safely. Ember burns; Tide slows and pushes enemies. Experience reaches level 2 at 30 points, unlocking Tide, and level 3 at 100 points, improving damage. This elemental system is Dmap's experiment, not a claim about vanilla Stardew's mechanics. There are three slimes in blue/green, a snake, a bear, one plant guardian, two telegraphed spike traps, four healing herbs and three moonblossoms. Orange, blue and green bursts distinguish elemental and creature defeat feedback.

Each enemy warns before attacking a locked position, permitting a dodge. A safe arrival area and nonpunitive rescue keep short excursions approachable. Gathering grants progress as well as combat, so the second spell does not require grinding. This demo retains progress between village and forest during one running session; reloading or changing world themes starts over. Persistent quests, inventory, multiplayer damage, mounted travel and world-specific house interiors remain later work.

The model caps live projectiles at eight and transient effects at sixteen. Creature, trap and effect sprites are allocated once per scene; cached textures are shared, and static terrain is baked by the existing renderer. Collision checks use small projectile steps, including an obstruction check between a radius hit and its target. Dialogs, panels, inactive windows and hidden tabs pause the adventure clock. Character casting is a local rendering pose and does not add a presence action to the server protocol.

Implementation and reproduction instructions are in [Jungle demo](../../development/JUNGLE-DEMO.md). Research evidence follows, including alternatives that are recommendations rather than implemented features.

## Forest, character animation, and magic demo research

## Asset direction and availability

**The exact visual target remains ELV Games’ Fantasy Dreamland World.** Its official page provides purchase downloads, with no free forest sample offered there. On September 11, 2026, it displayed a promotional minimum of US$26.79 against US$39.99 list. It includes forest and grasslands tiles, enemies, characters, and the Reborn collection. ELV describes Reborn as a palette and detail refinement and says both versions can coexist. Prices are a point-in-time observation, not a procurement recommendation.[^1]

The smaller **Enchanted Forest** product is a separate paid entry in the same collection: US$4.01 promotional, US$5.99 list when checked. It advertises 16×16 tiles, mushrooms, houses, props, and characters, and the creator confirms inclusion in World. It is useful for comparing scope, but its mushroom-village emphasis may differ from the specific green forest screenshot being targeted.[^2]

No official free Dreamland forest was found in the creator’s current free-assets collection or the investigated product pages. There is a genuine, name-your-price **Free Fantasy Dreamland Dungeon** download. This supplies dungeon construction art and props; it does not fulfill the lush green forest requirement. Free ELV character and mineral packs also exist, but none establishes access to the paid forest.[^3][^4] An existing licensed LPC environment can support a provisional demo, clearly identified as LPC. It should never be presented as imported Dreamland art.

Animals need separate provenance. World’s creator comments explicitly distinguish the farming animals from Dreamland.[^1] The separate **Farming Animals** pack advertises seven animal types, including cattle, pigs, poultry, ducks, and goats, with four-direction idle, walk, and sleep animation. Its inspected price was US$4.01 promotional, US$5.99 list. Neither deer nor rabbits are listed, so forest wildlife coverage must be checked independently.[^5]

## Confirmed terms and remaining dependency

ELV’s linked terms, last updated July 20, 2022, permit commercial and noncommercial project use and modification. They require modifications to be identified and restrict redistribution to assets incorporated into a project; the original ownership remains with ELV. They also restrict standalone physical products and crypto/NFT uses.[^6] The creator separately confirms that credit is required and an existing owner may use the pack across multiple projects.[^1]

The paid archive and its packaged license have not been inspected. A licensed local copy remains necessary before importing the requested forest. Preserve the archive’s license, purchase provenance, exact source paths, and attribution alongside the selected files. Preview GIFs establish an art reference, not access to downloadable tiles. An older creator response permits sharing ELV’s free content with an open-source game, while excluding paid content; this exception should not be generalized to purchased art.[^7]

## Tall LPC proportions and animation compatibility

The existing project uses **LPC Revised**, pinned to ElizaWy/LPC revision `f07f7f5892e67c932c68f70bb04472f2c64e46bc`, with per-file OGA-BY 3.0 attribution. Eliza’s repository describes a 32-pixel, three-quarter-view art family and intentionally larger characters.[^8] Local `manifest.json`, `CREDITS.txt`, and the wardrobe manifest preserve the selected files and contributor evidence. These records are stronger than assuming every asset carrying the LPC name has one license.

The current renderer uses 64×64 animation cells, feet anchored at y=62, and six synchronized layers: body, head, trousers, shirt, boots, and hair. A direct alpha-bounds measurement of Rowan’s down-facing first idle frame found x=18–45 and y=15–61: a **28×47 visible silhouette**, not a 64-pixel-tall person. The measurement combines opaque pixels across those six original local layers; it does not resize or alter them.

Recommended scale relationship: render ELV’s 16-pixel tiles at exactly 2×, producing 32-pixel world tiles, while retaining LPC at 1×. The 47-pixel silhouette then spans approximately **1.47 tiles vertically**, consistent with the project’s tall-character direction. Leaving terrain at 16 pixels makes the same person almost three tiles tall. This is an implementation judgment, not creator-certified compatibility. Match doorway height, trunk scale, feet collision, and canopy occlusion in a contact-sheet scene before approving a complete map; integer scaling alone cannot reconcile palettes or object proportions.

Animation compatibility is stricter. The Universal LPC maintainers distinguish original LPC, Revised, and Expanded layouts: Revised can change frame counts/order, while some Expanded actions lack clothing coverage.[^9] The existing import includes only idle, walk, and run. Inspection of the complete pinned Revised repository tree found **no cast-named files**. Its current masculine body instead provides authored one-handed combat actions and a legacy swing, among other locomotion actions.[^10]

For this demo, use a complete, matching Revised action across every visible layer as a spell-release gesture, or import a separately verified cast-capable LPC outfit. An existing slash gesture repurposed for magic should be described as that. Adding a projectile to a stationary idle pose is functional spell logic but does not meet an expectation of authored casting animation.

Admurin’s free Character 2 cannot supply transferable arm motion: its creator specifies 128×128 sprites, three directions, four-frame idle and six-frame run/attack sequences. Its equipment layers match **its own** base; effects are explicitly excluded.[^11] Raster poses contain no interchangeable skeleton. Uniform scaling can change display size, but it cannot align hands, clothes, pivots, and directions with LPC. It is a standalone character alternative, not an LPC animation upgrade.

## Stardew reference and demo translation

ConcernedApe describes Stardew as an open-ended country-life RPG combining community relationships, farming, skill progression, and cave exploration for monsters and upgrade materials.[^12] The official-site-linked, community-maintained wiki provides useful mechanical detail: the **Secret Woods** combines seasonal forage, hostile slimes, renewable hardwood, and an entrance initially blocked until an axe upgrade. That is a closer forest reference than treating every outdoor screen as an arena.[^13]

Stardew’s slimes visibly flatten before a longer leap and also approach in slower hops. Knockback and defensive moves affect encounters.[^14] Combat experience produces skill progression and recipe unlocks; ordinary weapon use does not consume energy. Mine elevators preserve access every five floors, giving expeditions intermediate milestones.[^15][^16] These observations support readable preparation, visible progress, and a reason to return. They do **not** establish an elemental spell-combat system in vanilla Stardew.

Recommended demo loop, explicitly original design:

1. Start in a small village clearing with a visible forest path and one request: collect three herbs and two slime essences.
2. Let rabbits, deer, or other properly licensed animals wander in safe pockets. Wildlife should idle, turn, and flee coherently rather than behave like hostile reskins.
3. Place green slimes near forage and blue slimes deeper beside water. Give each a clear pause/squash, aimed hop, recovery, and bounded pursuit territory; retain a safe route back.
4. Begin with a readable basic spell. Show the gesture, launch direction, projectile travel, impact, damage, knockback, cooldown, and defeat/drop as one causal sequence.
5. Return resources to unlock a second spell with a distinct purpose, such as short-range frost control. Persist the unlock and acknowledge completion visibly.

Balance for a short excursion: few simultaneous enemies, forgiving recovery time, no damage at the arrival point, and no mandatory grind. Spell color alone should not communicate readiness or danger; use shape, motion, icons, and labels. Keep lush canopy mass around open combat clearings so trees frame the scene without hiding slimes or impact effects.

## Acceptance criteria

A reviewable demo should show the full gather–fight–return–unlock loop, tall unchanged LPC proportions, synchronized action layers, blue and green slime behavior, and independently animated wildlife. Spell feedback must agree with actual hit detection, cooldowns, and rewards. Verify blocked movement, forest exits, safe-zone behavior, single rewards per defeated enemy, restart/persistence behavior, and missing-asset handling. Record which forest art is actually installed. Exact ELV visual completion remains contingent on the licensed pack.

## Sources

All web sources accessed September 11, 2026. Undated product pages are identified by access date; wiki pages describe their current documented game behavior.

[^1]: ELV Games. [Fantasy Dreamland World](https://elvgames.itch.io/fantasy-dreamland-world). Product listing and creator replies.

[^2]: ELV Games. [Enchanted Forest](https://elvgames.itch.io/enchanted-forest). Product listing and creator replies.

[^3]: ELV Games. [Creator catalogue, Free Assets collection](https://elvgames.itch.io/). Current inventory.

[^4]: ELV Games. [Free Fantasy Dreamland Dungeon](https://elvgames.itch.io/free-fantasy-dreamland-dungeon). Released June 24, 2022.

[^5]: ELV Games. [Farming Animals](https://elvgames.itch.io/farming-animals-pixelart-asset-pack). Product listing.

[^6]: ELV Games. [Terms and Conditions](https://elvgames.itch.io/terms). Updated July 20, 2022.

[^7]: ELV Games. [Free TopDown RPG Retro Sprites](https://elvgames.itch.io/free-retro-game-world-sprites). Creator reply concerning open-source distribution.

[^8]: Eliza Wyatt. [LPC Revised README at pinned revision](https://raw.githubusercontent.com/ElizaWy/LPC/f07f7f5892e67c932c68f70bb04472f2c64e46bc/README.md).

[^9]: LiberatedPixelCup maintainers. [Universal LPC README](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/blob/master/README.md). Animation families and per-asset credits.

[^10]: Eliza Wyatt. [Pinned complete repository tree](https://api.github.com/repos/ElizaWy/LPC/git/trees/f07f7f5892e67c932c68f70bb04472f2c64e46bc?recursive=1) and [animation guides](https://github.com/ElizaWy/LPC/tree/f07f7f5892e67c932c68f70bb04472f2c64e46bc/Characters/_%20Guides%20%26%20Palettes/Animation%20Guides).

[^11]: Admurin. [Free Monster Pack Character 2](https://admurin.itch.io/free-monster-pack-character-2). Dimensions, layers, actions, and terms.

[^12]: ConcernedApe. [Stardew Valley — About](https://www.stardewvalley.net/about/). Official game overview.

[^13]: Stardew Valley Wiki contributors. [Secret Woods](https://www.stardewvalleywiki.com/Secret_Woods).

[^14]: Stardew Valley Wiki contributors. [Slimes](https://stardewvalleywiki.com/Slimes).

[^15]: Stardew Valley Wiki contributors. [Combat](https://stardewvalleywiki.com/Combat).

[^16]: Stardew Valley Wiki contributors. [The Mines](https://stardewvalleywiki.com/The_Mines).

## CraftPix combat assets for the forest demo

Three of the four requested CraftPix packs are available through the publisher's own free itch.io downloads and supply usable production animation frames. The requested boss pack is a collection of modular vector characters; its public description does not establish ready-to-play animation strips. The prepared demo assets therefore use the requested spell, trap, and explosion packs, plus the same publisher's animated pixel forest boss and pixel explosion alternatives. The result contains actual source animation frames, compact runtime atlases, and explicit playback metadata.

## Requested packs

| Requested pack                                | Source contents and access                                                                                                                                                                                                                                                                       | Suitability and prepared use                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free Magic and Traps Top-Down Pixel Art Asset | The official page describes pixel PNG/PSD art and explicitly excludes the illustrated location. The official download endpoint requests sign-in. The publisher's itch.io storefront supplies `Free-Magic-and-Traps-Top-Down-Pixel-Art-Asset.zip` through its free-download control. [^cp1][^cp2] | Strong fit for the pixel forest. Inspected production files contain six-frame 32×32 spike strips and eight-frame 48×48 barrel bursts. Those strips become `spike-trap` and `fire-impact`. The trap pack does not provide the forest terrain.                                                             |
| Free Water and Fire Magic Sprite Vector Pack  | Officially vector art with AI, EPS, and PNG formats. The author advertises fire and water spells, arrows, and orbs. Its official download requests sign-in; the same publisher's itch.io page supplies the complete free ZIP. [^cp3][^cp4]                                                       | The PNG archive contains eight Fire Spell frames, eight Water Spell frames, eight Fire Ball frames, and twelve Water Ball frames. Prepared bolts are 64×36, and casting orbs are 32×32. This is adapted vector artwork rather than native pixel drawing.                                                 |
| Free Fantasy RPG Top-Down Boss Creatures Pack | Officially three cartoon vector bosses: Shaman King, Devil Leader, and Boar King, with editable separate body parts and AI/EPS/PNG files. Its download endpoint also requests sign-in. A matching public author itch.io download was not established. [^cp5]                                     | No production archive was acquired. No frame count, timing, or complete action set is claimed. These modular assets would require assembly and possibly original animation before reliable LPC combat integration. The runtime uses the author's separately licensed animated pixel forest boss instead. |
| Free Animated Explosion Sprite Pack           | Officially a vector effects collection containing AI/PNG resources; the author's itch.io version supplies PNG files. Its free ZIP contains multiple numbered production frame sequences and an explicit license link. [^cp6][^cp7]                                                               | The blue splash at `PNG/Explosion_7/4` has four 150×150 frames and becomes the 48×48 `water-impact` atlas. The requested pack is represented in runtime. Larger death bursts use the related native pixel pack below.                                                                                    |

The site's authentication requirement is distinct from an asset price: these official pages are free products, but their CraftPix-hosted download pages require a signed-in account. Their publisher's public itch.io controls provide three corresponding archives without account creation or payment. No promotional image or animation montage is used as runtime source material.

## Alternatives selected for the demo

The author's **Free Pixel Art Explosions** collection provides fiery, water, chemical, and electrical effects as PNG animation frames. Its author comment points to the CraftPix license. [^cp8] Production files contain ten numbered frames each for `Circle_explosion`, `Explosion_blue_circle`, and `Explosion_gas_circle`. These become three separate death effects: orange fire, blue water, and green poison. Numeric sorting is essential: lexicographic order would place frame 10 between frames 1 and 2 and produce a visible jump.

The author's **Free Forest Bosses Pixel Art** advertises idle, walking, hurt, death, special, and multiple attack actions. [^cp9] The selected two-headed flower is the first character in that archive. The inspected action strips contain 4 idle, 6 walk, 6 attack, 4 hurt, and 6 death frames, all using 96×96 cells. It has a native side view, not four unique top-down directions. The runtime atlas preserves the native left view, adds exact horizontal mirrors for right, and openly reuses the side view for up/down. The green body and purple flower heads suit the forest palette, while the larger silhouette distinguishes it from ordinary wildlife.

The existing blue slime is rvros' **Animated Pixel Slime**, whose author page identifies the asset as CC0 and lists its five actions and 32×25 sprite dimensions. [^cp10] `green-slime.png` changes the five blue palette shades to a coordinated green palette while retaining the mouth's red shades, transparent pixels, pale highlights, and all original action geometry. This is an explicit palette variant, not a multiplicative rendering tint that muddies the source colors.

## Runtime atlas inventory

| Runtime asset     |  Actual frames | Frame size |        Cycle duration | Behavior                                                            |
| ----------------- | -------------: | ---------- | --------------------: | ------------------------------------------------------------------- |
| `fire-bolt`       |              8 | 64×36      |                400 ms | Loops; points east before rotation                                  |
| `water-bolt`      |              8 | 64×36      |                400 ms | Loops; points east before rotation                                  |
| `fire-cast`       |              8 | 32×32      |                360 ms | Once at the casting hand                                            |
| `water-cast`      |             12 | 32×32      |                360 ms | Once at the casting hand                                            |
| `fire-impact`     |              8 | 48×48      |                480 ms | Once; bright burst and smoke                                        |
| `water-impact`    |              4 | 48×48      |                240 ms | Once; blue splash                                                   |
| `fire-death`      |             10 | 128×128    |                650 ms | Once; orange explosion                                              |
| `water-death`     |             10 | 128×128    |                650 ms | Once; blue radial burst                                             |
| `poison-death`    |             10 | 128×128    |                650 ms | Once; green radial burst                                            |
| `spike-trap`      |              6 | 32×32      |                720 ms | Once; suggested impact at 240 ms                                    |
| `forest-guardian` |             52 | 128×96     |            Per action | Five actions, two prepared directions                               |
| `green-slime`     | 50 atlas cells | 32×25      | Existing slime timing | Five inherited actions; unused cells excluded from animation arrays |

Durations and suggested impact times are demo design choices, not supplied author timings. The atlas metadata records all finite frame coordinates; the TypeScript metadata identifies the exact playable indices. Short final rows include transparent padding, which is excluded from effect `frameCount` and from all animation sequences. The twelve PNG textures occupy 123,113 bytes in total.

The 640×360 spell PNGs are sampled to 64×36 with nearest-neighbor filtering. Alpha values are thresholded to create crisp edges, and the native left-facing art is mirrored so rotation zero means east. Both projectile origins are `(0.72, 0.5)`, approximately at the head, allowing the tail to trail behind the logical projectile position. Orb frames follow the same fixed-grid treatment. No animation interpolation or synthetic extra frames are introduced.

The ten-frame pixel death sequences are reduced from 256×256 to 128×128 by an integer factor of two. Their visible peak diameter is approximately 90 pixels, with substantial transparent space before the effect expands. The guardian uses an invariant foot position `(64, 96)` in 128×96 cells; mirrored frames are shifted by 32 pixels to align the plant's root with the native direction. A suggested scale of two produces a boss larger than the LPC player and retains the full attack reach.

## Permission and provenance

Every inspected CraftPix archive contains a text file linking to the same official license. The relevant freebie section permits modification and personal/commercial game use, including distribution of games. It does not grant unrestricted standalone art redistribution or artwork-export functionality. Attribution is optional. [^cp11] The runtime files are prepared for gameplay in this application; the original archives and unused source contents remain outside the public game assets. The assets are not relicensed as CC0 or as project-owned artwork.

The reviewed material does not resolve every possible public-source-repository distribution scenario. The applicable permission here is embedded game use. An asset-download service or reusable art-library release would need separate consideration under the author's restrictions.

| Downloaded source archive                            | SHA-256                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `free-water-and-fire-magic-sprite-vector-pack.zip`   | `e1445f9ea1c049bbf8f4ec9540b739b753f3052694cb4b7092bbbd67e27eeee4` |
| `Free-Magic-and-Traps-Top-Down-Pixel-Art-Asset.zip`  | `1cc50d7c51d8735a18e040c3a0dedc29cb29e110fb2926484a2b32b3e94a031e` |
| `Free-Animated-Explosions.zip`                       | `226dcf963fcedc78072a239501e54afe416176ccdec09d9fa2ef2a8f5efba8e5` |
| `Free Pixel Art Explosions.zip`                      | `09653dfa7537deee70c1538572bf32e8e2abdd58ac510da6865840cf1468992a` |
| `Free-Forest-Bosses-Pixel-Art-Sprite-Sheet-Pack.zip` | `f62de17653cffb76aa63a975de9450101c327e9a1ced54911960c84191894d8c` |

`public/game-assets/magic-demo/provenance.json` records the exact production files selected from each archive, each resulting PNG hash, all frame coordinates, and the transformations. `scripts/import-magic-demo.py` checks the pinned archive hashes before rebuilding the atlases. The originals reside under the ignored `test-results/asset-imports/` directory. The prepared scene metadata is `src/features/rpg/demo/magic-assets.ts`.

## Sources

All sources were reviewed for this integration on September 11–12, 2026. Pack pages do not consistently display publication dates; no unpublished release date is inferred.

[^cp1]: CraftPix. [Free Magic and Traps Top-Down Pixel Art Asset](https://craftpix.net/freebies/free-magic-and-traps-top-down-pixel-art-asset/). [Official download endpoint](https://craftpix.net/download/68082/).

[^cp2]: CraftPix / Free Game Assets. [Free Magic and Trap Top-Down Pixel Sprites](https://free-game-assets.itch.io/free-magic-and-traps-top-down-pixel-art-asset). Author's production ZIP download.

[^cp3]: CraftPix. [Free Water and Fire Magic Sprite Vector Pack](https://craftpix.net/freebies/free-water-and-fire-magic-sprite-vector-pack/). [Official download endpoint](https://craftpix.net/download/93501/).

[^cp4]: CraftPix / Free Game Assets. [Free Fire & Water Magic Spell Vector Pack](https://free-game-assets.itch.io/free-fire-water-magic-spell-vector-pack). Author's production ZIP download.

[^cp5]: CraftPix. [Free Fantasy RPG Top-Down Boss Creatures Pack](https://craftpix.net/freebies/free-fantasy-rpg-top-down-boss-creatures-pack/). [Official download endpoint](https://craftpix.net/download/114760/).

[^cp6]: CraftPix. [Free Animated Explosion Sprite Pack](https://craftpix.net/freebies/free-animated-explosion-sprite-pack/). [Official download endpoint](https://craftpix.net/download/38485/).

[^cp7]: CraftPix / Free Game Assets. [Free Animated Explosions](https://free-game-assets.itch.io/free-animated-explosion-sprite-pack). Author's production ZIP download.

[^cp8]: CraftPix / Free Game Assets. [Free Pixel Art Explosions](https://free-game-assets.itch.io/11-free-pixel-art-explosion-sprites). Author's production ZIP and author license comment.

[^cp9]: CraftPix / Free Game Assets. [Free Forest Bosses Pixel Art](https://free-game-assets.itch.io/free-forest-bosses-pixel-art-sprite-sheet-pack). Author's production ZIP download.

[^cp10]: rvros. [Animated Pixel Slime](https://rvros.itch.io/pixel-art-animated-slime). Author's asset description and CC0 designation.

[^cp11]: CraftPix. [File Licenses](https://craftpix.net/file-licenses/), section 2, Freebie Products. The license files in every inspected CraftPix ZIP link to this page.
