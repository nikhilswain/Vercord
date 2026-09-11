"""Prepare finite combat atlases from author-supplied CraftPix free downloads.

Run: python scripts/import-magic-demo.py --archive-dir test-results/asset-imports
Requires Python 3.10+ and Pillow. Source ZIPs are never copied into public/.
Download the named archives using the normal free controls on each source URL
in public/game-assets/magic-demo/provenance.json. No account is necessary on
the author's itch.io storefront. Changed source hashes require a new review.
"""

import argparse
import hashlib
import io
import json
import math
import re
import zipfile
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/game-assets/magic-demo"
LICENSE_URL = "https://craftpix.net/file-licenses/"
PACKS = {
    "spells": {
        "filename": "free-water-and-fire-magic-sprite-vector-pack.zip",
        "sha256": "e1445f9ea1c049bbf8f4ec9540b739b753f3052694cb4b7092bbbd67e27eeee4",
        "sourceUrl": "https://craftpix.net/freebies/free-water-and-fire-magic-sprite-vector-pack/",
        "downloadPage": "https://free-game-assets.itch.io/free-fire-water-magic-spell-vector-pack",
    },
    "traps": {
        "filename": "Free-Magic-and-Traps-Top-Down-Pixel-Art-Asset.zip",
        "sha256": "1cc50d7c51d8735a18e040c3a0dedc29cb29e110fb2926484a2b32b3e94a031e",
        "sourceUrl": "https://craftpix.net/freebies/free-magic-and-traps-top-down-pixel-art-asset/",
        "downloadPage": "https://free-game-assets.itch.io/free-magic-and-traps-top-down-pixel-art-asset",
    },
    "vectorExplosions": {
        "filename": "Free-Animated-Explosions.zip",
        "sha256": "226dcf963fcedc78072a239501e54afe416176ccdec09d9fa2ef2a8f5efba8e5",
        "sourceUrl": "https://craftpix.net/freebies/free-animated-explosion-sprite-pack/",
        "downloadPage": "https://free-game-assets.itch.io/free-animated-explosion-sprite-pack",
    },
    "pixelExplosions": {
        "filename": "Free Pixel Art Explosions.zip",
        "sha256": "09653dfa7537deee70c1538572bf32e8e2abdd58ac510da6865840cf1468992a",
        "sourceUrl": "https://craftpix.net/freebies/11-free-pixel-art-explosion-sprites/",
        "downloadPage": "https://free-game-assets.itch.io/11-free-pixel-art-explosion-sprites",
    },
    "forestBosses": {
        "filename": "Free-Forest-Bosses-Pixel-Art-Sprite-Sheet-Pack.zip",
        "sha256": "f62de17653cffb76aa63a975de9450101c327e9a1ced54911960c84191894d8c",
        "sourceUrl": "https://craftpix.net/freebies/free-forest-bosses-pixel-art-sprite-sheet-pack/",
        "downloadPage": "https://free-game-assets.itch.io/free-forest-bosses-pixel-art-sprite-sheet-pack",
    },
}
SLIME_SOURCE = ROOT / "public/game-assets/jungle-demo/slime.png"
SLIME_SHA256 = "09046741978144335241619767891c460e081a901a40259f21b8e7e8efd20e33"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def png(archive, name):
    return Image.open(io.BytesIO(archive.read(name))).convert("RGBA")


def sequence(archive, folder):
    names = [
        n for n in archive.namelist()
        if n.startswith(folder + "/") and n.lower().endswith(".png")
        and not n.startswith("__MACOSX/") and "/" not in n[len(folder) + 1:]
    ]
    names.sort(key=lambda name: int(re.search(r"(\d+)\.png$", name)[1]))
    return [png(archive, name) for name in names], names


def strip(archive, name, frame_size):
    image = png(archive, name)
    width, height = frame_size
    if image.height != height or image.width % width:
        raise ValueError(f"Unexpected strip layout: {name} {image.size}")
    return [image.crop((x, 0, x + width, height)) for x in range(0, image.width, width)]


def compact_vector(image, size):
    # Sample the licensed PNG export at a fixed low resolution, with no blur or
    # invented animation frames. Threshold alpha to keep clean pixel edges.
    image = image.resize(size, Image.Resampling.NEAREST)
    image.putalpha(image.getchannel("A").point(lambda value: 255 if value >= 96 else 0))
    return image


