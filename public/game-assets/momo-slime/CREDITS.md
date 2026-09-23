# Momo Mama slime — free demo artwork

- Artist: **chiecola**
- Source: <https://chiecola.itch.io/momo-mama-slime>
- File: `mm-demo.png`, downloaded through the creator's free download on 2026-09-16.
- SHA-256: `c1b78b63680b24507141fcb900ef11b808e2b5f3aa8a768f5808280c59841f76`
- Original file is unmodified: 320 × 192 PNG, fifteen 64 × 64 cells.

The creator permits commercial and noncommercial project use and modification.
Standalone redistribution or resale of the assets, including modified versions,
is prohibited. Crypto, blockchain and NFT projects are excluded. Credit is
optional; Dmap credits the artist. The source page contains the governing terms.
This copy is included for use by Dmap's game, not as a reusable asset download pack.

The free sheet supplies only crawl/idle animation: five down-facing frames,
five left-facing frames, and five up-facing frames. Right-facing sprites mirror
the left-facing row at runtime, at native pixel scale next to the LPC travelers.
Pink uses the original colors. Green and blue are Dmap-authored render palettes
that replace only the two pink body colors; the eyes, outlines, cream highlights,
transparency and frame geometry are preserved. These are permitted modifications
of the free sheet, not variants taken from the paid pack. The original PNG stays
unmodified, and all three colors share that one texture.

Dmap holds a free pose for combat and adds compression, a hop that lands at the
damage frame, a hit reaction and a fading collapse in code. These are not the
creator's paid combat animations. Reduced motion disables the additional
movement and compression and uses a brief defeat fade. No paid files are used.

Derived file: `mm-green.png` is `mm-demo.png` with the green render palette
baked in (body `#A2DD8E`, shadow `#5C9C6C`), for surfaces outside the Phaser
renderer where the runtime palette shader is unavailable. Eyes, outlines, cream
highlights, transparency and frame geometry are untouched.

Runtime mapping: `src/features/rpg/adventure/slime-assets.ts`.
Palette configuration: `SLIME_PALETTES` in that file; each spawn chooses `variant`.
Palette rendering: `src/features/rpg/adventure/slime-palette.ts`.
Combat presentation: `src/features/rpg/adventure/slime-motion.ts`.
