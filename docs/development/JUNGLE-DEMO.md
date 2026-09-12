# Village, jungle and magic playground

Updated September 12, 2026. Open `http://localhost:3000/play/demo` with the local
frontend running. No gateway is needed for this standalone demo.

The equipment pass adds native LPC melee, 24 equipable weapon illustrations and
two animated forest fighters. See [Shared equipment and adventure combat](ADVENTURE-COMBAT.md)
for the reusable balance/profile modules, normal-world integration and demo overrides.

The demo now uses LPC travelers throughout. Tiago's trial characters and the
rotating sword have been removed following visual review. Six additional ivory
variants add blonde, white, red, pink and blue hairstyles and different full shirts:
Mira, Finn and Lumi in Willowmere; Elin, Astrid and Kaia in Frosthavn.

## Playing

- Choose a traveler with **Look**. Follow the northwest village path, meet the
  naturalist, and press **E** at the Mosswild Jungle entrance.
- Move and face with **WASD** or the touch stick. **Space/J** casts toward the
  nearest visible creature ahead, otherwise along your facing direction. The
  target is locked when casting starts; projectiles do not home or pass through trees.
- **I / Equipment:** equip swords, axes, spears or staves at any tier in the demo.
  **3** selects melee; **Space/J** plays native slash/thrust frames and deals damage
  at contact. The enemy level slider resets encounters at levels 1–20 and returns
  you to camp without clearing XP or flowers. Repeated defeats do not award extra XP.
- **1 / Ember:** a fire bolt deals 30 impact damage and burns for up to 2 seconds.
  **2 / Tide:** unlocked at level 2; deals 24 damage, extinguishes the target's burn,
  slows it for 2.6 seconds and pushes it away within collision bounds.
- Casting has seven native LPC body/arm poses over 700ms. The projectile releases
  at 400ms. Movement pauses for the gesture; another cast becomes ready after recovery.
- **E** gathers golden herbs or blue moonblossoms. **H** consumes one herb to
  restore up to 40 health. Full health does not consume herbs.
- Gathering and combat award experience. Level 2 requires 30 XP and teaches Tide;
  level 3 requires 100 XP and adds 3 spell impact damage; later levels add another
  3 each. Staff bonuses also apply to spell impacts. Burn ticks remain 4 damage.
- Three slimes (blue and green), a snake, a bear, a Thornbloom guardian, a Forest
  brute and a Forest skirmisher occupy
  separate clearings. Move out of enemy warning circles before their locked attack.
  Two spike traps warn, rise, hold, and retract; damage follows the same state as the art.
- Collect all three moonblossoms and clear the eight encounters. The south trail
  returns to Willowmere. A defeated traveler recovers at the safe arrival camp.

Progress, appearance and positions survive village/jungle crossings in one runtime
session. Reloading or changing world themes resets the adventure. This is local
prototype progression, not persistent inventory, multiplayer combat or saved quests.
Dialogs, panels, inactive windows and hidden tabs pause combat. Touch buttons cover
casting, spell selection, gathering and healing. Reduced motion keeps meaningful
action poses while suppressing decorative motion and the travel fade.

## Forest art status

**The exact selected ELV forest is not installed.** The Art directions page displays
public previews. The owner confirmed they do not own Fantasy Dreamland World yet.
The current forest uses the credited LPC world assets with brighter colors and
authored clearings; it is provisional scenery, not ELV artwork. Once an owned pack
is available, verify its packaged license and use 16px terrain at 2× alongside the
unchanged approximately 47px visible LPC characters. Check doorways, trunks, canopy
occlusion and water collision in a small comparison before replacing the whole forest.

The [research report](../requirements/research/FOREST-MAGIC-AND-LPC-2026-09-12.md)
records the requested four CraftPix packs, actual frame inventories, public author
download sources, ELV availability, animation compatibility and Stardew inspirations.
Stardew informs the gather–explore–fight–return structure; this elemental system is
an original Dmap experiment, not a reproduction of vanilla Stardew combat.

## Module boundaries

