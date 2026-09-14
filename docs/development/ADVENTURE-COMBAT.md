# Shared equipment and adventure combat

Updated September 14, 2026. The playable example is `/play/demo?area=jungle`.
Aim and **left click** (or tap a spot) to attack. Press **I** for equipment, **3** for melee, and **1/2** for
Ember/Tide. All 24 free weapons can be equipped in the demo. Its encounter slider
sets levels 1–20 and explicitly resets enemies and returns the player to camp.
XP and gathered flowers survive this reset; the same enemy cannot award XP twice.

For the connected forest and temple, native plants, hostile projectiles and area lifecycle,
see [Connected adventure areas](ADDING-ADVENTURE-AREAS.md).

## Cursor combat and pressure plates

WASD/arrows move, Shift runs, middle-button drag pans in combat, and touch drag
pans without attacking. Village double-click navigation and left drag are unchanged.
Space is unbound for combat; the atlas retains its separate Space actions. J and
the HUD attack button provide a facing-direction fallback. Canvas right-click and
middle-click browser actions are suppressed; DOM controls keep their normal behavior.

`AdventureSession.attack(player, facing, target?)` accepts a world-space input
target and never selects a creature. Spells lock that direction at cast start,
travel straight, collide with scenery and the first enemy, and expire at finite
range. `src/domain/adventure/spells.ts` owns initial ranges/speeds: Ember 320 world
units at 290 units/s; Tide 360 at 340 units/s. Range includes the launch offset.
Changing camera zoom or clicking farther away cannot extend it. A wall inside
the launch offset also blocks the spell. `adventure/aim.ts` shares the projectile's
22-unit display elevation with the renderer so the visible ray passes through
the cursor at any zoom. The simulation remains on the ground plane.

Melee turns to the closest native LPC cardinal facing and keeps that family's
existing visible strike arc, reach, contact frame and recovery. This is a four-
direction melee rig; it does not promise a continuously rotated 360-degree sword.
Clicks during cooldown, camera drags, modal controls and a held Space do not
queue delayed attacks or navigation. Menus still pause the encounter.

Traps now default to `activation: 'pressure'`. Contact raises the active sprite
and applies damage in the same simulation tick (at most one rendered frame).
A swept foot segment catches steps across a plate. Standing on it keeps it raised
and dangerous after the existing damage-invulnerability interval; leaving it
allows a 350ms hold then a 120ms retraction. Spawn/rest/reset clears contact history.
`activation: 'timed'` explicitly opts into the older offset-driven cycle for future
authored timing puzzles. `getTrapState(index)` supplies both simulation and renderer;
never introduce a separate visual timer. See `src/domain/adventure/traps.ts`.

Asset research and proposed future encounters:
[Jungle enemies, arenas and hazards](../requirements/research/JUNGLE-ENEMIES-AND-ARENAS-2026-09-14.md).

## Reusable modules

