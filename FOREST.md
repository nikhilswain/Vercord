# Mosswild Forest — first world milestone

The complete [discovery text](stories/mosswild.md) is generated from the same region
catalog the game reads. `pnpm story:docs` and normal builds keep it up to date.

The small combat/story demo remains available. The larger forest is a separate,
reusable expedition connected to saved server towns through the **Mosswild Forest**
waygate. Its vine-covered stone arch stands in a separate peripheral clearing, joined
to the existing lanes by a walkable approach. Placement checks the full saved art
and collision geometry, including channel houses hidden from the current member.
Houses, decorations and collision geometry stay in place. The same placement
determines the return position on the server. The shrine reuses CraftPix's free
Ruined Temple arch, with an original pixel rune circle and restrained gold motes;
see [credits](public/game-assets/waygate/CREDITS.md).

For a local preview, run `pnpm dev` and open
`http://localhost:3000/play/demo?forest=verge`. Use **E** at marked trails to change
regions or return to town. **Map** shows the region connections, the route home,
local paths and discovered places. Selecting a local place centers the camera;
it does not teleport the traveler. The old demo is `/play/demo` without `forest`.

## Geography and exploration

Mosswild has twelve connected regions: Verge, Alder Run, Greater Fern Hollow,
Lantern Wood, Stillwater Basin, Bracken Marsh, Old Ward, Rootbound Reach,
High Boughs, Foxglove Ridge, Moonmere and Elderheart. Seventeen two-way connections
allow loops and alternate routes. Verge connects to town.

Each region covers 8192 × 7168 world pixels and contains sixteen clearings, eight
named discovery sites and a sheltered central clearing. A typical seed now contains
roughly 150 creatures: around 110–120 hostiles and 35–45 animals. Most fights are
singles or pairs, with an occasional three-slime encounter where a clearing has room.
About half the hostiles occupy actual roads, distributed across the region; the rest
live along woodland approaches, including tree edges. Two or three large guardians
have separate territories. The deeper ward/root regions also contain a rare Root Beast.

Encounter spacing accounts for enemy aggro, patrol and pursuit ranges, with larger
buffers around bosses. Separate groups cannot overlap their reserved fighting space.
Road sampling includes short bends and junctions, followed by a light-encounter pass
that fills suitable gaps. Encounter compositions come from shuffled decks rather than
independent large-brood rolls. Wildlife has its own spacing: timid animals can appear
in pairs, while defensive bears, wolves and boars live singly. None attacks unprovoked.

Spawn points use the world and region seed and a walkable flood fill; water, solid
scenery and safe portal/camp areas are excluded. Re-entering does not reroll them.
Living road guards obstruct walking and auto-running through their bodies; killing
them clears the passage. A lunge overlapping the player never prevents escape.
Hostiles make short idle patrols. Ordinary forest hostiles spawn 1–2 levels above the
traveler; elites 2–3 above (capped at 20). Untouched enemies outside combat adapt as
the player levels; injured or defeated enemies never heal from scaling. Wildlife
retains its existing policy. Explicit demo difficulty overrides still work.

Only nearby creatures simulate; creature render objects are created for the visible
area and released beyond it. All placement/index work runs on region construction,
not every frame. Population **v4** uses new enemy IDs: previously visited regions get
one fresh set of encounters; inventory, XP, discoveries, story and gathered plant IDs
are retained. New defeats then save normally. The authored temple fights are unchanged.

