# Adding world themes and game content

The game has three separate identities: a **world theme** (village/Norse), a **scene** (outdoors, vault, or a house), and an **entity** (a player, townsperson, or animal). Phaser renders them; shared domain definitions describe them. A Discord server owns one saved world per theme. Visiting it must never reroll its streets or house assignments.

## Where things live

| Responsibility                                                 | Location                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Theme names, terrain, prefab selection, starter outfit, keeper | `src/domain/world/catalog/themes.ts`                              |
| Character layers, reusable asset sources and tints             | `src/domain/world/catalog/characters.ts`                          |
| Entity footprints and behavior defaults                        | `src/domain/world/catalog/entities.ts`                            |
| Scene identities, presentation and visible-player budgets      | `src/domain/world/catalog/scenes.ts`                              |
| Versioned artwork and prefab assembly                          | `src/domain/world/content/v1/`                                    |
| Initial saved geometry                                         | `src/domain/world/generate.ts`                                    |
| Stable category/channel house allocation and roads             | `src/domain/world/continuous-town.ts`, `continuous-town-lanes.ts` |
| Saved document validation                                      | `src/domain/world/document.ts`                                    |
| Persistence                                                    | `worker/worlds/` and `migrations/`                                |
| Phaser drawing, animation and local input                      | `src/features/rpg/`                                               |
| Live movement, membership and room access                      | `worker/presence/`                                                |

## Add a theme pack

1. Add an entry to `WORLD_THEMES`, using an existing pack as the typed template. Set its name, labels, palette, allowed appearances and default appearance. Set `generation` with terrain, prefab IDs, keeper and square presentation. `WORLD_THEME_IDS`, URL parsing, live validation and the theme picker derive their choices from this catalog.
2. Reuse a generation style when it fits. `lpc-village` handles the existing edge tiles; `norse-timber` handles the northern terrain and timber prefab family. A genuinely different building/terrain system needs another style adapter, with prefab footprints and clear door approaches. Avoid scattering theme-ID comparisons through the renderer.
3. Register each new local texture and frame in the versioned asset catalog and document validator. Add prefab assembly to the content package. Each prefab needs visible stamps, physical feet colliders, roof label anchors, and a reachable entrance. Keep decoration outside road clearances. Texture URLs come from trusted catalogs, never a network payload or user input.
4. Add the theme to an **additive database migration**: `world_instances` currently has a SQL `CHECK` allowing only `village` and `norse`. A TypeScript catalog entry alone cannot admit a new database theme. Review the town persistence constraints too.
5. Add a small preview scene to `sample-worlds.ts`; its typed registry requires every theme. Connected worlds use the server-generated saved document, not this demo. Preview world keys must distinguish themes so remembered positions do not cross worlds. Check `streets.ts` as well: it supports the older street projection alongside continuous towns and must understand the pack's generation style.
6. Verify generation with several seeds, the largest supported channel directory, and both empty and populated categories. Every accessible channel should have a stable house and connected approach. Open the result in the browser and check feet collision, labels, overview, camera drag, appearance selection and theme switching.

For example, a coastal pack can reuse the village style, existing house prefabs, a new terrain atlas and a different selection of outfits. Start from `WORLD_THEMES.village`, give it a new ID, supply its own text/palette/terrain, then add the persistence migration. It does not require another Phaser scene class.

## Saved-world compatibility

`schemaVersion`, `generatorVersion`, `contentVersion`, seed, world ID and checksum describe a saved artifact. Existing `rpg-v1` output is read and validated as saved. Stable house allocation is append-only when Discord channels change; names and permissions are a separate member-specific projection.

Do not change an old prefab's meaning or accept arbitrary new textures in old content merely to make a load succeed. New geometry/artwork needs an explicitly versioned content path and compatible validator/migration. Keep old assets available while saved worlds reference them. Corruption is an error, never a reason to regenerate a server's town.

Presentation-only changes (UI copy, live outfit choices, renderer optimization) can use the shared catalogs without rewriting saved map documents. The saved v1 NPC appearance allowlist remains pinned even when the live character catalog expands.

## House interiors

`interiors.ts` generates and validates the independent `house-v1` document. `content/house-v1/assets.ts` pins the original SVG furniture atlas. Each theme supplies its `interior` palette; the shared recipes create a parlor for text, a gathering hall for voice/stage, and a reading room for forum/media/announcements.

`worker/worlds/house-store.ts` saves the generated room once under world ID + stable house ID in the guild's Durable Object storage, with a checksum. Room changes never rewrite the outdoor town. Introduce a new content version for changed furniture or geometry; do not silently replace saved rooms.

House presence uses the house's scene ID (`house:0`, for example), current Discord room access, and its saved collision map. Up to 16 travelers including the local player have character rigs; the searchable roster includes every admitted traveler. The current guild connection limit is 200 sockets, so the roster is not an unlimited-capacity backend. Room entry does not join or move a Discord voice call.

## Characters and entities

Add a character to `RPG_CHARACTER_DEFINITIONS`, then include its ID in the relevant theme's `appearances`. Provide all six layers for idle, walk and run, in the existing four-direction frame layout. `source` can reuse an existing layer atlas; optional `tint` colors that layer without downloading a duplicate. `RpgPortrait.tsx` composes the same layers and tints from down-facing idle frame 6, so the portrait matches the rig. Keep the portrait URL as a compatible base fallback. The renderer deduplicates shared texture loads, and browser/worker appearance validation uses the same catalog.

Keep NPC identity separate from Discord member identity. A townsperson or animal uses entity definitions and bounded behavior; a connected member uses the authoritative presence stream. Entity rendering must respect the viewport and its scene's budget. Decorative motion should respect reduced-motion preferences.

`catalog/population.ts` supplies the theme/location rosters. Add the new theme's population there and select character IDs allowed by its pack. `features/rpg/entities/simulation.ts` plans short, collision-safe routes once from the saved geometry and seed; an absolute clock evaluates idle/walk phases without a path search per frame. Its bounded roster is independent of server channel count. Ambient positions are decorative client simulation (subject to client clock differences), not authoritative multiplayer gameplay state.

`entities/renderer.ts` owns viewport visibility and talk prompts. `entities/animal.ts` draws the original pixel dogs and cats in code with the same feet/depth convention as human rigs. Ambient residents avoid walls and furniture but are not solid obstacles for players; do not add client-only colliders that the movement server cannot validate. Houses currently have no ambient residents. New gameplay NPCs that block movement, grant rewards or react to members need server-owned state before those behaviors are added.

New artwork belongs under `public/game-assets/` with its source, author, license and modification notes beside the assets. Existing LPC art is not automatically CC0; retain its credits and license. Repo-authored vector art can stay as maintainable SVG source.

## Required checks

Run the affected RPG client tests and worker presence/saved-world tests, then `pnpm build`. Use browser fixtures for multiplayer, scene switching and chat/voice so verification does not send messages or move a real Discord call. Check small screens and keyboard controls. Do not add broad snapshot suites for a palette or label change.
