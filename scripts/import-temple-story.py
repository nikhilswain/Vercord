"""Import production temple story art. No previews or editor files ship."""
from pathlib import Path
from PIL import Image
import hashlib, json, struct, zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/free-ruined-temple-top-down-location-pixel-art'
OUT = ROOT / 'public/game-assets/temple-story'
OUT.mkdir(parents=True, exist_ok=True)
textures, provenance = [], []

def source(name):
    if name == 'chest':
        return next(p for p in (SOURCE / 'PNG').glob('*.png') if p.name.endswith('hest.png'))
    return SOURCE / 'PNG' / name

def atlas(name, file, w, h, rects):
    path = source(file)
    im = Image.open(path).convert('RGBA')
    out = Image.new('RGBA', (w, h * len(rects)))
    for i, (x, y) in enumerate(rects):
        assert x >= 0 and y >= 0 and x+w <= im.width and y+h <= im.height, (name,x,y)
        out.paste(im.crop((x,y,x+w,y+h)), (0,i*h))
    out.save(OUT / f'{name}.png', optimize=True)
    textures.append({'key':f'story-{name}','url':f'/game-assets/temple-story/{name}.png','frameWidth':w,'frameHeight':h})
    provenance.append({'name':name,'source':str(path.relative_to(SOURCE)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'frameSize':[w,h],'frameOrigins':rects})

def grid(name, file, w, h, n, columns):
    atlas(name,file,w,h,[(i%columns*w,i//columns*h) for i in range(n)])

def gate_layers():
    """Keep the authored frame, ground shadow and moving bars on separate render planes."""
    path = SOURCE / 'ASEPRITE/lattice.aseprite'
    data = path.read_bytes()
    count, width, height, depth = struct.unpack_from('<HHHH', data, 6)
    assert depth == 32
    opacities, cels, frames = [], {}, []
    pos = 128
    for frame in range(count):
        size, _, chunks = struct.unpack_from('<IHH', data, pos)
        layers = {}; cursor = pos + 16
        for _ in range(chunks):
            length, kind = struct.unpack_from('<IH', data, cursor)
            if kind == 0x2004:
                opacities.append(data[cursor + 18])
            elif kind == 0x2005:
                layer, x, y, alpha, celtype = struct.unpack_from('<HhhBH', data, cursor + 6)
                if celtype == 1:
                    linked = struct.unpack_from('<H', data, cursor + 22)[0]
                    cel = cels[(linked, layer)].copy()
                else:
                    assert celtype in (0, 2)
                    w, h = struct.unpack_from('<HH', data, cursor + 22)
                    pixels = data[cursor + 26:cursor + length]
                    cel = Image.frombytes('RGBA', (w, h), zlib.decompress(pixels) if celtype == 2 else pixels)
                cels[(frame, layer)] = cel.copy()
                opacity = alpha * opacities[layer] / (255 * 255)
                if opacity < 1:
                    cel.putalpha(cel.getchannel('A').point(lambda value: round(value * opacity)))
                canvas = Image.new('RGBA', (width, height))
                canvas.alpha_composite(cel, (x, y))
                layers[layer] = canvas
            cursor += length
        frames.append(layers)
        pos += size
    for variant in range(2):
        for suffix, layer, indices in [('', 2, list(range(count))), ('frame-', 3, [0]), ('shadow-', 0, [0])]:
            name = f'gate-{suffix}{variant}'
            output = Image.new('RGBA', (32, 32 * len(indices)))
            for row, frame in enumerate(indices):
                canvas = frames[frame].get(layer, Image.new('RGBA', (width, height)))
                output.paste(canvas.crop((variant*32, 0, (variant+1)*32, 32)), (0, row*32))
            # An open gate has no foreground pixels across the passage.
            if layer == 2:
                assert output.crop((0, 0, 32, 32)).getbbox() is None
            output.save(OUT / f'{name}.png', optimize=True)
            textures.append({'key':f'story-{name}','url':f'/game-assets/temple-story/{name}.png','frameWidth':32,'frameHeight':32})
            provenance.append({'name':name,'source':str(path.relative_to(SOURCE)),'sha256':hashlib.sha256(data).hexdigest(),'layers':[layer],'sourceFrames':indices,'crop':[variant*32,0,32,32]})


grid('stone','Walls_floor.png',16,16,176,11)
atlas('winged-statue','Objects_interior.png',128,96,[(0,0)])
atlas('altar','Objects_interior.png',32,48,[(144,96)])
atlas('banners','Objects_interior.png',16,48,[(0,96)])
atlas('treasure','Objects_interior.png',96,32,[(96,144)])
atlas('bones','Objects_interior.png',32,32,[(0,224),(32,224),(64,224)])
atlas('floor','Decorative_cracks_interior.png',32,32,[(0,272),(32,272),(32,304),(64,304)])
grid('blade','blades_trap.png',48,48,12,4)
atlas('spikes','Spikes.png',32,32,[(i*32,32) for i in range(12)])
for i in range(2):
    atlas(f'lever-{i}','Lever.png',40,32,[(i*40,f*32) for f in range(8)])
    atlas(f'chest-{i}','chest',40,32,[(i*40,f*32) for f in range(6)])
gate_layers()
for i,(x,y) in enumerate([(0,0),(40,0),(80,0),(0,40),(40,40),(80,40)]):
    atlas(f'lamp-{i}','Fire_animation.png',40,40,[(x,y+f*80) for f in range(6)])
for i in range(1,7):
    for action,n in [('Pray',12),('Idle',12),('Walk',6)]:
        atlas(f'cultist-{i}-{action.lower()}',f'Cultist{i}_{action}.png',32,32,[(f*32,0) for f in range(n)])
grid('leader-summon','Leader_summon.png',32,32,14,5)
atlas('leader-idle','Leader_Idle.png',32,32,[(f*32,0) for f in range(12)])
grid('explorer-writing','Discoverer1_writing.png',48,48,4,4)
grid('explorer-idle','Discoverer1_idle.png',48,48,12,4)
grid('explorer-search','Discoverer2_exploring.png',32,32,10,5)
grid('ghost','Ghost.png',96,128,19,5)

# Use the authored pan/shadow layers for extinguished seals, preserving their anchor.
path = SOURCE / 'ASEPRITE/Fire_animation.aseprite'
b=path.read_bytes(); count=struct.unpack_from('<H',b,134)[0]; pos=144
cold=Image.new('RGBA',(40,40))
for _ in range(count):
    length,kind=struct.unpack_from('<IH',b,pos)
    if kind==0x2005:
        layer,x,y,alpha,celtype=struct.unpack_from('<HhhBH',b,pos+6)
        if layer in (1,2) and celtype==2:
            w,h=struct.unpack_from('<HH',b,pos+22)
            cel=Image.frombytes('RGBA',(w,h),zlib.decompress(b[pos+26:pos+length]))
            cold.alpha_composite(cel,(x,y))
    pos+=length
assert cold.getbbox()
cold.save(OUT/'lamp-cold.png',optimize=True)
textures.append({'key':'story-lamp-cold','url':'/game-assets/temple-story/lamp-cold.png'})
provenance.append({'name':'lamp-cold','source':str(path.relative_to(SOURCE)),'sha256':hashlib.sha256(b).hexdigest(),'layers':[1,2],'canvas':[40,40]})
(OUT/'provenance.json').write_text(json.dumps({'assets':provenance},indent=2)+'\n',encoding='utf8')
for file in ['LICENSE-CraftPix.txt','CREDITS.md']:
    note = (ROOT/'public/game-assets/ruined-temple'/file).read_text(encoding='utf8')
    if file == 'LICENSE-CraftPix.txt':
        # The older license note also credits an unrelated slime; it is not in this import.
        note = note.split('\ngreen-slime.png', 1)[0].replace(
            'exact source pages, source archive hashes and transforms.',
            'source files, SHA-256 hashes and frame crops.')
    else:
        note = note.replace('Selected production PNG rectangles extracted at native resolution.',
            'Selected production PNG frames and Aseprite lamp/gate layers extracted at native resolution.')
    (OUT/file).write_text(note,encoding='utf8')
(ROOT/'src/features/rpg/adventure/temple-story-assets.ts').write_text('// Generated by scripts/import-temple-story.py.\nimport type { RpgTexture } from "../types";\nexport const TEMPLE_STORY_TEXTURES: RpgTexture[] = '+json.dumps(textures,indent=2)+';\n',encoding='utf8')
print(f'Imported {len(textures)} temple story textures.')
