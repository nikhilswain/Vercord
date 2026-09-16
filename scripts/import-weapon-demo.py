"""Import licensed inventory icons and two native animated forest enemies.

Run: python scripts/import-weapon-demo.py --archive-dir test-results/asset-imports
Requires Python 3.10+ and Pillow. Acquire ZIPs through the source pages' normal
free download controls. Source archives remain outside public/. Changed hashes
require inspection before updating the pins below. Run Prettier on the two
generated TypeScript metadata files after import.
"""

import argparse
import hashlib
import io
import json
import math
import zipfile
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/game-assets/weapon-demo"
METADATA = ROOT / "src/features/rpg/demo"
PACKS = {
    "weapons": {
        "filename": "Malicious_weaponset1.zip",
        "sha256": "b2646c142162683409b26f2a6126ed45e39a124bf39537623302416c114103ab",
        "sourceUrl": "https://trulymalicious.itch.io/weapon-set-1-free",
        "downloadPage": "https://trulymalicious.itch.io/weapon-set-1-free",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "author": "Truly Malicious / TrulyMalicious",
    },
    "forestBosses": {
        "filename": "Free-Forest-Bosses-Pixel-Art-Sprite-Sheet-Pack.zip",
        "sha256": "f62de17653cffb76aa63a975de9450101c327e9a1ced54911960c84191894d8c",
        "sourceUrl": "https://craftpix.net/freebies/free-forest-bosses-pixel-art-sprite-sheet-pack/",
        "downloadPage": "https://free-game-assets.itch.io/free-forest-bosses-pixel-art-sprite-sheet-pack",
        "licenseUrl": "https://craftpix.net/file-licenses/",
        "author": "CraftPix / Free Game Assets (GUI, Sprite, Tilesets)",
    },
}
WEAPON_NAMES = {
    "sword": ["Practice sword", "Wooden sword", "Iron sword", "Bronze sword", "Silver sword", "Gold sword"],
    "axe": ["Practice axe", "Woodcutter axe", "Iron axe", "Bronze axe", "Silver axe", "Gold axe"],
    "spear": ["Practice spear", "Wooden spear", "Iron spear", "Bronze spear", "Silver spear", "Gold spear"],
    "staff": ["Practice staff", "Wooden staff", "White staff", "Bronze staff", "Silver staff", "Gold staff"],
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def png(archive, name):
    return Image.open(io.BytesIO(archive.read(name))).convert("RGBA")


def save_png(name, image):
    path = OUTPUT / (name + ".png")
    image.save(path, optimize=True)
    return {"file": path.name, "sha256": sha256(path.read_bytes())}


def build(archive_dir):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    archives = {}
    for key, spec in PACKS.items():
        data = (archive_dir / spec["filename"]).read_bytes()
        if sha256(data) != spec["sha256"]:
            raise ValueError(f"Source changed; inspect archive before updating pin: {spec['filename']}")
        archives[key] = zipfile.ZipFile(io.BytesIO(data))

    inventory, manifest = [], {}
    actual_pngs = [name for name in archives["weapons"].namelist() if name.endswith(".png")]
    expected_pngs = [name.lower() + ".png" for names in WEAPON_NAMES.values() for name in names]
    if sorted(actual_pngs) != sorted(expected_pngs):
        raise ValueError("Expected exactly the 24 free inventory PNGs")
    for family, names in WEAPON_NAMES.items():
        for tier, name in enumerate(names):
            asset_id = f"{family}-{tier}"
            source_file = name.lower() + ".png"
            source = png(archives["weapons"], source_file)
            if source.size != (800, 800):
                raise ValueError(f"Unexpected inventory dimensions: {source_file}")
            bounds = source.getchannel("A").getbbox()
            if not bounds or source.getchannel("A").getextrema()[0] != 0:
                raise ValueError(f"Expected nonempty transparent art: {source_file}")
            icon = ImageOps.contain(source.crop(bounds), (112, 112), Image.Resampling.LANCZOS)
            prepared = Image.new("RGBA", (128, 128))
            prepared.alpha_composite(icon, ((128 - icon.width) // 2, (128 - icon.height) // 2))
            manifest[asset_id] = {
                **save_png(asset_id, prepared), "pack": "weapons", "sourceFiles": [source_file],
                "sourceAlphaBounds": bounds, "width": 128, "height": 128,
                "transform": "Crop transparent margin, contain in 112x112 using Lanczos, center on transparent 128x128 canvas; no recoloring",
            }
            inventory.append({
                "id": asset_id, "name": name, "family": family, "tier": tier,
                "imageUrl": f"/game-assets/weapon-demo/{asset_id}.png",
            })

    enemies = {}
    for asset_id, folder, label, attack_file, attack_ms, impact_ms in [
        ("forest-brute", "2", "Purple-marked forest fighter", "Attack1", 780, 520),
        ("forest-skirmisher", "3", "Yellow-marked forest caster", "Attack1", 660, 440),
    ]:
        frames, actions, source_files = [], {}, []
        for action, filename, duration in [
            ("idle", "Idle", 800), ("walk", "Walk", 600),
            ("attack", attack_file, attack_ms), ("hurt", "Hurt", 240),
            ("death", "Death", 780 if folder == "2" else 600),
        ]:
            source_file = f"{folder}/{filename}.png"
            strip = png(archives["forestBosses"], source_file)
            if strip.height != 96 or strip.width % 96:
                raise ValueError(f"Unexpected native strip dimensions: {source_file}")
            left = []
            for x in range(0, strip.width, 96):
                frame = strip.crop((x, 0, x + 96, 96))
                box = frame.getchannel("A").getbbox()
                if not box or box[0] < 32 or box[1] < 48:
                    raise ValueError(f"Crop would clip source art: {source_file}")
                prepared = Image.new("RGBA", (80, 48))
                prepared.alpha_composite(frame.crop((32, 48, 96, 96)), (0, 0))
                left.append(prepared)
            source_files.append(source_file)
            directions = {}
            for direction in ("left", "right"):
                directions[direction] = []
                for frame in left:
                    directions[direction].append(len(frames))
                    frames.append(frame if direction == "left" else ImageOps.mirror(frame))
            directions["up"] = directions["right"]
            directions["down"] = directions["right"]
            actions[action] = {"durationMs": duration, "loop": action in ("idle", "walk"), "frames": directions}
            if action == "attack":
                actions[action]["impactAtMs"] = impact_ms
                if folder == "3":
                    actions[action]["windupEndAtMs"] = 220
        count = len(frames)
        atlas = Image.new("RGBA", (640, math.ceil(count / 8) * 48))
        for index, frame in enumerate(frames):
            atlas.alpha_composite(frame, ((index % 8) * 80, (index // 8) * 48))
        common = {
            "frameWidth": 80, "frameHeight": 48, "columns": 8, "frameCount": count,
            "feet": {"x": 40, "y": 48}, "origin": {"x": 0.5, "y": 1},
            "suggestedScale": 2, "animations": actions,
        }
        manifest[asset_id] = {
            **save_png(asset_id, atlas), **common, "pack": "forestBosses", "sourceFiles": source_files,
            "atlasCellCount": math.ceil(count / 8) * 8,
            "transform": "Crop constant empty margins from 96x96 native cells to 64x48, pad to 80x48 around source foot (72,96), mirror for right; no resampling or invented frames",
        }
        enemies[asset_id] = {
            "id": asset_id, "textureKey": f"weapon-demo-{asset_id}",
            "imageUrl": f"/game-assets/weapon-demo/{asset_id}.png",
            "sourceUrl": PACKS["forestBosses"]["sourceUrl"],
            "author": PACKS["forestBosses"]["author"],
            "license": "CraftPix Freebie Products License (game use)",
            "licenseUrl": "/game-assets/weapon-demo/LICENSE-CraftPix.txt",
            **common,
            "animationNotes": [
                f"{label}, character {folder} from the separately licensed animated forest bosses pack; not from the requested modular vector tribal pack.",
                "Source faces left. Right frames are exact horizontal mirrors; up/down reuse the right side view.",
                "Constant empty margins removed without clipping any source alpha. Shared foot anchor is (40,48) in 80x48 cells.",
                "Only the listed real frame indices are playable; transparent atlas padding is excluded.",
                "Cycle and impact timing are demo choices rather than author-provided timings.",
                *(["Standing cast: preparation plays during windup; the bright-hand frame releases 3/Projectile.png."] if folder == "3" else []),
            ],
        }

    projectile = archives["forestBosses"].read("3/Projectile.png")
    if png(archives["forestBosses"], "3/Projectile.png").size != (4, 4):
        raise ValueError("Unexpected skirmisher projectile dimensions")
    (OUTPUT / "forest-spark.png").write_bytes(projectile)
    manifest["forest-spark"] = {
        "file": "forest-spark.png", "sha256": sha256(projectile), "pack": "forestBosses",
        "sourceFiles": ["3/Projectile.png"], "width": 4, "height": 4,
        "transform": "Unmodified native projectile; integer-scaled at runtime",
    }

    weapon_header = '''// Generated by scripts/import-weapon-demo.py; gameplay statistics live in equipment.ts.
export type WeaponItemFamily = 'sword' | 'axe' | 'spear' | 'staff';
export type WeaponItemTier = 0 | 1 | 2 | 3 | 4 | 5;
export interface WeaponItemAsset {
  id: `${WeaponItemFamily}-${WeaponItemTier}`;
  name: string;
  family: WeaponItemFamily;
  tier: WeaponItemTier;
  imageUrl: string;
}

/** Static inventory art by Truly Malicious, CC BY 4.0; credits in weapon-demo/CREDITS.txt. */
export const WEAPON_ITEM_ASSETS: readonly WeaponItemAsset[] = '''
    (METADATA / "weapon-assets.ts").write_text(weapon_header + json.dumps(inventory, indent=2) + ";\n", encoding="utf8")
    enemy_header = '''// Generated by scripts/import-weapon-demo.py from native production animation strips.
import type { JungleWildlifeAsset } from './wildlife-assets';

export type ForestEnemyId = 'forest-brute' | 'forest-skirmisher';
export type ForestEnemyAsset = Omit<JungleWildlifeAsset, 'id'> & { id: ForestEnemyId };

export const FOREST_ENEMY_ASSETS: Readonly<Record<ForestEnemyId, ForestEnemyAsset>> = '''
    (METADATA / "enemy-assets.ts").write_text(enemy_header + json.dumps(enemies, indent=2) + ";\n", encoding="utf8")
    provenance = {
        "preparedAt": "2026-09-12", "sourceArchives": PACKS, "assets": manifest,
        "downloadMethod": "Normal public author itch.io free-download browser controls; no accounts or payments",
        "weaponDisclosure": "Author discloses DALL-E 3 base imagery, manually refined and compiled. Free pack has 24 static inventory icons, no elemental weapons or attack animations.",
        "tribalPackStatus": "Requested CraftPix tribal pack download requires sign-in; no archive acquired. Page describes 3 modular vector characters, AI/EPS/PNG, without promised animations. The two additional enemies come from the separate animated forest pack.",
    }
    (OUTPUT / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf8")
    (OUTPUT / "SOURCE-README-TrulyMalicious.txt").write_bytes(archives["weapons"].read("read_me.txt"))
    print(f"Prepared {len(inventory)} inventory icons and {len(enemies)} animated enemies ({sum(p.stat().st_size for p in OUTPUT.glob('*.png')):,} PNG bytes).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive-dir", type=Path, default=ROOT / "test-results/asset-imports")
    build(parser.parse_args().archive_dir)