def atlas(name, frames, metadata, manifest):
    size = frames[0].size
    assert all(frame.size == size for frame in frames)
    columns = min(8, len(frames))
    rows = math.ceil(len(frames) / columns)
    image = Image.new("RGBA", (columns * size[0], rows * size[1]))
    coordinates = []
    for index, frame in enumerate(frames):
        x, y = index % columns * size[0], index // columns * size[1]
        image.alpha_composite(frame, (x, y))
        coordinates.append({"index": index, "x": x, "y": y, "width": size[0], "height": size[1]})
    path = OUTPUT / (name + ".png")
    image.save(path, optimize=True)
    manifest[name] = {
        **metadata,
        "file": path.name,
        "sha256": sha256(path.read_bytes()),
        "frameWidth": size[0], "frameHeight": size[1],
        "columns": columns, "frameCount": len(frames),
        "atlasCellCount": rows * columns,
        "frames": coordinates,
    }


def build(archive_dir):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    archives = {}
    for key, spec in PACKS.items():
        data = (archive_dir / spec["filename"]).read_bytes()
        if sha256(data) != spec["sha256"]:
            raise ValueError(f"Source archive changed; inspect and license-check it first: {spec['filename']}")
        archives[key] = zipfile.ZipFile(io.BytesIO(data))
    manifest = {}
    for element in ("fire", "water"):
        title = element.title()
        frames, names = sequence(archives["spells"], f"{title} Spell/PNG")
        assert len(frames) == 8
        frames = [ImageOps.mirror(compact_vector(frame, (64, 36))) for frame in frames]
        atlas(f"{element}-bolt", frames, {
            "pack": "spells", "sourceFiles": names,
            "durationMs": 400, "loop": True,
            "origin": {"x": 0.72, "y": 0.5}, "suggestedScale": 1,
            "transform": "640x360 PNG -> 64x36 nearest, alpha threshold 96, horizontal mirror; points east",
        }, manifest)
        frames, names = sequence(archives["spells"], f"{title} Ball/PNG")
        assert len(frames) == (8 if element == "fire" else 12)
        atlas(f"{element}-cast", [compact_vector(frame, (32, 32)) for frame in frames], {
            "pack": "spells", "sourceFiles": names,
            "durationMs": 360, "loop": False,
            "origin": {"x": 0.5, "y": 0.5}, "suggestedScale": 1,
            "transform": "640x640 PNG -> 32x32 nearest, alpha threshold 96",
        }, manifest)
    atlas("fire-impact", strip(archives["traps"], "4 Barrel/Boom1.png", (48, 48)), {
        "pack": "traps", "sourceFiles": ["4 Barrel/Boom1.png"],
        "durationMs": 480, "loop": False,
        "origin": {"x": 0.5, "y": 0.5}, "suggestedScale": 1,
        "transform": "Eight native 48x48 pixel frames, unchanged",
    }, manifest)
    frames, names = sequence(archives["vectorExplosions"], "PNG/Explosion_7/4")
    assert len(frames) == 4
    atlas("water-impact", [compact_vector(frame, (48, 48)) for frame in frames], {
        "pack": "vectorExplosions", "sourceFiles": names,
        "durationMs": 240, "loop": False,
        "origin": {"x": 0.5, "y": 0.5}, "suggestedScale": 1,
        "transform": "150x150 PNG -> 48x48 nearest, alpha threshold 96",
    }, manifest)
    for name, source in [("fire", "Circle_explosion"), ("water", "Explosion_blue_circle"), ("poison", "Explosion_gas_circle")]:
        frames, names = sequence(archives["pixelExplosions"], f"PNG/{source}")
        assert len(frames) == 10
        atlas(name + "-death", [frame.resize((128, 128), Image.Resampling.NEAREST) for frame in frames], {
            "pack": "pixelExplosions", "sourceFiles": names,
            "durationMs": 650, "loop": False,
            "origin": {"x": 0.5, "y": 0.5}, "suggestedScale": 1,
            "transform": "256x256 source -> 128x128 nearest; visible peak approximately 90px; numeric frame order 1..10",
        }, manifest)
    atlas("spike-trap", strip(archives["traps"], "1 Spikes/1.png", (32, 32)), {
        "pack": "traps", "sourceFiles": ["1 Spikes/1.png"],
        "durationMs": 720, "loop": False,
        "origin": {"x": 0.5, "y": 0.5}, "suggestedScale": 2,
        "impactAtMs": 240,
        "transform": "Six native 32x32 pixel frames, unchanged",
    }, manifest)
    boss_frames, actions, boss_sources = [], {}, []
    for action, filename, duration, impact in [
        ("idle", "Idle", 800, None), ("walk", "Walk", 600, None),
        ("attack", "Attack1", 720, 360), ("hurt", "Hurt", 240, None),
        ("death", "Death", 780, None),
    ]:
        name = f"1/{filename}.png"
        left = strip(archives["forestBosses"], name, (96, 96))
        boss_sources.append(name)
        directions = {}
        for direction in ("left", "right"):
            indices = []
            for frame in left:
                prepared = Image.new("RGBA", (128, 96))
                # Original plant root is x=64. Mirrored root is x=32; shift
                # mirrored art by 32 so both directions share root x=64.
                prepared.alpha_composite(frame if direction == "left" else ImageOps.mirror(frame), (0 if direction == "left" else 32, 0))
                indices.append(len(boss_frames))
                boss_frames.append(prepared)
            directions[direction] = indices
        directions["down"], directions["up"] = directions["right"], directions["right"]
        actions[action] = {"durationMs": duration, "loop": action in ("idle", "walk"), "frames": directions}
        if impact is not None:
            actions[action]["impactAtMs"] = impact
    atlas("forest-guardian", boss_frames, {
        "pack": "forestBosses", "sourceFiles": boss_sources,
        "origin": {"x": 0.5, "y": 1}, "feet": {"x": 64, "y": 96}, "suggestedScale": 2,
        "animations": actions,
        "transform": "Native 96x96 frames padded to 128x96; exact horizontal mirror for right; up/down reuse right side view",
    }, manifest)
    slime_data = SLIME_SOURCE.read_bytes()
    if sha256(slime_data) != SLIME_SHA256:
        raise ValueError("Existing rvros slime atlas changed; inspect before updating source pin")
    slime = Image.open(io.BytesIO(slime_data)).convert("RGBA")
    palette = {
        (35, 64, 117, 255): (30, 70, 46, 255),
        (58, 91, 148, 255): (48, 114, 57, 255),
        (88, 138, 224, 255): (96, 184, 73, 255),
        (176, 203, 245, 255): (187, 225, 139, 255),
        (210, 224, 247, 255): (234, 248, 205, 255),
    }
    slime.putdata([palette.get(pixel, pixel) for pixel in slime.get_flattened_data()])
    path = OUTPUT / "green-slime.png"
    slime.save(path, optimize=True)
    manifest["green-slime"] = {
        "file": path.name, "sha256": sha256(path.read_bytes()),
        "sourceFile": "public/game-assets/jungle-demo/slime.png", "sourceSha256": SLIME_SHA256,
        "sourceUrl": "https://rvros.itch.io/pixel-art-animated-slime",
        "license": "CC0-1.0", "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "frameWidth": 32, "frameHeight": 25, "columns": 5, "frameCount": 50,
        "transform": "Exact five-shade palette substitution; red mouth, transparency and source animation geometry preserved",
        "palette": [{"from": list(before), "to": list(after)} for before, after in palette.items()],
    }
    provenance = {
        "publisher": "CraftPix / Free Game Assets (GUI, Sprite, Tilesets)",
        "licenseUrl": LICENSE_URL, "licenseSection": "2. FREEBIE PRODUCTS",
        "downloadMethod": "Normal author itch.io free-download browser controls, without accounts or payments",
        "sourceArchives": PACKS, "assets": manifest,
        "timingNote": "Durations and impact timings are game-design choices, not author-supplied timing claims.",
    }
    (OUTPUT / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf8")
    print(f"Prepared {len(manifest)} atlases ({sum(p.stat().st_size for p in OUTPUT.glob('*.png')):,} PNG bytes).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive-dir", type=Path, default=ROOT / "test-results/asset-imports")
    build(parser.parse_args().archive_dir)
