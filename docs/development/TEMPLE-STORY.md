# The Hollow Choir

The local demo now has an enterable Rootbound sanctuary. Start at
`/play/demo?area=temple`, meet Mira and Oren at the southern camp, and use **E** at
the northern temple door. Direct interior preview: `/play/demo?area=temple-interior`.

## Story and route

The choir called the forest keeper to protect their home, but performed a binding
rite instead. A root creature is feeding on the captive keeper.

1. Speak to the explorers outside, or read the threshold inscription inside.
2. Use the west and east levers to raise their gates. The east lever also stops
   the blade in its chamber; the central hall blade remains active. Pressure
   spikes in the west wing react on contact. Safe routes pass around the hazards.
3. Release the moon and sun seals in either order. The Bound Warden becomes
   visible and vulnerable only after both seals are broken.
4. Defeat the Warden with the existing combat system, then use the altar to free
   the keeper. Its native dispersal animation plays, the choir stops praying and
   steps away, and the remaining blade stops.
5. Open the west reliquary and return the recovered field notes to Mira outside.
   The supply chest and reliquary each give two healing herbs once.

The permanent rare item, loot tables and equipment effects are deliberately
undecided. Field notes and herbs are this demo's story reward. Notes are recorded
as a story fact, not a newly invented inventory/equipment item.

The south doorway always permits retreat. Falling returns the traveler to the
area's safe entrance; broken seals and collected rewards remain intact. Travel
keeps story progress, health, gear and supplies. Reloading starts a fresh local
story. The difficulty slider resets combat encounters but does not undo completed
story actions or revive a freed ritual.

## Shared systems and content ownership

- `src/domain/adventure/scenario.ts` owns renderer-independent story facts,
  prerequisite checks, interactions, objectives, defeat triggers and timed gates.
  `ScenarioProgress.snapshot()` can be supplied to a future storage adapter.
- `AdventureJourney` shares one story progress object across its area sessions.
  `AdventureSession` owns hazard damage, conditional encounter activation and
  the collision list used by enemies and projectiles. `RpgSimulation` receives
  only the changing gate blockers and rebuilds its path index when those change.
- `adventure/hollow-choir.ts` supplies the story text, coordinates, prerequisite
  flags and rewards. It does not implement bespoke combat or renderer rules.
- `ScenarioRenderer` selects native sprite clips from story conditions. It owns
  a fixed collection of sprites, uses the paused adventure clock, and respects
  reduced motion. Static stonework remains in the existing cached scenery path.
- `demo/temple-interior.ts` authors a larger three-room arrangement using the
  Ruined Temple art, preserving its native 16px assets at 2x. It does not stretch
  the original compact TMX layout to fit the LPC player.
- The existing accessible speech dialog and interaction button handle story
  actions. An objective replaces generic collection counts in the adventure HUD.
  Dialogs pause combat, traps, gate transitions and story character animation.

This is local gameplay, not authoritative multiplayer rewards. Production saves,
permission checks and server-owned reward transactions remain future adapters.

## Art and regeneration

Run `python scripts/import-temple-story.py` after placing the owner's pack in
`assets/free-ruined-temple-top-down-location-pixel-art`. It imports selected native
PNG cells plus the first lamp's static Aseprite pan/shadow for extinguished seals.
Generated files live in `public/game-assets/temple-story/` and
`adventure/temple-story-assets.ts`; source hashes and crop coordinates are recorded.
Format the generated TypeScript with the repository formatter after regeneration.

The scene uses all six cultist appearances, their pray/idle/walk clips, the leader's
summon/idle, both explorers, the ghost, two gate/lever/chest variants, native spikes
and blades, all five lamp styles plus the torch, and interior stonework/props.
The Bound Warden uses the separately imported Root Beast art. Cultists are story
NPCs; the pack has no dedicated attack/hurt/death set for them. Native water and
the supplied TMX maps remain available for later environmental work.

## Verification

- `pnpm exec tsx scripts/verify-temple-story.ts`: gated reachability, objective
  order, locked feedback, one-time rewards, return dialogue, serializable facts,
  travel/rescue retention, blade alignment and difficulty reset behavior.
- `pnpm exec tsx scripts/verify-forest-expansion.ts`: connected route graph,
  clear arrival points and reachable content, including the new interior.
- Chrome checks cover E/dialog/Escape, opening a gate versus walking into a closed
  one, seal extinguishing, native chest animation and supplies, mouse-aimed spell
  damage to the activated Warden, release animation, return dialogue and narrow HUD.
  Boss death was also supplied as a fixture to inspect the ending independently
  of combat difficulty; this is not a claim of a full manual no-assistance playthrough.
