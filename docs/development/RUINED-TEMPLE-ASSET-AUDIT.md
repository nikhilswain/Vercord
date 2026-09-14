# Ruined Temple asset audit

Checked September 15, 2026 against the owner's local download at
`assets/free-ruined-temple-top-down-location-pixel-art`.

The first integration selected scenery for Fern Hollow and the outdoor Rootbound
Temple courtyard. It did **not** integrate the supplied interior, characters or
mechanisms. This audit covers the remaining local content and corrects that gap.

## Already used versus available

| Content | Local source | Current integration |
| --- | --- | --- |
| Temple exterior, platform, statues, columns, trees, wall fragments | `PNG/Exterior_objects.png`, `Tiles_exterior.png` | Selected pieces placed in the connected forest areas. |
| Paving, rubble and urns | `PNG/Walls_floor.png`, `Objects_interior.png` | Selected crops in the outdoor courtyard; the interior itself is not implemented. |
| Animated lamps | `PNG/Fire_animation.png`, corresponding Aseprite source | One of five brazier/lamp variants imported. The sheet also includes a torch. |
| Arch, bush and vines | Generated `temple-arch`, `temple-bush`, `temple-vines` textures | Prepared by the importer but not placed by the current scenery adapter. |
| Authored exterior layout | `Tiled_files/Ruined_temple_exterior.tmx` | Unused. Contains temple grounds, water, foliage and two explorers. |
| Authored interior layout | `Tiled_files/Ruined_temple_interior.tmx` | Unused. Ritual chamber, side rooms, treasure, blade trap, spikes, gate, lever, lamps, cultists, leader and ghost animation. |
| Character showcase | `Tiled_files/Characters.tmx` | Unused. Shows the cast and shadow variants. |
| Six cultist appearances | `Cultist1` through `Cultist6` PNGs and Aseprite directories | Unused. Four-facing idle, walk and pray sequences. These are variations on a shared robed silhouette. |
| Cultist leader | `Leader_*` PNGs and Aseprite directory | Unused. Four-facing idle/walk plus one summoning sequence. |
| Two explorers | `Discoverer1_*`, `Discoverer2_*` | Unused. Bending, straightening, idle, writing/exploring actions; no separate walking or combat clips found. |
| Ghost | `PNG/Ghost.png` | Unused. Appears, expands and breaks apart; no separate directional attack/hurt/death set supplied. |
| Rotating blade trap and spikes | `PNG/blades_trap.png`, `Spikes.png` | Unused. Current demo spikes use the separate Magic and Traps pack. |
| Animated barred gate | `PNG/lattice.png` | Unused. Several gate/wall variants share each source frame. |
| Levers and chests | `PNG/Lever.png`, chest sheet ending in `hest.png` | Unused. Two lever and two chest variants, with opening/closing or switching animation. |
| Water and shoreline animation | `PNG/Water_coasts.png`, `water_detilazation_v2.png` | Unused. Authored into the supplied exterior map. |
| Additional interior decoration | `PNG/Objects_interior.png`, `Decorative_cracks_interior.png` | Mostly unused: winged statues, altar pieces, banners, treasure piles, candles, skulls/bones, rubble and pottery. |
| Additional outdoor detail | `PNG/Decorative_cracks_exterior.png`, `Spots.png`, `Trees_grass_alternative_fit.png` | Mostly unused: weathering, ground detail, plants and alternative vegetation. |

The predator plants and Root Beast boss come from the **separate Predator Plant
Mobs pack**, not the Ruined Temple cast. The LPC traveler remains the player art.

## Maps and import details

All three TMX files use orthogonal **16px tiles**, embedded tilesets and CSV chunks
on infinite maps. Their root width/height attributes do not describe the occupied
layout; calculate bounds from nonzero chunk cells, including negative coordinates.

| Map | Tile layers | Occupied tile bounds, exclusive end | Occupied extent |
| --- | --- | --- | --- |
| Exterior | 26 | `(-11, -13)` to `(12, 4)` | 23 × 17 tiles / 368 × 272 native pixels |
| Interior | 20 | `(-10, -7)` to `(12, 10)` | 22 × 17 tiles / 352 × 272 native pixels |
| Characters | 3 | `(-4, -6)` to `(28, 11)` | 32 × 17 tiles / 512 × 272 native pixels |

