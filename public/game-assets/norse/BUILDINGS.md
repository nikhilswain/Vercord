# Frosthavn buildings

Original Dmap-owned pixel artwork, authored September 2026. These SVGs were drawn from original integer-coordinate shapes and textures; no third-party pixels, traced outlines, fonts, or embedded raster artwork are included.

`node scripts/generate-norse-buildings.mjs` deterministically recreates the assets. Shapes render with `crispEdges` at the native dimensions below. Use nearest-neighbor sampling at integer gameplay zoom. The shading and 1–2 px weathering are designed for the surrounding 32 px tiles and approximately 44 px tall LPC travelers.

| Asset           | Native size | Physical base                            | Baseline |
| --------------- | ----------- | ---------------------------------------- | -------- |
| `longhouse.svg` | 256 × 192   | x16, y120, w224, h60                     | y180     |
| `cottage.svg`   | 160 × 160   | x12, y100, w136, h48                     | y148     |
| `smithy.svg`    | 192 × 160   | x16, y96, w160, h52                      | y148     |
| `longboat.svg`  | 160 × 80    | Entire boat belongs in nonwalkable water | y72      |

Building foundations and opaque facades stop at the baseline; cast shadows extend at most 6 px below it. Roof overhangs are decorative and should not define collision. South-facing doors are 28 × 42 px, with their thresholds at the baseline. Entrances are scenery for a landmark interaction in front; the assets do not imply accessible interiors.

The longhouse uses charcoal shingles, a carved ridge, timber braces, warm windows and round shields. The cottage has a weathered turf roof. The smithy includes a stone chimney, glowing recessed forge and hanging anvil sign. The clinker-built boat carries round shields and a furled sail so it remains compact and legible from above.
