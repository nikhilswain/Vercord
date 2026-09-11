# Tiago character demo assets

Character art by **Tiago Patrício**. Source: [Ultimate Modular Character Creator](https://thiff.itch.io/2d-character), the official **free** `FreeCharacterPackRoot_V1.0.zip` sample retrieved September 11, 2026. No paid artwork or promotional animation is included.

These PNGs are dressed game characters assembled for this game's demo. Charcoal preserves the source outfit colors. Moss and Rust recolor that same free outfit. Skin colors and the optional beard come from the free sample. These variations do not represent additional paid hairstyles or clothing.

## License and distribution

The creator's license on the source page permits use in free and commercial video games and permits editing and recoloring. Credit is appreciated but optional. It prohibits reselling, redistributing, or repackaging the asset files individually or as an asset compilation, even after modification. These assets are not covered by any broader open-source license for this repository.

Use these composites as part of this game. Do not distribute this directory as an asset pack or expose the originals as downloads. Raw archives and individual source layers are kept outside tracked files in ignored `test-results/asset-imports/tiago/`. Obtain the free sample from the creator for further editing; do not copy layers from this repository.

The authoritative terms are the **License & Usage Rights** section of the [creator's page](https://thiff.itch.io/2d-character). The free archive contains PNGs and no separate license document. `manifest.json` records the source hash, processing, and license summary; it does not replace the creator's terms.

## Runtime layout

- Each atlas is 128 × 512, containing 32 × 64 frames at their native proportions.
- Rows 0–3: idle, ordered up / left / down / right. Each has two distinct frames; columns 2–3 repeat 0–1. Play columns 0–1 at 2 fps.
- Rows 4–7: walk in the same direction order. Play all four frames at 8 fps.
- The foot anchor is `(16, 64)`, so a Phaser sprite origin is `(0.5, 1)`.
- Recommended uniform game scale is `0.8`, giving an approximately 51-pixel visible height beside the tall LPC characters. Do not stretch width and height independently.
- The preview image is down-facing idle frame 0, atlas index 8. Previews remain native 32 × 64 PNGs.
- No attack, cast, hurt, death, or separate run animation is supplied. Game feedback may use effects or motion with idle/walk frames but should not claim new source animations.

The actual idle body and clothes sheets have two frames, despite the storefront's generic four-frame description. Shared head sheets alternate in the opposite order for idle, and shared clothing side views face right. The importer reverses the head frame order for idle and mirrors individual clothing frames for left-facing characters.

## Reproduce

Download the free V1.0 sample from the source page using **Download Now → No thanks, just take me to the downloads**. Keep the ZIP in ignored `test-results/asset-imports/tiago/`. Python and Pillow are required:

```powershell
python -m pip install Pillow
python scripts/import-tiago-demo.py
```

An existing ZIP elsewhere can be passed with `--archive`. The importer verifies the exact source SHA-256 before composing, never extracts source layers into the public directory, and checks every frame has a visible character anchored at the bottom of its 64-pixel canvas.

Typed runtime metadata lives in `src/features/rpg/demo/tiago-assets.ts`. Animation timing is a demo setting; frame layout and silhouette measurements come from the downloaded PNGs.