- These are authored visual layouts. There are **no object groups, collision
  shapes or gameplay properties** in the three maps or their embedded tilesets.
  Collision footprints, interactions, damage, rewards and encounter rules must be
  supplied by our game. Do not make every decorative tile solid.
- The interior references a chest filename beginning with Cyrillic `С`
  (`U+0421`). The extracted filename starts with the mojibake characters
  `U+2568 U+00ED`. An importer needs an explicit normalized mapping. The other
  referenced images resolve. Do not rename the owner's original files silently.
- `PNG/` has 76 direct sheets, byte-identical to the 76 sheets in `Tiled_files/`.
  `PNG/Animation_packed_version/` has 10 alternative exports; eight differ from
  the corresponding direct sheet. Treat packed layouts separately even when a
  filename or overall dimensions match.
- The pack also contains 96 Aseprite sources and 104 PSD sources. These and the
  `__MACOSX` metadata are not additional runtime art packs.
- Static local renders of the supplied maps were checked during the audit. The
  chest path was resolved in memory for inspection, without changing the pack.

## Animation evidence

These counts come from Aseprite headers and frame durations, cross-checked against
PNG dimensions and embedded Tiled tile-animation sequences.

| Source | Authored frames / canvas | Notes |
| --- | --- | --- |
| Blade trap | 12 / 48 × 48 | Separate shadow, column and blade layers. |
| Spikes | 12 / 32 × 64 | Base/shadow and individual spike layers. |
| Barred gate | 12 / 160 × 32 | The wide frame includes multiple gate variants. |
| Levers | 8 / 80 × 32 | Two variants. Tiled uses 12 steps, including repeated hold frames. |
| Chests | 6 / 80 × 32 | Two variants. Tiled uses 12 steps, including repeated hold frames. |
| Lamps and torch | 6 / 128 × 80 | Five `firepan` groups plus `torch`; each frame contains all variants. |
| Ghost | 19 / 96 × 128 | The PNG grid has a spare cell; Tiled uses 24 steps with a held first frame. |
| Cultist/leader walk | 6 / 32 × 32 per facing | Front, back, left and right. |
| Cultist pray | 12 / 32 × 32 per facing | All four facings; no separate combat actions found. |
| Cultist/leader idle | Usually 12 / 32 × 32 per facing | Back-facing source has six frames with a longer hold, not twelve unique poses. |
| Leader summon | 14 / 32 × 32 | One sequence, not four directional combat animations. |
| Explorer 1 | 48 × 48 | Idle 12 frames with variable timing, writing 4, bend/straighten 3 each. |
| Explorer 2 | 32 × 32 | Idle/exploring 10 frames each, bend/straighten 3 each. |

Most source frames last 100ms; the Tiled examples use 150ms per step. Do not assume
the demonstration loops are gameplay timers. Levers, gates and chests should
settle in their chosen state. Trap damage must follow visible contact and the
shared hazard rules, not wait for a decorative loop to finish. Water-coast and
detail tiles use mostly six-step loops; one coast tile has five steps.

The earlier moving-pot bug resulted from treating alternating lamp variants as
frames. The importer now extracts the same top-left lamp from each 128 × 80 source
frame. Keep that fixed-anchor approach for the remaining variants.

## Recommended next content pass

1. Add an enterable interior from the courtyard, using the supplied layout as a
   starting point. Adapt room sizes and door clearance for the tall LPC player,
   combat ranges and camera. Author solid footprints and wall occlusion together.
2. Introduce a reusable lever-controlled gate, an opening treasure chest and a
   blade hazard with an escape route. Keep their state with the area session and
   pause/reset them consistently with existing encounters. These are gameplay
   features to implement, not behavior already supplied by the art.
3. Place the explorers as ambient/interaction NPCs. Use cultist prayer and leader
   summoning for a ritual encounter if desired. A hostile implementation still
   needs explicit hit reactions, defeat presentation and attack rules.
4. Add the matching water, torches and remaining environmental detail through
   shared animation clocks and cached terrain. Keep NPC source proportions under
   review beside LPC; adding this cast does not replace the player's character.

Import only content used by the game and preserve provenance. Source and license:
[CraftPix Ruined Temple](https://craftpix.net/freebies/free-ruined-temple-top-down-location-pixel-art/),
[CraftPix file licenses](https://craftpix.net/file-licenses/).
