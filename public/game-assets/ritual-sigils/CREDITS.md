# Ritual seals

Base vector artwork: **4 summoning circles**, by **Luke.RUSTLTD**.

- Source: https://opengameart.org/content/4-summoning-circles
- Download: https://opengameart.org/sites/default/files/summoning_circles.zip
- License: **CC0 1.0 Universal**; included in `LICENSE-CC0-1.0.txt`.
- Sun uses `circle7.svg`; moon uses `circle4.svg`.

Dmap normalizes the paths to white masks with padded 96px canvases and reinforced
strokes. Gold/blue palettes, floor projection, glow, orbiting motes, casting and
release motion are implemented in game code. The original pack is static art;
it does not supply these animations. No H7 artwork is included.

Regenerate the SVG masks and provenance with
`pnpm exec tsx scripts/import-ritual-sigils.ts` after extracting the original ZIP
to `assets/runtime/summoning-circles/source`.
