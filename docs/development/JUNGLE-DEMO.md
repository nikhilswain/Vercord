# Village and jungle playground

Scope agreed September 11, 2026: extend `/play/demo` with a live LPC/Tiago character
comparison and one local forest adventure. Keep the selected traveler through combat
and both directions of travel. No Discord mutations, purchases, or server combat protocol.

The playable demo:

- Three dressed Tiago idle/walk samples appear as NPC visitors and in **Look**.
  A uniform 0.8 scale keeps their proportions at about 51px high beside LPC's 47px.
- Follow the northwest village path to **Mosswild Jungle**, then press **E**. The
  southern jungle trail returns to the village. The selected body and safe positions
  survive both directions of travel.
- Five encounters: three slimes, one snake and one bear. **Space/J** swings a sword;
  move away from the warning circle to dodge an enemy's locked attack.
- **E** gathers golden healing herbs or blue moonblossoms. **H** consumes one herb
  to heal up to 40 health. Touch users have the joystick and action buttons.
- Health loss returns the traveler to a safe camp without losing gathered flowers.
  Panels, hidden tabs and inactive windows pause combat. Reduced motion suppresses
  decorative motion and the screen transition.

Progress is local and retained between Willowmere and Mosswild during one runtime
session. Reloading or switching to another world theme resets the adventure. This
is an asset/gameplay trial, not saved quests, multiplayer combat, or server inventory.

## Module boundaries

All new content lives in `src/features/rpg/demo/`:

| Module                                  | Owns                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `scenes.ts`                             | Authored village comparison and jungle terrain, clearings, entrances and spawn data             |
| `adventure.ts`                          | Pure encounter state, health, cooldowns, collision, drops, collection and rescue                |
| `adventure-renderer.ts`                 | Creature sprite pool, native action playback, warnings, sword and flower effects, water ripples |
| `traveler.ts`                           | LPC/Tiago rig adapter; native frames and feet anchors stay out of simulation                    |
| `tiago-assets.ts`, `wildlife-assets.ts` | Audited URLs, frame maps, dimensions, origins and animation coverage                            |
| `AdventureHud.tsx`, `demo.css`          | Health, objectives, feedback and responsive touch actions                                       |

`RpgDemoPage` owns local `?area=jungle` routing and its transition. `RpgSample.demo`
is runtime-only metadata. The shared scene invokes the optional demo controller;
saved map schemas, server scene IDs, appearance validation and presence messages
are unchanged. Jungle and village use distinct local position and atlas-pin keys.

To add a creature, extend the demo creature union and gameplay stats, add a verified
atlas entry, and place an encounter in the authored scene. Keep unknown/missing
animation states explicit in the asset metadata. To add a persistent theme to the
real product, use [Adding themes](ADDING-THEMES.md) instead of promoting demo IDs
into the network protocol.

The jungle uses one baked ground layer and cached source textures. Static trees do
not regenerate during panning. Five creature views are allocated once per scene,
offscreen views are skipped, effect storage is capped at 16, and encounter UI updates
use the existing 100ms state publication boundary. A scene crossing rebuilds its
presentation; it does not redownload cached textures.

Animation policy: 2D attack frames cannot be retargeted from Admurin to LPC or Tiago.
The demo keeps each traveler's body and uses a shared sword effect; the free Tiago
sample only supplies idle/walk. Native LPC weapon poses can be added through the rig
adapter later. A different character pack is never silently substituted for combat.

Future direction: LimeZu pets when the licensed source files are available; Electric
Lemon wildlife for forest encounters; world-specific interiors, quests, mounted travel,
and richer scenery later. LPC forest wildlife remains excluded from this experiment.
LimeZu/ELV/Time Elements are candidates for separate coherent worlds, not a license to
mix unlicensed preview images into the game.

## Sources and validation

Tiago's free sample and Electric Lemon's wildlife allow commercial game use, with
restrictions on standalone asset redistribution. rvros' slime uses CC0. See the
in-game **Menu → Art & font credits**, `public/game-assets/tiago-demo/README.md`
and `public/game-assets/jungle-demo/CREDITS.md` for precise sources and coverage.
The jungle scenery reuses the credited LPC world tiles with an authored forest
layout and tints; it does not contain LimeZu or ELV paid scenery.

Validated with frontend TypeScript, scoped ESLint, production Vite build, focused
reachability/combat checks, and Chrome desktop/touch playthroughs. The focused
checks cover all 13 destinations, cooldowns, damage/dodging, once-only gathering,
healing limits, recovery and safe camp behavior. No historical test suites were run.

A local Chrome desktop sample during movement and zoom measured 211 update calls,
0.25ms mean / 0.6ms p95 CPU time in the scene update, with 204 scene objects and
151 cached textures unchanged before/after. This is a short development-machine
sample of update work, not a GPU or cross-device frame-rate guarantee.
