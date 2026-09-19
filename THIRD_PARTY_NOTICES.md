# Third-party notices

## Game art

### MiniFolks — Forest animals

- Artist: LYASeeK; source: <https://lyaseek.itch.io/miniffanimals>.
- Free/name-your-own-price pack, downloaded September 16, 2026. Game use, including
  commercial projects, is permitted; standalone asset resale is prohibited.
- Eight unmodified outlined PNG sheets ship in `public/game-assets/minifolks-animals/`.
  Native side-view animation is mirrored for left-facing movement. Roaming,
  fleeing and hunting behavior are implemented by Dmap.
- [Usage terms and source archive hash](public/game-assets/minifolks-animals/CREDITS.txt).

### Momo Mama Slime — free demo

- Artist: chiecola; source: <https://chiecola.itch.io/momo-mama-slime>.
- Included: the unmodified free `mm-demo.png` under `public/game-assets/momo-slime/`.
- Commercial/noncommercial game use and modification are permitted under the creator's
  license; standalone resale/redistribution and crypto/blockchain/NFT use are prohibited.
- [Provenance, license summary and animation notes](public/game-assets/momo-slime/CREDITS.md).
- Crawl/idle frames are native; combat motion is implemented in Dmap. No paid files are included.
- Green and blue are Dmap render palettes applied to the free pink sheet.

### Kenney Tiny Town 1.1

- License: Creative Commons CC0 1.0 Universal
- Upstream: https://kenney.nl/assets/tiny-town
- Included file: `public/game-assets/tiny-town/tiles.png`

### Kenney Tiny Dungeon 1.0

- License: Creative Commons CC0 1.0 Universal
- Upstream: https://kenney.nl/assets/tiny-dungeon
- Included file: `public/game-assets/tiny-dungeon/tiles.png`

### Tiny Characters Set

- Author: Fleurman; based on CC0 work by GrafxKid
- License: Creative Commons CC0 1.0 Universal
- Upstream: https://opengameart.org/content/tiny-characters-set
- Included files: selected animated character sheets under
  `public/game-assets/tiny-characters/avatars/`

### Kenney RPG Urban Pack 1.0

- License: Creative Commons CC0 1.0 Universal
- Upstream: https://kenney.nl/assets/rpg-urban-pack
- Included file: `public/game-assets/kenney-urban/tiles.png`

## Experimental 3D characters

### Animated Woman and Hoodie Character

