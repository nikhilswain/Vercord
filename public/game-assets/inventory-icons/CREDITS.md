# Inventory, brewing and provisions artwork

Third-party PNGs here are unmodified licensed artwork, served locally. SHA-256 hashes and
original archive filenames are in `provenance.json`.

- **Henrique Lazarini (7Soul1)** — [496 pixel art icons for medieval/fantasy RPG](https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg), compiled by gnola14. CC0 1.0.
  Download: <https://opengameart.org/sites/default/files/496_RPG_icons.zip>.
  This curated distribution excludes the incompatible derivative icons mentioned on
  its source page. It is the same set already used for Dmap's inventory chest.
- **HomoHikka** — [Generic Fantasy RPG Items](https://opengameart.org/node/115091), CC0 1.0.
  Raw fowl uses the unmodified 32px meat distribution from AntumDeluge's
  [CC0 Food Icons](https://opengameart.org/content/cc0-food-icons).
  Download: <https://opengameart.org/sites/default/files/food-homohikka.zip>.

Moonblossom art is selected at runtime from `../lpc-world/flowers.png`, frame 8 at
32×32. It is covered by the
separate [LPC Revised credits](../lpc-world/CREDITS.md) and **OGA-BY 3.0**, not CC0.

- **Kipperfalcon (Kipper Pixel)** — [Medicine Pack 16x16](https://opengameart.org/content/medicine-pack-16x16), CC0 1.0.
  `resin-wrap.png` is the unchanged 64×64 `medicine_pack.png` sheet. Only its cloth
  bandage at 16×16 frame 5 is displayed at runtime. No pixel edits.

`trailcloth` and `resin-wrap` remain for legacy save compatibility only. New saves
convert them to Emberleaf and Healing Bottles.
`echo-glass`, `choir-opal`, `lastlight-seed` and `camp-meal` remain art candidates
for future systems; their artwork does not enable those rewards or effects.

- **frankes, rg1024 and Jordan Irwin (AntumDeluge)** — [CC0 Herb Icons](https://opengameart.org/content/cc0-herb-icons), CC0 1.0. Unmodified `kekik.png` is the Healing Herb in the world, backpack and recovery control. Unmodified `arandula.png` is Rivercress. These are distinct from the decorative LPC flowers.
- New bottles, mushrooms, meat, seeds, pollen, Emberleaf and supply chest use the same **7Soul CC0** archive above; exact originals and hashes are in `provenance.json`.
- Trail Stew uses a runtime frame from `../house-v2/cauldron.png`; camp furniture and cauldron animation reuse the pinned **LPC Revised / OGA-BY 3.0** distribution. See [the complete house asset credits](../house-v2/CREDITS.md). No edited raster copies are distributed.

## September 2026 item identities

- Healing Bottle now uses 7Soul1's **P_Green01.png**; Battle Bottle keeps **P_Orange03.png**.
- **Slime Resin** is an original Dmap gel-material icon made with the built-in image-generation tool. It is not a bottle or a monster. The generated PNG is unchanged; the inventory and world renderer use the same crop and nearest-neighbor display. The final prompt and generation provenance are in `provenance.json`. This original asset is not covered by the third-party CC0 declarations above.

Mushroom Broth uses the unmodified soup bowl `87_ramen.png` from [Free Pixel foods](https://ghostpixxells.itch.io/pixelfood) by ghostpixxells, CC0 1.0 Universal.
