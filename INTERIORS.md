# Saved house interiors

Houses now use five authored layouts: reading room, herbalist, wayfarer lodge, thread-and-timber workshop, and tea room. The town’s permanent `house:N` identity, world ID, and seed select the arrangement. Each block of five houses gets a shuffled set of all five layouts, with stable material, upholstery, hearth, and decorative variations. Channel names, channel order, and channel types do not affect it.

## Save ownership and upgrades

`HouseInteriorStore` saves the complete validated `house-v2` artifact, including geometry, art, animation frames and interaction points, in the guild’s existing Durable Object storage. It does not use a browser-generated layout or change the town checksum. Concurrent first visits share one creation; a cold server loads the saved artifact.

A checksum-verified `house-v1` room upgrades once on its next visit. Its exact old envelope is retained under `houseInteriorBackup:v1:<worldId>:<houseId>` in the same transaction. Corrupt or unsupported rooms fail closed and are never replaced. The old parser and generator remain pinned in `interiors-v1.ts`. Runtime collision caches refresh when the interior generator version changes; ordinary authorized house admission and outside return positions are unchanged.

New generator/content versions require a deliberate migration. Do not edit the meaning of these frame names or reroll saved rooms on entry.

## Presentation and interaction

The shared scenery renderer animates fireplace flames, pendulum clocks, and cauldron fire on elapsed time, independently of walking speed. The wheel rests until used, runs for six seconds, then stops. Flame embers and cauldron steam use a bounded local effect; reduced-motion mode freezes sprite animations and hides these particles. No timers or network messages run per particle.

Approach an object and use **E** or the existing interaction button. Read journals, recipes and field notes through the existing dialogue mode; stir the cauldron, tend the hearth, wind the clock, or turn the spinning wheel for a visible response. These are ambient interactions, with no invented loot, healing or crafting rewards. Effects are local and temporary; everyone shares the same saved room layout and collision map.

Rooms currently occupy one floor. Additional floors need an explicit saved scene/admission design rather than client-only teleports.

## Art and verification

Free LPC Revised artwork is pinned and credited in `public/game-assets/house-v2/`. Source PNGs are unchanged. The manifest records download URLs, dimensions and checksums, and the original per-directory credit files and OGA-BY license accompany the art.

Client tests cover five layouts in both themes, stable generation, reachable exits/objects, invalid art/interaction references, and contextual actions. Worker tests cover concurrent save/reload, legacy upgrade and backup, corrupted-save refusal, permissions, collision and independent outdoor progress. Browser checks cover all layouts, the E-key interaction, dialogue, mobile and reduced motion.
