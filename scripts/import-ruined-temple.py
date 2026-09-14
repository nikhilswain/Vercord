"""Extract selected production art from the user-supplied free CraftPix temple folder.
No preview art or editor files ship. Usage: python scripts/import-ruined-temple.py [folder]
"""
from pathlib import Path
import hashlib
import json
import sys
import struct
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'assets/free-ruined-temple-top-down-location-pixel-art'
OUT = ROOT / 'public/game-assets/ruined-temple'
OUT.mkdir(parents=True, exist_ok=True)
# Source rectangles measured on actual production sheets. 16px world art is displayed at 2x.
CROPS = {
    'sanctuary': ('Exterior_objects.png', (0, 0, 144, 144)),
    'foundation': ('Exterior_objects.png', (0, 144, 160, 80)),
    'arch': ('Exterior_objects.png', (112, 224, 112, 64)),
    'statue': ('Exterior_objects.png', (0, 464, 64, 104)),
    'broken-statue': ('Exterior_objects.png', (128, 464, 64, 104)),
    'column': ('Exterior_objects.png', (224, 336, 32, 32)),
    'broken-column': ('Exterior_objects.png', (288, 336, 32, 32)),
    'tree-broad': ('Exterior_objects.png', (192, 432, 64, 80)),
    'tree-pine': ('Exterior_objects.png', (256, 432, 64, 80)),
    'tree-round': ('Exterior_objects.png', (192, 512, 64, 80)),
    'bush': ('Trees_grass_alternative_fit.png', (224, 224, 32, 32)),
    'wall': ('Tiles_exterior.png', (224, 16, 64, 32)),
    'vines': ('Tiles_exterior.png', (16, 144, 64, 96)),
    'flagstone': ('Walls_floor.png', (96, 208, 16, 16)),
    'rubble': ('Objects_interior.png', (0, 160, 48, 48)),
    'urns': ('Objects_interior.png', (256, 0, 32, 32)),
}
textures, records = [], []
for name, (file, (x, y, w, h)) in CROPS.items():
    source = SOURCE / 'PNG' / file
    im = Image.open(source).convert('RGBA')
    assert x + w <= im.width and y + h <= im.height
    crop = im.crop((x, y, x + w, y + h))
    assert crop.getbbox()
    crop.save(OUT / f'{name}.png', optimize=True)
    textures.append({'key': f'temple-{name}', 'url': f'/game-assets/ruined-temple/{name}.png'})
    records.append({'name': name, 'source': 'PNG/' + file, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'rect': [x, y, w, h]})
fire = SOURCE / 'PNG/Fire_animation.png'
im = Image.open(fire).convert('RGBA')
assert im.size == (128, 480)
# Each source frame is 128x80 and contains several lamps at different positions.
# Read the authored frame dimensions/timing, then extract the SAME top-left lamp
# from each frame. Treating every 40px row as a frame alternates lamp variants.
aseprite = SOURCE / 'ASEPRITE/Fire_animation.aseprite'
data = aseprite.read_bytes()
_, magic, frame_count, source_width, source_height, depth = struct.unpack_from('<IHHHHH', data)
assert (magic, frame_count, source_width, source_height, depth) == (0xA5E0, 6, 128, 80, 32)
assert im.size == (source_width, source_height * frame_count)
frame_durations = []
offset = 128
for frame in range(frame_count):
    size, frame_magic, _, duration = struct.unpack_from('<IHHH', data, offset)
    assert frame_magic == 0xF1FA
    frame_durations.append(duration)
    offset += size
assert len(set(frame_durations)) == 1, 'Variable frame durations need an explicit playback mapping.'
flame = Image.new('RGBA', (32, 40 * frame_count))
frame_rects = []
for frame in range(frame_count):
    y = frame * source_height
    flame.paste(im.crop((0, y, 32, y + 40)), (0, frame * 40))
    frame_rects.append([0, y, 32, 40])
flame.save(OUT / 'flame.png', optimize=True)
flame_animation = {'frames': list(range(frame_count)), 'durationMs': sum(frame_durations)}
textures.append({'key': 'temple-flame', 'url': '/game-assets/ruined-temple/flame.png', 'frameWidth': 32, 'frameHeight': 40})
records.append({'name': 'flame', 'source': 'PNG/Fire_animation.png', 'sha256': hashlib.sha256(fire.read_bytes()).hexdigest(),
    'sourceFrameSize': [source_width, source_height], 'frameRects': frame_rects, 'frameDurationsMs': frame_durations,
    'timingSource': 'ASEPRITE/Fire_animation.aseprite', 'timingSha256': hashlib.sha256(data).hexdigest(),
    'notes': 'Top-left lamp in each authored frame. The pan and shadow keep their original fixed anchor; only flame/glow pixels animate.'})
(OUT / 'provenance.json').write_text(json.dumps({'sourceUrl': 'https://craftpix.net/freebies/free-ruined-temple-top-down-location-pixel-art/', 'assets': records}, indent=2) + '\n', encoding='utf8')
(OUT / 'LICENSE-CraftPix.txt').write_text((ROOT / 'public/game-assets/magic-demo/LICENSE-CraftPix.txt').read_text(encoding='utf8'), encoding='utf8')
(OUT / 'CREDITS.md').write_text('# Ruined Temple\n\nCraftPix / Free Game Assets (GUI, Sprite, Tilesets).\n\n'
    'Source: https://craftpix.net/freebies/free-ruined-temple-top-down-location-pixel-art/\n'
    'License: https://craftpix.net/file-licenses/ — freebie game use, including commercial projects.\n'
    'Downloaded by the project owner. Selected production PNG rectangles extracted at native resolution. '
    'Standalone asset redistribution is not permitted. See provenance.json for source hashes and crop coordinates.\n', encoding='utf8')
(ROOT / 'src/features/rpg/adventure/temple-assets.ts').write_text('// Generated by scripts/import-ruined-temple.py.\n'
    "import type { RpgTexture } from '../types';\n"
    'export const TEMPLE_TEXTURES: RpgTexture[] = ' + json.dumps(textures, indent=2) + ';\n'
    'export const TEMPLE_FLAME_ANIMATION = ' + json.dumps(flame_animation, indent=2) + ' as const;\n', encoding='utf8')
print('Imported', len(textures), 'temple textures')