| Module                                                                  | Responsibility                                                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/domain/adventure/weapons.ts`                                       | Stable weapon IDs, families, tiers, damage, reach, action/recovery timing, unlock levels and staff spell bonuses |
| `src/domain/adventure/equipment.ts`                                     | Versioned serializable player progression, ownership, equipment validation, grants and saved-data sanitization   |
| `src/domain/adventure/progression.ts`                                   | XP thresholds, level caps and enemy power scaling                                                                |
| `src/domain/adventure/enemies.ts`                                       | Creature balance, telegraph/contact/recovery clocks and level-based spawn policy                                 |
| `src/features/rpg/adventure/session.ts`                                 | Shared collision-aware simulation: attacks, projectiles, damage, rewards, gathering and rescue                   |
| `src/features/rpg/adventure/renderer.ts`                                | Cached creature views, fixed projectile/effect pools and animation playback                                      |
| `src/features/rpg/adventure/animation-clock.ts`                         | Maps each skin's native contact frame onto the gameplay attack clock                                             |
| `src/features/rpg/character.ts`, `melee-assets.ts`, `weapon-visuals.ts` | LPC body/clothing poses with exact item images attached to per-frame hand anchors                                |
| `src/features/rpg/demo/equipment.ts`                                    | Joins shared definitions to names and inventory illustrations; contains no balance rules                         |
| `src/features/rpg/demo/scenes.ts`                                       | Authored village/forest content and demo portal routing                                                          |

The pure domain modules import no React, Phaser, browser storage, assets or demo
code. Normal equipment requires both ownership and the weapon's unlock level.
The demo passes `DEMO_EQUIPMENT_POLICY` explicitly; this bypass grants neither XP
nor ownership and still rejects unknown weapon IDs. Difficulty resets are enabled
only when the session was constructed with `enemyLevelOverride`.

## A real world's integration

Use the same rules and session with a validated profile and without demo overrides:

```ts
const profile = sanitizePlayerProgression(await profileStore.load(playerId));
const session = new AdventureSession(content, colliders, bounds, spawn, casting, {
  progression: profile,
  safeAreas: contentSafeAreas,
});
session.equip('sword-2'); // succeeds only when owned and level >= 4
const snapshot = session.getProgression();
```

`profileStore` above is an integration example, not an implemented storage service.
The profile has `{ version: 1, experience, ownedWeaponIds, equippedWeaponId }`.
`grantWeapon` handles loot/quest rewards; `grantExperience` advances XP. Grants do
not silently equip a weapon. `sanitizePlayerProgression` rejects unsupported
versions, removes unknown IDs, normalizes XP and restores a valid starter when
saved equipment is locked or unowned. Keep the normal policy at the save boundary.

Normal encounter levels derive from the profile's XP; an authored `elite: true`
spawn is one level higher, capped at 20. Health and damage are calculated at spawn,
so a mid-fight player level-up does not unexpectedly heal an existing enemy.
Protected areas are explicit rectangles supplied by the map. The shared session
does not assume that south of a spawn is safe.

**Server persistence and multiplayer combat are not enabled by this change.** A
real-world service must own XP grants, inventory grants, validated equipment and
encounter outcomes. Browser profile snapshots are not proof of earned rewards.
Use the pure domain functions in that service and persist by the chosen player
scope; do not copy these rules into a second demo/production implementation. The
existing movement/presence protocol remains separate from combat commands.

## Balance and animation contracts

Each family has six tiers with unlock levels **1, 2, 4, 7, 10, 15**. Damage rises by
8 per tier. Swords start at 17 damage, axes at 25, spears at 15, and staves at 11.
Staves also add 3–18 spell damage. These are initial tuning values in one catalog.

Swords/axes use native LPC slash poses; spears/staves use thrust poses. Axes have
slower recovery and spears have longer, narrower reach. Damage occurs once at
the authored contact phase, within the facing arc and only across unobstructed
space. Movement pauses through the action. Equipping during a paused action
cancels its unreleased attack but retains recovery; launched spells keep their
original damage. This prevents swap-based cooldown or damage exploits.

The rig normalizes a family's playback speed onto its native frame clock. Enemy
skins can have different source timing: `attackAnimationTime` maps native impact
and recovery endpoints onto the shared enemy definition. Never run a second
independent damage timer in the renderer.

To add a weapon tier, extend the shared catalog and add the matching asset entry.
To add a family, also supply verified native body/held-weapon poses and its melee
hit shape. To add an enemy, define its shared stats, verified animation metadata
and authored spawn. Terrain and UI theme changes should not change combat rules.

### Difficulty and hazards

`enemyBehavior(kind, level)` is the shared behavior policy, cached per encounter
when it spawns or resets. Levels 1–5 use slower single attacks. Above level 5,
chase speed, reaction, animation and recovery become progressively faster. Different
creatures unlock two-strike combinations; skirmishers reach three strikes at level 15. Higher levels briefly track and lead movement during preparation, then lock
the attack target before lunging. Repeated hits still deal damage but cannot keep
a veteran permanently staggered. Invulnerability ends before the next combo strike.

Preparation uses a native body pose, slight anticipation and color change. There
are no enemy ground warning circles. Contact reach includes only the travel the
enemy can complete before its hit frame. Partial-frame lunge movement is integrated
on both sides of contact, so low frame rates do not shorten attacks or give extra
travel before damage. The animation adapter consumes the encounter's scaled clock.

`src/domain/adventure/traps.ts` owns visible frames and damage together. The demo
uses immediate pressure plates as described above. Explicit timed traps retain
the older 930ms/420ms activation and 2s/1.3s cycles at levels 1/20 respectively.
The demo level reset clears pressure plates and updates the shared behavior cache.

## Asset decisions and reproducibility

- [Truly Malicious Weapon Set 1](https://trulymalicious.itch.io/weapon-set-1-free)
  supplies 24 static transparent inventory illustrations under CC BY 4.0. The
  author discloses AI-assisted creation. The free archive includes four families;
  elemental weapons are premium-only and were not imported. Names preserve the
  author's variants, including Woodcutter axe and White staff.
- Inventory illustrations are not animation sheets. Combat now renders those exact
  same 24 images without tint. `weapon-visuals.ts` defines each item's grip, axis and
  size and the hand positions for each native LPC body frame. The item follows the
  hand through the attack; foreground fingers cover the handle where appropriate.
  Contact frames point the blade/head along the attack direction. Generic LPC
  weapon sheets are retained as reference assets but are no longer preloaded or
  used as tinted substitutes. No per-frame raster generation is needed.
- The requested [tribal warrior pack](https://craftpix.net/freebies/free-tribal-warrior-boss-characters-asset-pack/)
  advertises modular vector body parts (AI/EPS/PNG). Its download required sign-in;
  no archive was acquired and no ready-made action sequences were established.
  It has not been imported or presented as animated game art.
- The two additional enemies, Forest brute and Forest skirmisher, use the separate
  [animated forest bosses pack](https://craftpix.net/freebies/free-forest-bosses-pixel-art-sprite-sheet-pack/)
  already available from CraftPix's public author download. They have native
  movement, punch/kick, hurt and death frames; the existing Thornbloom guardian,
  slimes, snake and bear remain. The pack's characters are adapted as generic
  fantasy enemies, without assigning real cultural identities.

`scripts/import-weapon-demo.py` recreates 24 compact 128px icons and two enemy
atlases. `scripts/import-lpc-melee.mjs` recreates 84 character layer sheets and
eight held-weapon sheets from a pinned Universal LPC revision. Their manifests
record sources, hashes, transforms, frame layouts and licenses. Raw ZIPs and
contact sheets stay in ignored working directories. Imported runtime art and
required notices live under `public/game-assets/weapon-demo`, `lpc-weapons` and
`lpc-characters`. The in-game Menu links the attribution files.

The selected paid ELV forest is still pending ownership; this change does not
install it. See [Jungle demo](JUNGLE-DEMO.md) for the current forest art and plans.

## Focused verification

Run `pnpm exec tsx scripts/verify-equipment-rules.ts`,
`pnpm exec tsx scripts/verify-adventure-combat.ts`, and
`pnpm exec tsx scripts/verify-magic-demo.ts`. They cover normal/demo policies,
save input validation, all 24 contact timings and damage values, reach, walls,
cooldown, source animation contact, level scaling, safe areas and reset rewards.
The magic check also verifies every authored encounter and collectible is reachable.
`pnpm exec tsx scripts/verify-enemy-difficulty.ts` covers the level curve, contact
reach at 5–50ms ticks, locked attack targets, walls, actual combo damage, stagger
resistance, and the faster hazard clock. Renderer checks also compare native contact
frames against each encounter's scaled timing.

In Chrome, check desktop and 390×844 touch equipment selection, family navigation,
enemy reset, modal pause, Escape, actual held-weapon poses, spell coexistence and
portal travel. Keep object/texture counts stable while moving, zooming and fighting.
Do not treat a local CPU timing sample as an all-device frame-rate guarantee.

The initial September 12 equipment pass passed the three focused scripts, scoped ESLint,
browser import boundary and `pnpm build` (frontend, worker, node and gateway type
checks included). Chrome exercised all 24 equips, a level-7 reset, native slash
contact and damage, desktop keyboard return focus, touch scrolling and equipment,
and both village/jungle portal directions retaining equipped gear, XP and herbs.
No console errors or warnings appeared. A 381-update movement/zoom/melee sample
kept 240 scene objects and 330 textures, averaging 0.36ms with p95 0.7ms of scene
JavaScript update time. This excludes GPU time. The existing production bundle-size
warning remains.

The subsequent equipped-art and difficulty fix passed the new enemy difficulty
script, existing combat and magic checks, scoped ESLint/Prettier, browser import
boundary and `pnpm build`. WebGL verification covered all 24 exact item textures,
26 travelers and all four directions, checking opaque handle pivots, forward-facing
contact frames and unchanged-pose caching (90,552 assertions). The live jungle
also verified Gold axe and Gold staff selection against their rendered attacks.
In a 2.6-second staged encounter, the skirmisher started one attack at level 1 and
three at level 20; the latter used its shorter combo preparation. Ground attack
circles are gone. At 390×844, equipment scrolls without horizontal overflow, equips
items and applies level-20 resets; Escape closes it and restores canvas focus.
No browser console warnings or errors appeared. A 548-update encounter/movement/
zoom/melee sample kept 240 scene objects and 342 textures, with mean 0.25ms and
p95 0.4ms scene JavaScript update time, excluding GPU time. The production bundle
size warning remains unchanged. The demo was returned to camp at level 1 afterward.
