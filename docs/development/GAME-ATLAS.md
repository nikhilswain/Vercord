# The in-game atlas

The outdoor Map button uses the atlas in `src/features/rpg/atlas/`. Saved continuous towns use their member-authorized `WorldTown` directory and saved `RpgSample` geometry. Regions are named after Discord categories; channel icons use the channel name/type and the saved house entrance. There are no fictional category names or six-house limits in connected worlds. The local demo has one region because it has no Discord category directory.

House interiors and the vault retain their room/floor maps. Older separate-street towns retain their street navigation. This change does not regenerate saved towns or alter collisions, presence, or channel admission.

## Modules

| Module | Responsibility |
| --- | --- |
| `model.ts` | Projects the authorized directory onto saved house landmarks, with weak caches keyed by immutable scene/directory objects. Unbound `house:*` landmarks are omitted. |
| `territory.ts` | Builds shared region edges on a 128-world-pixel ownership lattice, using bounded multi-source growth. A second distance pass finds interior label positions. Lookup of the region under a point is constant time. |
| `AtlasChart.tsx`, `AtlasIcon.tsx` | Memoized SVG paths, roads, labels and channel icons. Neighboring regions stay mounted in detailed view. Original atlas glyphs require no icon dependency. |
| `camera.ts` | One demand-driven animation loop for the viewBox, pointer-anchored zoom and pan. Handles reduced motion, resize and disposal. |
| `controller.ts` | Pointer capture, pinch/wheel normalization, keyboard controls, region selection and nearby-pin detection. Camera frames update DOM attributes; they do not rebuild the projection or React tree. |
| `pins.ts`, `AtlasPinEditor.tsx` | Validated browser storage, five pins of each kind, and draft-based creation/edit/removal. |
| `RpgAtlasDialog.tsx`, `atlas.css` | Fullscreen native dialog, search/directory, camera controls, current player and personal pins. |

Use static imports: the repository's browser import boundary deliberately disallows dynamic imports. Projection construction still happens only when the atlas opens. Neither camera frames nor player updates generate the chart again. Changed directory objects refresh names and permissions; a label-only change preserves shape ownership. Stable IDs, not names, choose colors and persistence scopes.

## Controls and persistence

- In overview, hover or WASD/arrows focuses a region; click or Space opens it.
- In detail, drag or WASD/arrows pans through the continuous chart. Click another region to fly toward it. Scroll/trackpad pinch and +/− zoom around the pointer/center.
- Click a place or press Space at the crosshair to propose a pin. An existing pin within 22 screen pixels opens its editor instead. Clicking a pin also edits it. Pinning is available only in detail.
- The editor holds a draft until Place/Update. X/Escape discards it; Remove deletes it. Changing types respects the separate five-location/five-discovery limits. Nested Escape closes only the editor and restores atlas focus.
- Center finds the player's saved position. Whole town resets the overview. Look here in the town closes the atlas and focuses the game camera; it is not fast travel.

Storage key: `dmap.atlas.pins.v1/` plus a JSON tuple of member key, guild ID, saved world ID, world theme and current scene theme. The demo uses a separate scope. Pins remain local to this browser, do not sync to the gateway, and are not other members' shared markers. Invalid entries, duplicate IDs, excess pins and points outside the current chart are ignored on load. If storage is unavailable, the current open atlas retains changes and reports that they could not be saved.

## Adding a theme or marker

Existing continuous-town contracts work with a new outdoor theme without a new camera or atlas generator. Follow [Adding themes](ADDING-THEMES.md); supply saved terrain/landmarks and the authorized directory as usual. Keep atlas presentation separate from world generation. To add a place kind, extend the atlas type/glyph mapping and its accessible name. Route future fast travel or quests through explicit gameplay actions, never through the atlas projection.

The atlas font is Cormorant Garamond under SIL OFL in `public/game-assets/atlas/`; its license is linked in the game credits.

## Focused verification

The integration was checked in Chrome and with a generated saved-town fixture (six categories, 46 channel houses, a hidden category, village/Norse, desktop and 390px mobile). Checks cover authorized label coverage, unchanged house positions, cached geometry, rename stability, continuous camera movement, retained SVG nodes, zoom reversal, pin quotas/type changes, nearby crosshair edit, Escape/remove, and member/world isolation. The fixture script and screenshots are under local `test-results/atlas-integration*`; they do not send Discord messages or move calls. Run the affected client typecheck/lint and production bundle check when modifying this code. Old game behavior suites are outside this atlas change's scope.
