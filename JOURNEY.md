# Journey journal

Open **Esc → Journey** or **Map → Journey**. The touch Menu has the same entry.
The journal shows chapter context, a recap, completed steps and one actionable lead.
The frame, title and footer stay in place while long contents scroll inside.

- **Follow story** remembers the preference, without moving the player or camera.
- **Show on map** previews the lead. In another forest region it selects that region;
  locally it shows a diamond at the site. Demo story locations can be previewed on
  their own maps without falsely placing the player there.
- **Guide me** explicitly starts the existing collision-aware golden trail.
- **Pin objective** shows a small, removable HUD reminder, independently of guidance.
- **Explore freely** closes the journal, removes its pin and stops story-owned
  guidance. Progress and unrelated navigation to a house or personal pin remain.

There is no default tracker or automatic trail. Completing a step clears its pin
and any remaining story trail; the next step waits for another explicit request.
Reaching a combat/story destination ends navigation, not the objective: the actual
conversation, mechanism or defeat must still happen. Discoveries work whether or
not Journey has ever been opened. Escape closes the foreground UI first and opens
the menu only from normal gameplay. The shared native Dialog owns modal cancellation.

## Playable content

**Expanded forest / server worlds:** the opening of _A voice beyond the trees_ uses
existing sites: Juniper's field camp → the leaning milestone → the millrace in
Alder Run. Coming within discovery range records each site, including out of order.
Each lead explains its clue and named region. After all three, the journal continues
into **The Hollow Choir** at Rootbound Temple, through the outer-approach arch in
Rootbound Reach. From Alder Run, the route passes Fern Hollow and Lantern Wood.
Explorers can reach the temple first: entering its courtyard advances the journal
to Mira without requiring the three introductory discoveries.
Discovery counts are secondary, not a kill quota or a requirement to clear all regions.

**Server temple and original demo:** _The Hollow Choir_ uses its actual shared story facts: meet Mira,
defeat the courtyard Root Beast, operate the side gates and release both seals in
either order, defeat the Bound Warden, free the keeper, recover the notes and return
them to Mira. Existing saves that already defeated the courtyard beast do not need
to repeat Mira's opening conversation. Guide requests cross the relevant forest waygates or demo entrances; admission
rules and closed gates still apply. In server worlds, both authored temple areas
use the same saved traveler and story facts as the forest. The guardian unlocks
the sanctuary; both seals expose the Warden; freeing the keeper opens the reliquary.
Returning the notes to Mira completes this playable chapter.

The full `MOSSWILD_CAMPAIGN.md` design remains a roadmap. This change does not add
the proposed water puzzle, regional quest NPC chains or new campaign rewards.
Rootbound Temple is now connected to the expanded forest. The journal advertises only
implemented objectives; the larger campaign remains planned.

## Ownership and storage

- `journal/model.ts`: pure derived view of real story facts and discovered site IDs;
  the extension point for later authored chapters. No parallel quest-completion store.
- `AdventureJourney`: preferences (`mode`, `pinned`) and existing progression.
  Version 1 forest snapshots accept the optional journal field; older saves keep
  their progress and start with free exploration and no pin.
- `JourneyDialog` / `JourneyTracker`: the shared reading and optional HUD surfaces.
- `JourneyMapNote` / atlas: consistent map entry, preview and scalable destination marker.
- `RpgScene`: publishes the journal, clears completed story guidance and exposes
  preference actions through `RpgGame`. Manual navigation has a different target kind.
- `navigation/destinations.ts`: resolves forest sites once their region is loaded,
  avoiding premature completion at the region entrance. Reuses existing pathfinding.

Forest progress/preferences use the existing local save scoped to member and world;
the forest preview has its own scope. The original demo retains story state for the
current expedition and resets on reload, as before. An active golden trail is never
persisted or automatically resumed. Storage failure keeps the session usable and
shows the existing save warning. These are client-side exploration records, not
authoritative multiplayer quest progress or a new database service.

## Verification

### Canonical UI Map

| Capability | Canonical owner                                     | Source of truth                                        | Allowed variants                                           | Verification                                                            |
| ---------- | --------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Scrollbar  | `src/features/rpg/ui/ornate-ui.css` and `RpgDialog` | `DESIGN.md`; Journey behavior above                    | Existing native body scrollbar inside the fixed game frame | `tests/e2e/rpg-temple.spec.ts`: mobile map and viewport bounds          |
| Dialog     | `src/components/Dialog.tsx` through `RpgDialog`     | Native focus containment, cancellation and restoration | Journey body and footer slots                              | `tests/client/rpg/transient-ui.test.tsx`; desktop/mobile browser checks |
| Button     | Existing `rpg-button` and `rpg-icon-button` styles  | `DESIGN.md`                                            | Journal actions, optional tracker, map entry               | `tests/client/rpg/journey-journal.test.tsx`                             |

`tests/client/rpg/temple-expedition.test.ts` checks authored/server geometry parity,
reachable passages, forest-save continuation, both seal orders, mid-chapter reloads,
keeper rescue, note handover, and opt-in guidance. Worker forest/socket tests cover
temple admission, presence isolation and reciprocal arrivals after hibernation.
`tests/e2e/rpg-temple.spec.ts` exercises the rendered chapter: locked bookmarks,
Mira dialogue, recall and reload, optional temple guidance, a narrow sanctuary map,
and the return-to-Mira objective crossing back into the courtyard.

`tests/client/rpg/journey-journal.test.tsx` checks free defaults, save compatibility,
out-of-order discoveries, preference restoration, pin expiry, temple facts and seal
order, reachable leads, cross-region resolution and separate UI actions/failures.
The transient UI tests cover Escape → Menu → Journey and foreground dialog ownership.
Browser checks cover desktop/mobile, map previews, completion cleanup, refresh,
manual destination preservation and cross-region waygate guidance.
