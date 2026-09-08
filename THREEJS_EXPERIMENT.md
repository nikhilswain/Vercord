# Three.js world experiment

This branch demonstrates that Dmap's existing generated maps can support a playable low-poly 3D
view. Three.js supplies rendering and animated characters; the existing map definitions, room
layout, collision rules, React HUD, and presence coordinates remain the shared foundation.

## Try it

On `experiment/threejs-world`, run `pnpm install` and `pnpm dev`, then open:

- [3D demo](http://localhost:3000/map/demo?renderer=3d)
- [Original pixel demo](http://localhost:3000/map/demo?renderer=2d)

The demo uses fixture data and does not require Discord sign-in. The renderer also applies to the
existing authenticated `/world/:guildId` and public map routes. This branch defaults to 3D;
`?renderer=2d` selects Phaser. Renderer links preserve other query parameters but reload the page,
so position returns to the spawn point.

| Action                          | Control                                                |
| ------------------------------- | ------------------------------------------------------ |
| Move relative to the camera     | WASD / arrow keys; joystick on touch screens           |
| Run                             | Hold Shift, or double-press a movement key             |
| Walk to a location              | Double-click / double-tap the ground                   |
| Enter a nearby room or leave it | E, or the enter/leave button                           |
| Visit any room directly         | Open the Rooms directory and select a room             |
| Orbit / pan                     | Drag / right-drag; touch orbit and two-finger gestures |
| Rotate the camera               | Q / R or the rotation buttons                          |
| Zoom                            | Mouse wheel / pinch / zoom buttons                     |
| Frame the entire map            | Overview                                               |
| Return to the avatar            | Center on avatar                                       |
| Try the other character         | Change character (local demo only)                     |

## How the current map is generated

The Discord synchronization pipeline projects categories and supported channels into a
`MapSnapshot`; the renderer does not directly call Discord. The demo supplies the same shape using
fixture data.

1. `src/features/world/engine/village-world.ts` turns that snapshot into a `WorldDefinition`.
   Categories become packed districts; their room counts determine district sizes. A channel
   becomes a building with an entry portal. This generator also emits roads, decorations, collision
   rectangles, spawn points, and labels.
2. `engine/room-world.ts` builds an interior when a portal is entered. Text, voice, forum, media,
   and other supported channel types get their existing themed furniture arrangements.
3. `WorldCanvas.tsx` owns the React HUD and the connection to presence, voice, chat, and channel
   controls. Previously it created `WorldEngine`, the Phaser adapter, which rendered these
   definitions with Kenney pixel tiles.
4. Avatar identity comes from `src/domain/avatar/identity.ts`: a stable member hash selects one of
   twelve avatar IDs. The pixel renderer uses the existing animated character sheets for those IDs.

## What the experiment adds

`engine/world-runtime.ts` defines the small renderer contract shared by the Phaser and Three.js
adapters. `WorldCanvas` chooses an adapter; the rest of the application keeps its existing ownership.

- `three/world-simulation.ts` runs movement, collision, pathfinding, room entry/exit, and refreshed
  map reconciliation. A removed occupied room returns the player outdoors without triggering a
  new voice move. Click routes use the avatar's actual collision footprint; legacy Phaser
  pathfinding retains its original default footprint.
- `three/world-model.ts` builds plaster houses with pitched roofs, trees, roads, and furnished
  cutaway rooms from the generated definition. It aligns solid props with the existing colliders.
  `model-utils.ts` batches static geometry by material and disposes owned resources.
- `three/three-world-engine.ts` provides a perspective camera, orbit/follow/overview controls,
  shadows, ground picking, projected labels, and local/remote character rendering. The DOM room
  directory remains available when spatial labels are culled at wide zoom levels.
- The conversion is direct: map X becomes Three.js X, and map Y becomes Three.js Z. Height is
  visual. There is no new physics or server protocol; presence still publishes the same ground
  coordinates and `exterior` / `room:<key>` scene IDs. Remote players appear only in the matching
  scene.

The authored scenery uses a low-poly grass, plaster, slate, and clay palette. Controls keep Dmap's
existing navy/violet styling. Touch controls have 44px targets. Reduced motion freezes decorative
character animation and disables camera damping. Rendering pauses while the document is hidden.
WebGL failure presents reload and pixel-view recovery links.

## Characters and assets

The two user-supplied models are Quaternius's **Animated Woman** and **Hoodie Character**, downloaded
from their individual CC0 Poly Pizza pages. They are self-hosted under
`public/game-assets/three-characters/`; no external asset host is contacted during play. The files
total 2,987,376 bytes and each contains 24 clips. Source URLs, SHA-256 checksums, license links, and
the complete clip inventory are beside the files.

`three/animated-character.ts` selects the two models by alternating the existing avatar slots,
clones each skeleton independently, scales neutral height to 48 world units, and crossfades idle,
walk, and run. This is a sample assignment, not a member customization system. Twelve authored
procedural explorers in `character-model.ts` are visible while assets load and remain playable if
a download fails. Shared GLB resources are reference-counted; unused loads are aborted and GPU
resources are released when their final character is disposed.

The linked scenery bundle was not imported: its entries have mixed licenses. Houses, props, trees,
and fallback characters are original code-generated meshes. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for imported asset credits.

## Validation and limits

Validation on this branch:

- Production build, application/Worker/Gateway TypeScript checks, ESLint, and browser import
  boundary check passed.
- All 16 new unit tests passed: simulation/collision, refresh behavior, batched geometry/resource
  ownership, real GLB loading, independent skeletons, reduced motion, and failed/aborted loads.
- All 5 new Chromium browser tests passed against the production preview: both character downloads,
  room navigation, preserved camera zoom after movement, mobile controls, model-download failure,
  WebGL recovery, and switching between 3D and 2D.
- Desktop room and mobile overview captures received a visual review. Gateway tests passed (23).
- The broader client suite has 155 passes and one existing VoiceBeacon copy expectation failure.
  Worker tests have 372 passes and two failures where source-schema expectations omit
  `rateLimitPerUser: 0`. Those source/test files are unchanged by this experiment. Repository-wide
  formatting also reports existing files and local ignored notes; changed experiment files are
  checked separately.

To rerun the experiment checks:

```sh
pnpm exec vitest run --config vitest.client.config.ts tests/client/world/world-simulation.test.ts tests/client/world/three-models.test.ts tests/client/world/animated-character.test.ts
pnpm build
pnpm exec playwright test tests/e2e/three-world.spec.ts
pnpm lint
pnpm exec tsx scripts/verify-browser-import-boundary.ts
```

This remains an experiment. Live multiplayer, Discord chat, and voice callbacks are wired through
the existing owners, but were not tested end-to-end against a real Discord server. The presence
protocol still carries only four facing directions and a moving flag, so remote characters walk
without a distinct sprint state. It does not support stairs, jumping, or multiple navigable floors.

Both engines currently ship in the same application bundle: roughly 2.45 MB minified / 649 kB gzip
before model downloads, with Vite's large-chunk warning. The repository's browser import boundary
currently disallows dynamic imports; this experiment keeps that rule intact. Only the selected
engine initializes. Static geometry batching is covered on a 100-room fixture, but large live
guilds, many animated members, and lower-end mobile GPUs still need performance profiling before
production adoption.