| Module                                            | Responsibility                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/features/rpg/demo/scenes.ts`                 | Village entry, authored forest, clearings, enemies, flowers and traps                |
| `adventure/session.ts`                            | Shared casting/melee simulation, projectiles, damage, rewards, collection and rescue |
| `adventure/renderer.ts`                           | Fixed sprite pools, frame playback, telegraphs, spell effects and ripples            |
| `src/domain/adventure/`                           | Shared weapon/enemy balance, equipment policy and versioned player progression       |
| `demo/magic-assets.ts`, `demo/wildlife-assets.ts` | Asset dimensions, origins, action frames, timing and provenance                      |
| `demo/AdventureHud.tsx`, `demo/demo.css`          | Health, level, objectives, spell choice and touch controls                           |
| `character.ts`                                    | Shared LPC rig; optional local `castElapsedMs` synchronizes six authored layers      |

`RpgDemoPage` owns `?area=jungle` and the entry/return transition. `RpgSample.demo`
is runtime-only metadata. Village and jungle have distinct local position and atlas
pin keys. The optional runtime `selectSpell` command stays in the demo; server
movement messages still carry only their existing locomotion actions. New wardrobe
IDs participate in the existing catalog-derived appearance validation.

To add a spell, extend the shared adventure spell ID and status, define its cast/release/recovery
and hit behavior in the model, prepare a licensed atlas with metadata, then add its
selection control. To add a creature, add stats, a verified action mapping and one
encounter spawn. Keep the model's impact timing aligned with the chosen sprite pose.
Do not derive collision dimensions from transparent sheet padding. For a persistent
theme, use [Adding themes](ADDING-THEMES.md).

The renderer allocates eight creature views, two traps, eight projectile sprites,
sixteen effect sprites and one casting orb. Static scenery uses the existing baked
ground and cached textures. Zoom does not rebuild the world. Source textures remain
cached across scene crossings; casts load only in demo runtimes. UI publication uses
the existing 100ms boundary. Model effects and projectiles have fixed caps and lifetimes.

## Art and reproducibility

- `scripts/import-lpc-casting.mjs`: seven authored Expanded LPC poses, palette and
  head-offset adaptation to the current wardrobe. Source revision, hashes and per-file
  credits are in `public/game-assets/lpc-characters/casting-manifest.json`.
- Two derived masculine casting body sheets use **CC-BY-SA 3.0**; other cast layers
  use **OGA-BY 3.0**. Preserve the supplied credits and licenses when redistributing
  these art derivatives. This does not relicense unrelated project code.
- `scripts/import-rpg-wardrobe.mjs`: credited native LPC colors/hair/shirts.
- `scripts/import-magic-demo.py`: verifies pinned CraftPix archive hashes, extracts
  actual frames, prepares compact atlases, and records transformations. Raw archives
  remain under ignored `test-results/asset-imports/`; game-ready art and its notices
  are in `public/game-assets/magic-demo/`.
- CraftPix freebie terms allow modified commercial game use and restrict standalone
  art redistribution. The guardian uses the separate **animated forest bosses** pack,
  not the requested modular vector boss pack. Vector-origin spell PNGs are deliberately
  reduced; native pixel explosions supply the larger defeat bursts.
- Existing wildlife credits remain in `public/game-assets/jungle-demo/CREDITS.md`.
  The green slime is a documented palette variant of rvros' CC0 blue slime.

## Verification

The September 12 pass completed `pnpm build` (including frontend, worker, node and
gateway type checks), scoped ESLint, the browser import boundary, and
`pnpm exec tsx scripts/verify-magic-demo.ts`. Chrome checks covered the real cast
frames/release, level-2 unlock, water slow/push, map pause, and herb/appearance/XP
retention through both portal directions. The 390×844 touch layout had no document
overflow or overlapping action controls. Console checks reported no errors.

Before the equipment pass, a short desktop movement/zoom/casting sample recorded 217 scene updates at a mean
0.28ms and p95 0.5ms of JavaScript scene-update time. Object count stayed at 234 and
texture count at 224; pools stayed at 8 projectile and 16 effect sprites. This is a
local CPU sample, not a GPU or all-device frame-rate guarantee. The production build
still reports the existing large shared client bundle warning.

Use focused model checks for release timing, cooldown, blocked shots including corners,
single rewards, water slow/push, trap warnings and travel cleanup. Check route clearance
for every encounter, flower and exit. In Chrome, verify actual input-driven cast poses,
spell unlock/selection, gather/return persistence, panel pause and mobile overlap.
Run frontend TypeScript, scoped ESLint and the browser import boundary before a build.
Historical suites are not required for this local art/combat experiment.

Future notes retained: distinct house interiors for activities, LimeZu pets when
licensed source files are available, forest quests and collection rewards, more wildlife,
horse travel transitions, and coherent theme-specific scenery. None requires swapping
the player's character body mid-quest.
