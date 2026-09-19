# Town Hall — gathering place, records, and future requests

## Experience

Town Hall is the town's civic gathering place. Enter through the labeled front
door from the square. A broad carpeted aisle leads between tall columns to the
reception counter and hearth. Board alcoves, a staffed register, bookshelves,
and benches give it the shape of a fantasy guild hall rather than a house.

The former detached outdoor stairs are gone. The Lantern Vault is reached from
an enclosed stair alcove inside the eastern wing. Leaving the vault returns to
that alcove; leaving the hall returns to its own porch. Town, hall, and vault
are separate multiplayer spaces, with shared server-owned collision geometry.

## Boards available now

| Place             | What the player can see or do                                                                                      | Source                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Expedition board  | Read the current chapter and next lead; open Journey, explicitly show a lead on the map, or check supplies/recipes | Existing saved adventure journal          |
| Traveler register | See who is online in this server, their area and away status; open a direct conversation                           | Existing authenticated chat presence      |
| Town chronicle    | Read your level, visited forest regions, discoveries, awakened abilities, and completed story steps                | Your existing adventure save              |
| Request board     | Read the current empty notice and find the expedition board                                                        | Authored content; no quest acceptance yet |
| Hall keeper Mara  | Learn where each service is, and how to reach the cellar                                                           | Authored dialogue                         |
| Archivist Ellin   | Explain the chronicle's purpose                                                                                    | Authored dialogue                         |

Reading a board never starts navigation, accepts a quest, spends items, or changes
story mode. Boards use the existing ornate dialog with a fixed frame and an
independently scrolling body. Escape closes the board and returns control to
the game. Player names remain ordinary text, never executable content.

The register is live and shared. The chronicle currently contains **your own**
saved progress. Adventure outcomes are still browser-owned: other players'
offline achievements and competitive scores cannot honestly be presented as
verified shared records yet. The hall does not invent a leaderboard or publish
local progress as server-verified results.

## Shared boards after server-owned progression

The most useful shared board is a **community chronicle**, with readable deeds
rather than an endless kill-count ranking:

- First restoration of a region's camp or waystone, credited to its contributors.
- Temple chapter completion, showing the party that completed it.
- Exploration milestones and discovered landmarks, with spoiler-safe titles.
- Server projects such as restoring a bridge or stocking an expedition cache.
- A bounded recent-deeds feed and an optional weekly contribution view.

Keep personal goals separate from collective goals. Avoid all-time damage or
playtime leaderboards as the main reason to visit; these discourage new players
and do not explain what to do next. Reward contributions through the future
gameplay/reward system, never merely for opening a board.

Following BACKEND_ARCHITECTURE.md, introduce a storage-neutral
`TownChronicleRepository` with `listDeeds(serverId, cursor, limit)`,
`getTravelerSummary(serverId, playerId)` and idempotent
`recordDeed(serverId, eventId, deed)`. Only the authenticated adventure service
can record a completed deed. PostgreSQL is the durable implementation; request
handlers and realtime notifications remain transport adapters. Do not couple
board components to Cloudflare D1 or accept client-supplied rankings.

Preserve server membership checks on every read/write, bounded pagination,
idempotent event IDs, and spoiler-aware projections. Show explicit loading,
empty, unavailable and stale states; avoid refreshing the full board on every
movement update. Public records contain display names and gameplay milestones,
not Discord tokens, channel history, or private message content.

## Requests and NPC quests — later

The request board is placed and interactive; the quest lifecycle is deliberately
not implemented in this step.

1. A request lists its issuer, region, short need, suggested level, and reward.
2. Accepting adds a lead to Journey. It does not immediately reveal the whole
   route or create a golden trail.
3. Meet the named NPC. Their dialogue explains the situation and confirms the
   actual objective and reward before the quest starts.
4. Complete the objective through normal exploration, puzzles, gathering,
   escorting, or combat. Support multiple solutions where the story allows.
5. Return to the issuer, claim the reward exactly once, and record the outcome
   in the appropriate personal/community chronicle.

Model states explicitly: posted → accepted lead → briefed → active → ready to
turn in → completed, with abandoned/expired states only where the design calls
for them. Separate party credit from individual reward claims. NPC and request
IDs must remain stable even if a name or displayed board text changes.

## Implementation and assets

- `src/domain/world/town-hall.ts`: idempotent v2 exterior upgrade of the reserved
  civic plot. Existing channel houses and neighborhood allocations are retained.
- `src/domain/world/content/town-hall-v1/scene.ts`: deterministic authored room,
  collisions, board identities, staff, asset frames, and ambient animations.
- `src/features/rpg/town-hall/`: renderer annotations and board presentation.
- The authenticated presence service uses the same room geometry as the client.
  `place=town-hall` identifies the hall and preserves the cellar's return route.
- Original PNGs are unchanged and cropped through runtime sprite frames.
- [LPC Interior Castle Tiles](https://opengameart.org/content/lpc-interior-castle-tiles)
  by Lanea Zimmerman (Sharm): columns, wall panels, carpet, windows and candles.
- [LPC Wooden Furniture](https://opengameart.org/content/lpc-wooden-furniture):
  reception counter, archive shelves, ledger, benches and board supports.
- [Bulletin board and items](https://opengameart.org/content/bulletin-board-and-items)
  by bleutailfly: noticeboards, parchment, correspondence and quill.
- Existing credited LPC house assets provide flooring, plants, the animated
  fireplace and clock. Full license/provenance records are under
  `public/game-assets/town-hall/` and `THIRD_PARTY_NOTICES.md`.
