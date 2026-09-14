# Connected adventure areas

The local expedition is **Willowmere → Mosswild Jungle → Fern Hollow → Rootbound Temple**.
Travel at the signed trail ends with **E**; each connection has a return trail.
Direct previews: `/play/demo?area=jungle`, `?area=fern-hollow`, `?area=temple`.

## Content and session ownership

- `demo/scenes.ts` builds the existing village and jungle. `demo/forest-expansion.ts`
  builds Fern Hollow and the temple. Area builders run once, outside React rendering.
- `DemoSceneContent.portals` connects landmark IDs to area IDs. Add the ID to
  `DemoArea`, `DEMO_AREA_NAMES`, `readDemoArea`, and the `RpgDemoPage` area registry.
  Include every sample in the preload list. Each area has a distinct position key.
- An `AdventureDefinition` supplies unique enemy/flower/trap IDs and explicit
  `safeAreas`. Keep spawn points and portal approaches outside scenery footprints.
- `AdventureJourney` retains one `AdventureSession` per visited area and carries one
  traveler profile between them: equipment, XP, health, herbs and chosen attack.
  Enemy health/deaths, harvested flowers and reward history remain with their area.
  Arrival cancels unfinished attacks and resets swept trap contact to the actual
  arrival position. Village rest heals; ordinary forest crossings do not.
- The demo difficulty command resets all visited encounters and sets future spawn
  difficulty. It preserves XP and collection history; repeated kills cannot farm XP.
  This remains local runtime state, reset by a page reload. Server persistence and
  authoritative multiplayer combat are separate future adapters.

Keep session logic free of Phaser, DOM, and demo area names. Normal game encounters
can use these modules without the demo equipment policy or level override.

## Plants and their attacks

| Creature   | Role                   | Native action                                        |
| ---------- | ---------------------- | ---------------------------------------------------- |
| Venus Trap | Close-range bite/lunge | Mouth contact on attack frame 4                      |
| Blue Death | Ranged spore attacker  | Mouth release on frame 4; straight finite-range seed |
| Root Beast | Temple boss            | Bite/lunge; a three-seed fan on alternate attacks    |

Below half health, the Root Beast fires five seeds on each strike. Higher encounter
levels scale power, reactions, movement and projectile speed through shared rules.
Seeds commit their direction when released, collide with solid scenery, expire at
their configured range, and cannot enter safe clearings. The fixed cap is 32 hostile
projectiles per active area. Defeating the owner clears its remaining seeds.

Balance lives in `src/domain/adventure/enemies.ts`. `adventure/plant-assets.ts` is the
generated art adapter: 64×64 source cells, 128 frames per plant, four native directions,
five actions. Walk cycles are used for locomotion; source run layers remain available
in the original archive. The native hurt and full death sequence play before fading.
The boss uses a larger presentation scale; hit distances are separately authored.
No ground warning circles are introduced.

## Scenery and imports

See the [complete Ruined Temple asset audit](RUINED-TEMPLE-ASSET-AUDIT.md) for the
supplied interior/exterior maps, unused cast and mechanisms, animation layouts,
and the distinction between available art and implemented gameplay.

`adventure/temple-scenery.ts` places the actual CraftPix Ruined Temple production art:
sanctuary, statues, columns, wall fragments, paving, vegetation and animated fire.
It owns explicit collision footprints. `animatedScenery` annotations share the scene
clock; only visible sprite frames change. Static ground remains baked, and textures
stay cached across area changes. Movement, combat and zoom do not rebuild the scenery.

Run:

```sh
python scripts/import-predator-plants.py path/to/free-predator-plant-mobs-pixel-art-pack.zip
python scripts/import-ruined-temple.py assets/free-ruined-temple-top-down-location-pixel-art
```

The plant importer checks the pinned publisher archive hash. The temple importer
records source-file hashes and measured rectangles from the owner's download.
Generated production textures, provenance and license notices live under
`public/game-assets/predator-plants/` and `public/game-assets/ruined-temple/`.
Raw packs and editor files stay in ignored directories. Both packs use the
[CraftPix Freebie Products License](https://craftpix.net/file-licenses/); retain the
notices and don't redistribute the files as a standalone asset pack.

## Verification

`pnpm exec tsx scripts/verify-forest-expansion.ts` verifies the return graph, reachable
portals/enemies/flowers, collision clearance, shared traveler state, difficulty,
native action mappings, straight spores, walls, range, boss phase and arrival traps.
Also run `scripts/verify-enemy-difficulty.ts` when changing enemy balance.

In Chrome, cross the full route in both directions, equip a weapon, pick an herb,
fight the boss, return home, and confirm state retention. Check native attack/hurt/death
poses, temple fire, high/low zoom, modal pause, and the 390px touch layout.
