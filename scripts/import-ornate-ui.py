"""Export the licensed sample's Unity slices as crisp SVG paths for CSS 9-slicing.

No art is redrawn: pixel runs become vector paths, using the project's UI palette.
Download the free sample to assets/ornate-retro-ui/source.zip, then run this script.
Input stays in ignored assets; only the slices used by the game are published.
"""
from pathlib import Path
from collections import defaultdict
import hashlib
import io
import json
import re
import tarfile
import zipfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/ornate-retro-ui/source.zip'
OUTPUT = ROOT / 'public/game-assets/ornate-retro'
OUTPUT.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(SOURCE) as archive:
    package_path = next(name for name in archive.namelist() if name.endswith('.unitypackage'))
    with tarfile.open(fileobj=io.BytesIO(archive.read(package_path)), mode='r:gz') as package:
        # Read known assets in memory; never extract arbitrary archive paths to disk.
        assets = {}
        for member in package.getmembers():
            if member.name.endswith('/pathname'):
                name = package.extractfile(member).read().decode('utf-8').split('/')[-1]
                if name in ('GreenboyUISheet.png', 'alagard.ttf'):
                    prefix = member.name.removesuffix('pathname')
                    assets[name] = package.extractfile(prefix + 'asset').read()
                    if name.endswith('.png'):
                        assets[name + '.meta'] = package.extractfile(prefix + 'asset.meta').read()
sheet = Image.open(io.BytesIO(assets['GreenboyUISheet.png'])).convert('RGBA')
metadata = assets['GreenboyUISheet.png.meta'].decode('utf-8').replace('\r\n', '\n')
rects = {}
for block in metadata.split('    - serializedVersion: 2\n'):
    match = re.search(r'      name: ([^\r\n]+)\n      rect:\n        serializedVersion: 2\n        x: (\d+)\n        y: (\d+)\n        width: (\d+)\n        height: (\d+)', block)
    if match:
        name, x, y, w, h = match.groups()
        rects[name] = (int(x), sheet.height - int(y) - int(h), int(w), int(h))

palette = {'071821': '#14291f', '306850': '#887c50', '86c06c': '#d6c28a'}
exports = {
    'panel': 'mainPanel9-Slice', 'panel-frame': 'panelFrame9-Slice',
    'button': 'buttonNormal9-Slice', 'button-hover': 'buttonHovered9-Slice',
    'button-pressed': 'buttonPressed9-Slice',
    'divider': 'dividerMiddle',
    'arrow-down': 'downArrowLight', 'arrow-right': 'rightArrowLight',
    'settings': 'settingsIcon',
}
provenance = []
for file, source in exports.items():
    x0, y0, width, height = rects[source]
    colors = dict(palette)
    if file == 'button': colors['306850'] = '#314434'
    if file == 'button-hover': colors['86c06c'] = '#40523b'
    if file == 'button-pressed': colors['306850'] = '#514a32'
    runs = defaultdict(list)
    for y in range(height):
        x = 0
        while x < width:
            pixel = sheet.getpixel((x0 + x, y0 + y))
            start = x
            while x < width and sheet.getpixel((x0 + x, y0 + y)) == pixel:
                x += 1
            if pixel[3]:
                color = colors['%02x%02x%02x' % pixel[:3]]
                runs[color].append(f'M{start} {y}h{x-start}v1h{start-x}z')
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" shape-rendering="crispEdges">'
    svg += ''.join(f'<path fill="{color}" d="{"".join(paths)}"/>' for color, paths in runs.items()) + '</svg>\n'
    (OUTPUT / f'{file}.svg').write_text(svg, encoding='utf-8')
    provenance.append({'file': f'{file}.svg', 'sourceSprite': source, 'sourceRect': [x0,y0,width,height], 'palette': colors})
(OUTPUT / 'alagard.ttf').write_bytes(assets['alagard.ttf'])
(OUTPUT / 'provenance.json').write_text(json.dumps({
    'source': 'https://z-spider.itch.io/ornate-retro-ui-free-sample',
    'creator': 'zLizard', 'sourceArchiveSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'derivation': 'Original sprite coordinates from the Unity metadata; exact pixel silhouettes exported as SVG paths with a forest/gold palette. No raster resampling.',
    'slices': provenance,
}, indent=2) + '\n')
print(f'Exported {len(exports)} UI slices and Alagard to {OUTPUT}')
