# Frosthavn artwork

The SVG files in this directory are original Dmap pixel artwork, authored with integer-coordinate
shapes. No third-party pixels, fonts, traced outlines or embedded raster images are included.

- `node scripts/generate-norse-buildings.mjs` creates the houses, smithy and longboat.
- `node scripts/generate-norse-ground.mjs` creates the terrain atlas, runestone, hearth, banner and supplies.

These are offline authoring scripts. The game loads each image into its shared texture cache;
ground tiles are baked once per scene load. Scenery is static; only the shared hearth lighting
pulses, with that decorative motion disabled by the reduced-motion preference.

The terrain sheet has 32×32 frames: 0–15 are stone lane connections (north/east/south/west bits),
16–19 meadow, 20–23 water, 24–27 transparent shore edges, and 28 timber decking. The remaining
frames are reserved decorative variants. [Building footprints](BUILDINGS.md) and the
`src/features/rpg/samples/norse-props.ts` catalog keep collision and depth aligned.

The Frosthavn map also uses LPC pines, rocks, masonry and stairs from `../lpc-world/`; those files
retain the attribution in [their credits](../lpc-world/CREDITS.md). Its characters use separately
credited LPC Revised/Expanded layers in [the character directory](../lpc-characters/CREDITS.txt).