The pacing direction draws on [Valve's AI Systems of Left 4 Dead talk, slides 77–81](https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf):
vary pressure and leave breathing space between fights. The placement uses a spatial
index and variable minimum distances, inspired by [Bridson's Poisson disk sampling paper](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf).
This is deterministic encounter placement, not a live adaptive difficulty director or
an implementation of Bridson's exact algorithm. Automated checks cover 12 regions
across three seeds, small group limits, road coverage, collision/reachability, safe
arrivals, level scaling, and repeatable saves. Actual playtesting should tune the
cadence further; the encounter cards and spacing policy live in
`src/features/rpg/forest/encounters.ts`.

## Hearthstone

Every inventory, including old saves, receives exactly one permanent **Hearthstone**
under **Items**. It is always equipped, cannot be consumed or removed, and has no
charges. **G** or the inventory action returns from a forest, house or dungeon to
the current server's town. Town use gives feedback instead of reloading the world.
The brief rune/mote effect locks movement and local combat during departure, then
checkpoints progress before the existing authenticated travel flow. Repeated keys
cannot submit multiple trips; chat/text input, modifiers and open dialogs ignore G.
Reduced motion keeps a static rune effect; render resources are released on scene exit.
This uses existing local journey persistence, not a new backend inventory service.

Discovery scenery follows the place: rock perches, old trees, flower clearings or
broken, overgrown stonework. Approaching a site records its discovery; interacting
reads its environmental description. The old repeated bright tile platforms are gone.

Rootbound Temple is playable in server expeditions through the **outer-approach
arch in Rootbound Reach**. The original demo route also remains available. Greater
Fern Hollow is its own large region; follow its routes toward Lantern Wood and
Rootbound Reach for the temple chapter. See the chapter section below.

**Three to six hours of worthwhile exploration is the design target, not a measured
playtime claim.** This milestone supplies the connected landscape and exploration
foundation. Distinct encounters, more authored landmarks, secrets, quest pacing
and player testing must establish that playtime. Item grinding, cooking, the remaining
regional story chapters and the second campaign phase are later milestones.

## Ownership and persistence

- Each world's forest identity is stored separately in its existing Durable Object:
  `forest:<worldId>`. It pins `mosswild-v1` and the world's seed. Invalid saved identity
  fails closed; loading it never replaces the town document.
- Client rendering and server collision checks use the same deterministic layout.
  Only the current region is built on the client. Terrain textures and rendering
  are bounded/cullable, and distant encounters sleep outside the simulation radius.
- Forest regions have distinct authenticated presence partitions. Players in the
  same region see each other; town and other-region avatars stay separate. Position
  and appearance use existing server persistence. Scene changes restore the correct
  connecting entrance; reconnecting in the same scene restores the saved position.
- Inventory, health, progression, discoveries and cleared encounters currently form
  a **local browser journey**, scoped by world and member. They survive reloads in
  that browser. Clearing browser storage or changing devices does not transfer them.
  Failed browser writes are reported in the forest map/guide.
- Combat and resource state are still local, not synchronized or trusted multiplayer
  rewards. Chat and party membership retain their existing server authority.
- No database migration or new paid asset is required by this milestone. The later
  PostgreSQL/backend plan remains deferred in `BACKEND_ARCHITECTURE.md`.

## Maintaining the region content

`src/domain/world/forest/catalog.ts` owns region identities, connections, names and
discovery descriptions. `layout.ts` owns versioned geometry. Runtime encounters and
signs live in `src/features/rpg/forest/presentation.ts`; the map and browser saving
are next to it. Keep `mosswild-v1` stable after publishing saved forests. Publish a
new content version and an explicit migration when geometry needs to change.

Validation covers connected walkable routes to every site and exit, safe spawns,
deterministic generation, route/schema guards, journey restoration, authenticated
forest opening, presence separation and return/reconnect positions.

## Rootbound Temple — playable server chapter

Rootbound Reach’s **outer approach** now has a marked temple arch. It enters the
courtyard, where Mira explains the keeper’s binding. Defeat the courtyard Root
Beast to open the sanctuary. Raise the west/east gates and release moon/sun seals
in either order, defeat the Bound Warden, free the keeper, recover the notes from
the west reliquary and return them to Mira. The south passages return to Rootbound
Reach; G still recalls to the same server town.

Esc → Journey and Map → Journey describe the current step. The forest clues lead
into this chapter, but free exploration can reach the temple first. Guidance only
starts with Guide me. The forest map marks the temple under Rootbound Reach and
shows local courtyard/sanctuary maps when inside. These are two authored areas,
not two more generated forest regions. Existing forest geometry and discovery IDs
remain stable; the arch uses an existing clear area without advancing the RNG.

`forest=temple` and `forest=temple-interior` use the existing authenticated world
API and scene-isolated presence, with collision/arrival geometry from the domain.
`temple-layouts.json` is the published geometry artifact from the existing temple
scene authoring; regenerate via `pnpm exec tsx scripts/export-temple-layouts.ts` when
changing those layouts. A parity test checks it against the authored scenes.
Inactive temple samples expose objective data without preloading temple textures.

Guardian defeats, gates, seals, rescue, notes and handover use the shared Journey
snapshot, scoped to this member/world in this browser. Refreshing or recalling does
not reset the chapter. A fresh/locked sanctuary bookmark returns to the courtyard.
Quest admission and combat remain client-owned; they are not server-authoritative
progression yet. This change does not migrate storage or implement the larger
campaign’s regional puzzle chains. See JOURNEY.md and MOSSWILD_CAMPAIGN.md.
