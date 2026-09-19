# Golden trail navigation

Open **Map**, select a house, place or saved pin, then choose **Navigate to**.
Follow the golden star glints and drifting motes. Navigation ends near the destination;
the small panel below the player HUD can also stop it. Houses route to their doorway.
Click empty map ground to create a pin; **Edit pin** is a separate action.

From gameplay, **Tab** opens Map. **Double-tap Tab** (within 350 ms) opens the
local atlas zoomed in around your traveler. **Space** still looks closer at the
selected area. **Esc** closes a foreground pin editor first and returns keyboard
control to the map. The next **Esc** zooms out; another **Esc** closes the map and
returns movement to gameplay. Separate presses work even before zoom finishes;
holding Escape never dismisses several layers. The close button closes directly.
**Tab / Shift+Tab never cycle focus between controls inside the game**, including
forms, chat and other panels. Typing fields retain focus and do not trigger the map
shortcut. Ctrl/Alt/Meta+Tab keep their browser/OS behavior. The simple interior maps
have no zoom level to dismiss.

Shared `Dialog` handles Escape on keydown, before the browser issues a native close
request. Consecutive native requests can have a non-cancelable `cancel` event;
preventing only that event let the map disappear while its game-input lock remained.
Native `close` events now synchronize the owner even when closure bypasses the
keyboard handler. Nested and stale close events cannot dismiss another dialog.
The browser regression in `tests/e2e/rpg-map-keyboard.spec.ts` leaves the pin form
untouched and sends consecutive Escapes after button, Tab and double-Tab opening;
typing or clicking between those presses would hide the original failure.

