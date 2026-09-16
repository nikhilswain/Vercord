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