- Author: Quaternius
- License: Creative Commons CC0 1.0 Universal
- Upstream: [Animated Woman](https://poly.pizza/m/qJ2gsTUBHL),
  [Hoodie Character](https://poly.pizza/m/gKLBoRsyKe)
- Included files: `public/game-assets/three-characters/animated-woman.glb` and
  `public/game-assets/three-characters/hoodie-character.glb`
- Each asset includes 24 animation clips. The experiment uses neutral idle, walk, and run.
- Source URLs, checksums, license links, and animation inventories are recorded in
  [the asset directory](public/game-assets/three-characters/README.md).

The 3D village, furniture, trees, and fallback explorers are authored procedurally in this
repository. No scenery from the linked Poly Pizza bundle is included.

## 2D RPG sample art

### LPC Revised characters and scenery

- Curated by Eliza Wyatt (DeathsDarling), pinned to revision
  `f07f7f5892e67c932c68f70bb04472f2c64e46bc` of [ElizaWy/LPC](https://github.com/ElizaWy/LPC).
- Selected files use OpenGameArt Attribution 3.0 (OGA-BY 3.0).
- Character art: Stephen Challener (Redshrike), Eliza Wyatt (DeathsDarling), with additional
  upstream credits preserved. [Character credits](public/game-assets/lpc-characters/CREDITS.txt),
  [license](public/game-assets/lpc-characters/LICENSE.txt), and
  [per-file manifest](public/game-assets/lpc-characters/manifest.json).
- Scenery: Lanea Zimmerman (Sharm), Eliza Wyatt (DeathsDarling), Hyptosis and BlueCarrot16.
  [Scenery credits](public/game-assets/lpc-world/CREDITS.md),
  [license](public/game-assets/lpc-world/OGA-BY-3.0.txt), and
  [per-file manifest](public/game-assets/lpc-world/manifest.json).
- The Rowan/Ash sheets are unchanged. Portraits are derived composites of the character layers;
  map layouts, collision geometry and dialogue are authored in this repository.

### Frosthavn outfits and original scenery

- Ivar and Sigrid combine LPC Revised layers with armor from the Expanded Universal LPC collection,
  pinned to `675e21e04aaff8486a3a24e09573b3d5af9d28b9`. The selected armor offers OGA-BY 3.0.
  Contributors include Johannes Sjölund (wulax), Matthew Krohn (makrohn), Michael Whitlock
  (bigbeargames), bluecarrot16 and JaidynReiman, alongside the Revised contributors above.
- Armor frames are selected and composited with sleeves; Ivar's beard is composited with his hair.
  Per-source declarations, exact modifications and checksums are retained in the
  [character manifest](public/game-assets/lpc-characters/manifest.json) and
  [character credits](public/game-assets/lpc-characters/CREDITS.txt).
- The Norse buildings, longboat, paths, shore, runestone, hearth, banners and supplies are original
  code-authored Dmap SVG artwork. See [Frosthavn artwork notes](public/game-assets/norse/README.md).
  Its surrounding LPC pine trees and rocks retain their existing scenery attribution.

## Ornate Retro Pixel UI — free sample

- Author: zLizard (z-spider).
- Source: [Ornate Retro UI free sample](https://z-spider.itch.io/ornate-retro-ui-free-sample).
- Free for personal and commercial projects; modifications are permitted within projects.
  Redistribution or resale of the original assets as-is or in asset bundles is prohibited.
- Dmap uses selected panel, button, arrow and divider slices as palette-adapted SVGs.
  Native pixel geometry and the supplied Unity slicing coordinates are preserved.
- [Credits](public/game-assets/ornate-retro/CREDITS.txt),
  [source and transformation manifest](public/game-assets/ornate-retro/provenance.json).
- The source archive is kept outside the runtime; `scripts/import-ornate-ui.py` reproduces
  the selected UI assets from a locally downloaded copy.

## HUD hearts and inventory icon

- Health hearts: [ArtBIT — Healthbar sprite](https://opengameart.org/content/healthbar-sprite), CC0 1.0.
  Unmodified `heart_27.png`; native full, half and empty frames displayed through SVG viewports.
- Inventory chest: [Henrique Lazarini (7Soul1) — 496 RPG icons](https://opengameart.org/node/39455), CC0 1.0.
  Unmodified `I_Chest01.png` from the public-domain collection.
- Runtime files and [credits](public/game-assets/pixel-hud/CREDITS.txt) under `public/game-assets/pixel-hud/`.

### Pixelarticons players icon

- Author: Gerrit Halfmann; MIT license.
- Source: [Pixelarticons users](https://github.com/halfmage/pixelarticons/blob/master/svg/users.svg).
- Unmodified SVG path used in `RpgIcon.tsx`; [license](public/game-assets/pixel-hud/PIXELARTICONS-LICENSE.txt).

## Forest portals

- [Animated portal by MatiasVME](https://opengameart.org/content/portal-2), based on
  [Portals by LetargicDev](https://opengameart.org/content/portals): CC0 1.0.
- Unmodified five-frame stone gate with green runes; runtime uses integer scaling.
- Asset and [credits](public/game-assets/forest-portal/CREDITS.txt) under `public/game-assets/forest-portal/`.

## Navigation sparkles

- [Particle Pack by Kenney](https://kenney.nl/assets/particle-pack): CC0.
- Unmodified `star_01.png` and `circle_05.png`, tinted and animated at runtime.
- [Credits](public/game-assets/navigation-sparkles/CREDITS.md) and the original license
  are included under `public/game-assets/navigation-sparkles/`.

## Fonts

### Alagard

- Author: Hewett Tsoi.
- Source: [Alagard](https://www.dafont.com/alagard.font), included with the Ornate Retro UI sample.
- Listed as 100% free, with author credit required; used for in-game headings and controls.
- Font and credit: `public/game-assets/ornate-retro/`.

### Pixelify Sans

- Author: The Pixelify Sans Project Authors
- License: SIL Open Font License 1.1
- Upstream: [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/pixelifysans)
- Included font and [license notice](public/game-assets/rpg-ui/OFL.txt) under
  `public/game-assets/rpg-ui/`.

### @fontsource-variable/inter 5.3.0

- License: OFL-1.1
- Upstream: https://fontsource.org/fonts/inter

### @fontsource/barlow-condensed 5.3.0

- License: OFL-1.1
- Upstream: https://fontsource.org/fonts/barlow-condensed

## Forest waygates

Forest waygates also reuse the existing CraftPix Free Ruined Temple arch, unchanged;
see [waygate credits](public/game-assets/waygate/CREDITS.md) and the original
[Ruined Temple notice](public/game-assets/ruined-temple/CREDITS.md). The ground circle is original Dmap geometry; the inventory Hearthstone now uses
7Soul’s credited CC0 stone icon. Recall reuses the credited CC0
[Luke.RUSTLTD summoning circle](public/game-assets/ritual-sigils/CREDITS.md) and
[Kenney sparkle textures](public/game-assets/navigation-sparkles/CREDITS.md).

## House interiors: LPC Revised

The unmodified PNGs in `public/game-assets/house-v2/` come from [LPC Revised](https://github.com/ElizaWy/LPC), pinned to `f07f7f5892e67c932c68f70bb04472f2c64e46bc`, and are used under OGA-BY 3.0. Artwork by Lanea Zimmerman (Sharm), Eliza Wyatt (DeathsDarling), BlueCarrot16, and Hyptosis. Full license, per-asset credits, original-source links, and download checksums are retained in that directory. Dmap authors the saved room layouts, collision geometry, interaction writing, and runtime presentation; original artists retain rights to their artwork.

## Inventory item artwork

Selected unmodified CC0 icons by Henrique Lazarini (7Soul1), from
[496 RPG icons](https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg),
replace the prototype inventory symbols. Raw fowl uses HomoHikka's CC0 meat icon,
distributed at 32px by AntumDeluge in [CC0 Food Icons](https://opengameart.org/content/cc0-food-icons).
[Credits, license and source hashes](public/game-assets/inventory-icons/CREDITS.md)
are retained beside the assets. The herb and Moonblossom UI images reuse the
existing OGA-BY 3.0 LPC Revised flowers with their original credits.

### Resin Wrap bandage

The unchanged Medicine Pack 16x16 sheet by **Kipperfalcon (Kipper Pixel)** is used
for the Resin Wrap's bandage icon (frame 5). **CC0 1.0**.
Source: <https://opengameart.org/content/medicine-pack-16x16>.
Stored with hashes and credits under `public/game-assets/inventory-icons/`.

### Brewing and provisions: medicinal plants

Healing Herb (`kekik.png`) and Rivercress (`arandula.png`) use unmodified 32px artwork from [CC0 Herb Icons](https://opengameart.org/content/cc0-herb-icons) by Jordan Irwin (AntumDeluge), based respectively on CC0/public-domain sources by frankes and rg1024. Licensed under CC0 1.0; hashes and original download URLs are retained in `public/game-assets/inventory-icons/provenance.json`.

The preparation UI and world stations also reuse the credited 7Soul CC0 item pack and the pinned LPC Revised OGA-BY 3.0 cauldron/furniture artwork. Exact frame mappings live in `src/features/rpg/inventory/item-art.ts` and `src/features/rpg/provisions/stations.ts`; their original licenses and attribution files are retained beside the assets.

## Combat and consumable effects (September 2026)

Viktor Hahn (Unnamed), **Pixelated Attack/Hit Animations**, CC BY 4.0: <https://opengameart.org/content/pixelated-attackhit-animations>. Three original sheets supply directional weapon arcs and impact splashes. License: <https://creativecommons.org/licenses/by/4.0/>.

CodeManu / David Masia, **Free Pixel Effects Pack**, CC0 1.0: <https://opengameart.org/content/free-pixel-effects-pack>. Three original sheets supply healing, battle and Swiftstep bottle effects. Original pixels are unchanged; frames, transforms and tints are selected at runtime. See `public/game-assets/action-fx/CREDITS.md` and `provenance.json` for file mappings and hashes.

The new Slime Resin icon is generated original Dmap art, separate from these third-party licenses. Healing Bottle uses 7Soul1's CC0 `P_Green01.png` from the already credited inventory pack; Battle Bottle remains `P_Orange03.png`.

## Ability icons, plain food and civic hall

- Ember and Tide: Henrique Lazarini (7Soul1), CC0 1.0, curated [496 RPG icons](https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg). See `public/game-assets/ability-icons/CREDITS.md` and provenance manifest. Original PNGs unchanged.
- Mushroom Broth bowl: ghostpixxells, [Free Pixel foods](https://ghostpixxells.itch.io/pixelfood), CC0 1.0. Original soup bowl icon unchanged; see inventory icon credits.
- Town hall: bluecarrot16 and the credited LPC contributors, [Thatched-roof Cottage](https://opengameart.org/content/lpc-thatched-roof-cottage) and [Medieval Village Decorations](https://opengameart.org/content/lpc-medieval-village-decorations), CC BY-SA 3.0. Original sheets and complete decoration credits in `public/game-assets/town-hall/`. Native tile arrangement is distributed under the same art license.

### Town Hall interior and noticeboards

[LPC Interior Castle Tiles](https://opengameart.org/content/lpc-interior-castle-tiles)
by Lanea Zimmerman (Sharm), CC BY 3.0; [LPC Wooden Furniture](https://opengameart.org/content/lpc-wooden-furniture)
by bluecarrot16 and the complete credited LPC contributors, CC BY-SA 3.0;
[bulletin board and items](https://opengameart.org/content/bulletin-board-and-items)
by bleutailfly, OGA BY 3.0. Original PNGs are unchanged. Full upstream furniture
attribution, per-file source URLs, selected licenses and hashes are retained in
`public/game-assets/town-hall/`. The room also reuses the previously credited
LPC Revised furniture and animation sheets.
