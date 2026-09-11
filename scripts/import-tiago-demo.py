"""Compose game characters from Tiago Patrício's officially downloaded free sample.

Requires Python 3.10+ and Pillow (python -m pip install Pillow).
Usage: python scripts/import-tiago-demo.py --archive path/to/FreeCharacterPackRoot_V1.0.zip
The source ZIP is read in memory: no original sprite layers enter the public directory.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

from PIL import Image, ImageOps


REPOSITORY = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://thiff.itch.io/2d-character"
SOURCE_ARCHIVE = "FreeCharacterPackRoot_V1.0.zip"
SOURCE_SHA256 = "a38e4a27fb40ba96fab26cf80e88bad143d22046af72d8a735c6a8100e387def"
SOURCE_ROOT = "FreeCharacterPackRoot_V1.0/"
FRAME = (32, 64)
DIRECTIONS = {
    "up": "04_BackView",
    "left": "02_LeftView",
    "down": "01_FrontView",
    "right": "03_RightView",
}
RECIPES = [
    {
        "id": "demo-tiago-charcoal",
        "name": "Tiago · Charcoal",
        "skin": 3,
        "beard": False,
        "shirtPalette": {},
        "pantsPalette": {},
    },
    {
        "id": "demo-tiago-moss",
        "name": "Tiago · Moss",
        "skin": 5,
        "beard": True,
        "shirtPalette": {"#2d2d2d": "#526849", "#1a1a1a": "#354631"},
        "pantsPalette": {"#242424": "#353b37", "#1b1b1b": "#252b27"},
    },
    {
        "id": "demo-tiago-rust",
        "name": "Tiago · Rust",
        "skin": 1,
        "beard": False,
        "shirtPalette": {"#2d2d2d": "#a65b3f", "#1a1a1a": "#703e32"},
        "pantsPalette": {"#242424": "#3d4d59", "#1b1b1b": "#293640"},
    },
]


def rgba(value):
    return tuple(bytes.fromhex(value.removeprefix("#"))) + (255,)


def recolor(image, palette):
    if not palette:
        return image
    mapping = {rgba(before): rgba(after) for before, after in palette.items()}
    result = image.copy()
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            pixels[x, y] = mapping.get(pixels[x, y], pixels[x, y])
    return result


def build(archive, destination):
    data = archive.read_bytes()
    if hashlib.sha256(data).hexdigest() != SOURCE_SHA256:
        raise ValueError("Source archive changed. Inspect and license-check it before updating the pin.")
    destination.mkdir(parents=True, exist_ok=True)
    animations = {}
    for action_index, (action, fps, count) in enumerate([("idle", 2, 2), ("walk", 8, 4)]):
        animations[action] = {
            "frameRate": fps,
            "frames": {
                direction: list(range((action_index * 4 + index) * 4, (action_index * 4 + index) * 4 + count))
                for index, direction in enumerate(DIRECTIONS)
            },
        }
    outputs = []
    with zipfile.ZipFile(io.BytesIO(data)) as source:
        cache = {}

        def layer(path, index, *, head=False, idle=False, mirror=False, palette=None):
            if path not in cache:
                cache[path] = Image.open(io.BytesIO(source.read(SOURCE_ROOT + path))).convert("RGBA")
            sheet = cache[path]
            expected_width = 128 if head or not idle else 64
            if sheet.size != (expected_width, 64):
                raise ValueError(f"Unexpected sheet dimensions for {path}: {sheet.size}")
            # The shared head sheets bob down/up, whereas idle bodies bob up/down.
            column = 1 - index if head and idle else index
            image = sheet.crop((column * 32, 0, (column + 1) * 32, 64))
            if mirror:
                image = ImageOps.mirror(image)
            return recolor(image, palette or {})

        for recipe in RECIPES:
            atlas = Image.new("RGBA", (128, 512))
            frame_bounds = []
            for action_index, action_folder in enumerate(["01_Idle", "02_Walking"]):
                idle = action_index == 0
                for direction_index, (direction, view) in enumerate(DIRECTIONS.items()):
                    side = direction in ("left", "right")
                    clothing_view = "02_SideView" if side else "03_BackView" if direction == "up" else "01_FrontView"
                    pants_view = "02_SideView" if side else "01_FrontView&BackView" if idle else "01_FrontView & BackView"
                    hair_folder = "02_Hair_2" if direction == "up" else "03_Hair_2"
                    for column in range(4):
                        # Idle columns 2/3 repeat 0/1 to retain a regular spritesheet grid.
                        index = column % 2 if idle else column
                        frame = layer(f"01_Skin_Bodies/{action_folder}/{view}/Skin_{recipe['skin']}.png", index, idle=idle)
                        head_paths = [f"02_Hair/{view}/{hair_folder}/Hair_2_DarkBrown_2.png"]
                        if direction != "up":
                            head_paths.extend([
                                f"03_Eyes/{view}/Eyes_Brown.png",
                                f"04_Mouth/{view}/01_Neutral/Mouth_Neutral_{recipe['skin']}.png",
                                f"02_Hair/{view}/01_EyeBrows/Eyebrow_Black.png",
                            ])
                        if recipe["beard"]:
                            beard_folder = "01_FacialHair" if direction == "up" else "02_FacialHair"
                            head_paths.append(f"02_Hair/{view}/{beard_folder}/Beard_Black.png")
                        for path in head_paths:
                            frame.alpha_composite(layer(path, index, head=True, idle=idle))
                        for path, palette in [
                            (f"07_Pants/{action_folder}/{pants_view}/Pants_Black.png", recipe["pantsPalette"]),
                            (f"06_Shirts/{action_folder}/{clothing_view}/Shirt_Black.png", recipe["shirtPalette"]),
                            (f"05_Shoes/{action_folder}/{clothing_view}/Shoes_1_Black.png", {}),
                        ]:
                            # Shared side clothing is right-facing. Mirror each frame for left.
                            frame.alpha_composite(layer(path, index, idle=idle, mirror=direction == "left", palette=palette))
                        bounds = frame.getbbox()
                        if bounds is None or bounds[3] != 64 or bounds[2] > 32:
                            raise ValueError(f"Invalid silhouette or feet position: {recipe['id']} {direction} {column}")
                        frame_bounds.append(list(bounds))
                        atlas.alpha_composite(frame, (column * 32, (action_index * 4 + direction_index) * 64))
            atlas_path = destination / f"{recipe['id']}.png"
            atlas.save(atlas_path, optimize=True)
            preview_path = destination / f"{recipe['id']}-preview.png"
            atlas.crop((0, 128, 32, 192)).save(preview_path, optimize=True)
            outputs.append({
                **recipe,
                "textureKey": recipe["id"],
                "atlasUrl": f"/game-assets/tiago-demo/{atlas_path.name}",
                "previewUrl": f"/game-assets/tiago-demo/{preview_path.name}",
                "sha256": hashlib.sha256(atlas_path.read_bytes()).hexdigest(),
                "frameBounds": frame_bounds,
            })
    manifest = {
        "version": 1,
        "author": "Tiago Patrício",
        "sourceUrl": SOURCE_URL,
        "sourceArchive": SOURCE_ARCHIVE,
        "sourceSha256": SOURCE_SHA256,
        "sourceRetrieved": "2026-09-11",
        "license": {
            "name": "Creator's custom asset license",
            "url": SOURCE_URL,
            "gameUse": "Free and commercial video games allowed.",
            "modifications": "Editing, recoloring, and technical modifications allowed.",
            "restriction": "Do not resell, redistribute, or repackage source assets individually or as an asset compilation, including modified assets.",
            "attribution": "Appreciated, not required. Character Art by Tiago Patrício.",
        },
        "frameWidth": 32,
        "frameHeight": 64,
        "atlasWidth": 128,
        "atlasHeight": 512,
        "feet": {"x": 16, "y": 64},
        "scale": 0.8,
        "previewFrame": 8,
        "animations": animations,
        "limitations": [
            "Two idle frames and four walk frames in the downloaded PNGs; the product page's generic four-frame description does not apply to idle body/clothing sheets.",
            "No attack, cast, hurt, death, or dedicated run frames in the free sample.",
            "Only the free sample's one hair and clothing style is used. Moss and rust are local recolors, not paid pack content.",
        ],
        "processing": [
            "Layer compositing at native 32x64 resolution; no redraw or nonuniform stretching.",
            "Source direction order normalized to up, left, down, right for each action.",
            "Shared right-facing clothing mirrored per frame for the left direction.",
            "Shared head layers use columns 1,0 for idle so their one-pixel bob aligns with the body.",
            "Idle rows pad columns 2,3 with copies of 0,1; animation metadata uses the two distinct frames.",
            "Pure palette replacements in two demo outfits preserve outlines and shading.",
        ],
        "characters": outputs,
    }
    (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Composed {len(outputs)} game characters, 32 atlas frames each, in {destination}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, default=REPOSITORY / "test-results/asset-imports/tiago" / SOURCE_ARCHIVE)
    parser.add_argument("--destination", type=Path, default=REPOSITORY / "public/game-assets/tiago-demo")
    options = parser.parse_args()
    build(options.archive, options.destination)
