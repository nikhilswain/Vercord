# Atlas display font

Cormorant Garamond, copyright the Cormorant Project Authors, licensed under SIL Open Font License 1.1. See `OFL.txt`; the game menu links this notice.

`CormorantGaramond.woff2` is a full-glyph WOFF2 re-encoding of the variable TTF used in the reviewed atlas prototype (`docs/requirements/prototypes/game-atlas/fonts/CormorantGaramond.ttf`). No glyphs were subsetted or altered; all 3,241 glyphs and variable weights are retained. The browser uses system fallback fonts for scripts outside the font's coverage.

Re-encoded with FontTools 4.64.0 and Brotli 1.2.0: load the TTF through `fontTools.ttLib.TTFont`, set `flavor = 'woff2'`, save. These are offline asset tools, not application dependencies. The compressed asset is 209,268 bytes, compared with the 1,195,560-byte TTF.