Navigation is opt-in. **Esc → Journey** and **Map → Journey** open the same journal.
**Follow story** remembers the player's preference without starting a trail.
**Show on map** previews the destination, while **Guide me** explicitly enables guidance.
**Pin objective** adds one optional HUD reminder. Completing a step clears that step's
pin and guidance; it never guides the next step automatically. **Explore freely**
removes story guidance and the objective pin, retaining progress and any separately
chosen map-pin/house navigation. Trails never restart automatically on reload.
See [JOURNEY.md](JOURNEY.md) for current playable content and persistence, and
[MOSSWILD_CAMPAIGN.md](MOSSWILD_CAMPAIGN.md#player-choice-follow-the-story-or-explore-freely).

The forest overview can navigate to another region or back to town. The route leads
to the next existing portal, waits for the usual interaction, then continues on the
other side. **This region** opens the same atlas/pin controls used by towns, showing
exits, shelter and discovered sites. Selecting a region ends guidance when you enter it.

## Modules

### Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Dialog | `src/components/Dialog.tsx` through `RpgDialog` | `DESIGN.md`; keyboard behavior above | Atlas stepped Escape; nested pin editor; direct close buttons | `tests/client/rpg/transient-ui.test.tsx`; browser pin-to-gameplay sequence |
| Keyboard | `atlas/use-map-shortcut.ts` and `AtlasController` | Keyboard behavior above | Game-only Tab capture; fields retain focus; browser modifier combinations retained | `tests/client/rpg/atlas-camera.test.ts`; `tests/e2e/rpg-map-keyboard.spec.ts` |
| Scrollbar | Existing atlas styles and `RpgDialog` | `DESIGN.md` | Native scrolling inside the existing map and pin frame | Desktop/mobile browser checks |

### Navigation modules

| Owner                                  | Responsibility                                                             |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `src/features/rpg/navigation/types.ts` | Typed pin/place/region/story targets, scene context and UI state                 |
| `navigation/destinations.ts`           | Destination factories and breadth-first routing over existing forest links |
| `navigation/session.ts`                | Route lifecycle, progress, recalculation, blocked and arrival states       |
| `RpgSimulation.navigationPaths`        | Shared collision-aware pathfinder, including dynamic gates                 |
| `navigation/trail-field.ts`            | Destination-anchored sparkle positions and time-based motion               |
| `navigation/trail.ts`                  | Pooled star/mote sprites, soft glow and camera culling                     |
| `navigation/NavigationControls.tsx`    | Shared destination actions, cancel/retry HUD and SVG map route             |
| `RpgScene` / `RpgGame`                 | Runtime integration through `guideTo` and `stopNavigation`                 |

Story targets carry a distinct owner, so a completed objective never cancels a
player's unrelated map destination. Forest site targets resolve their real coordinates
on arrival in the destination region; crossing its entrance is not site completion.
The original demo routes through its authored entrances and still respects temple
admission. New world connections belong in the destination resolver; movement,
rendering and UI do not need to know quest logic. Local targets carry a scene and,
where available, a forest area so they can continue through connected scenes.

## Behavior and limits

- Guidance is separate from click-to-walk. Starting it never walks, teleports or
  opens a door on the player's behalf. Movement remains server validated.
- The shared pathfinder routes around collision geometry. A destination on blocked
  ground may resolve to walkable ground only within its arrival radius. An impossible
  route reports an inline error and preserves any previous working destination.
- Arrival requires both a short remaining walkable route and proximity: 48 world
  pixels for pins, 56 for places. Being close through a wall does not count.
- Route checks run at most every 200 ms while the world geometry is unchanged.
  Leaving the route by over 48 pixels, losing a clear connector, or changing scene /
  collision geometry triggers a new search. Blocked routes retry on player movement,
  geometry changes or explicit Retry, rather than searching every frame.
- The pathfinder retains its existing bounded search budget. Very complex or
  disconnected routes may report no trail; selecting a nearer point is supported.
- The renderer shows only the next 900 world pixels, using a fixed pool of at most
  84 glints (two images each). It culls offscreen sprites and reuses particle records.
  There is no solid line in the world; the atlas retains its dashed route overlay.
- Sparkle spacing is measured backward from the destination, so trimming the route
  as the player moves cannot drag the field forward or accelerate its animation.
  Each glint has a stable identity, staggered lifetime, small forward drift and soft
  fade. Larger four-point stars alternate with smaller drifting motes. The engine
  clock controls animation; player speed and remaining route length do not.
- Reduced motion keeps a static, readable sparkle field. Rerouted glints fade in
  at their new location, and cancellation/arrival hides the complete effect.
- The two textures are unmodified, free CC0 assets from Kenney's Particle Pack.
  Tinting, glow, scale and animation are applied at runtime; credits and the original
  license live in `public/game-assets/navigation-sparkles/`.
- Houses use the server-filtered atlas directory and actual landmark identity.
  A removed house cancels its route. Undiscovered forest sites stay out of the map.
- Active guidance lives in the current game runtime. It survives connected forest
  transitions, but is cleared by reload / runtime replacement. Saved pins keep their
  existing browser storage, scoped to player, server, world and region. No database
  or gateway changes are needed for navigation.
- Forest links are the supported cross-region graph. Dungeon and house maps support
  local destinations; no unimplemented temple or interior portal routes are invented.

## Research

[Red Blob Games: Introduction to A*](https://www.redblobgames.com/pathfinding/a-star/introduction.html)
informed the separation of graph search from movement and presentation. The project
already has suitable collision-aware routing, so navigation reuses it.

[Phaser particles](https://docs.phaser.io/phaser/concepts/gameobjects/particles) and
[Phaser 4 rendering concepts](https://phaser.io/tutorials/phaser-4-rendering-concepts)
informed bounded, reusable rendering. A fixed image pool lets the same sparkles stay
anchored while the player walks, without an emitter for every path point.
[Kenney Particle Pack](https://kenney.nl/assets/particle-pack) supplies the CC0 star and
soft mote textures; the field choreography is authored for this game.

## Verification

`tests/client/rpg/navigation.test.ts` covers collision-safe paths, arrival, rerouting,
closed gates, removed destinations and multi-portal continuation.
`tests/client/rpg/navigation-ui.test.tsx` covers house identities and visibility,
pin selection/edit/deletion, keyboard activation and inline errors.
`tests/client/rpg/navigation-sparkles.test.ts` checks stable world positions and pace
while idle/walking/running, turn continuity, reduced motion and bounded work on long routes.
