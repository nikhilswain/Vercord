# Jungle demo creature assets

These prepared atlases are integrated into the dmap game. The original source
archives and unused source sheets are excluded from the repository.

## Bear and snake

- Artist: **Electric Lemon / Electric Lemon Games**
- Pack: [Animal Wildlife for RPG: Free Pack](https://electriclemon.itch.io/animal-wildlife-free-pack-retro-rpg-series)
- Retrieved: 2026-09-11 through the creator's public free download.
- License: [Electric Lemon Games Public License](LICENSE-Electric-Lemon.txt), copied from the downloaded pack.
- Commercial and noncommercial game/application use is permitted. Attribution is
  optional. Standalone resale or redistribution of the source assets is prohibited.
- Transformations: selected source frames were copied without resampling into
  transparent, uniform frames. Bear uses 32×32 frames; snake uses 24×24 frames.
- Source files: `Bear.png`, `Bear_Attack.png`, `Snake.png`, `Snake_Attack.png`.

Both creatures have four native walking and attack directions. They each supply
two side-facing death strips, which are also used for up/down death states. The
first death pose supplies a brief hurt reaction; neither pack supplies a separate
hurt animation. Idle uses source idle frames or a held first walk/attack pose.
Animation durations are dmap's gameplay choices, not upstream metadata.

## Blue slime

- Artist: **rvros**
- Pack: [Animated Pixel Slime](https://rvros.itch.io/pixel-art-animated-slime)
- Retrieved: 2026-09-11 through the creator's public free download.
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/),
  as specified under Asset license on the official source page.
- Transformations: the 32×25 individual PNG frames were arranged by animation.
  Exact horizontal mirrors provide right-facing frames.
- Native animations: idle (4 frames), move (4), attack (5), hurt (4), death (4).
- The source is side-facing. Up/down animation states reuse the right-facing art.

`wildlife-manifest.json` records frame mapping, dimensions, anchors, suggested
scales, provenance, and checksums. The typed runtime contract is
`src/features/rpg/demo/wildlife-assets.ts`. Use nearest-neighbor sampling.
