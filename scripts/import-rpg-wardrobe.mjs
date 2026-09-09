import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

/* global fetch */

// Imports authored PNGs byte-for-byte; no image painting, recoloring or frame baking.
const revision = 'f07f7f5892e67c932c68f70bb04472f2c64e46bc';
const upstream = `https://raw.githubusercontent.com/ElizaWy/LPC/${revision}/`;
const destination = new URL('../public/game-assets/lpc-characters/', import.meta.url);
const eliza = 'Eliza Wyatt (DeathsDarling)';
const redshrike = 'Stephen Challener (Redshrike)';
const actions = { idle: 3, walk: 8, run: 8 };
const sourceUrl = (path) => upstream + path.split('/').map(encodeURIComponent).join('/');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const sources = [];

for (const [body, short] of [
  ['Feminine', 'f'],
  ['Masculine', 'm'],
]) {
  for (const color of short === 'f'
    ? ['Forest', 'Indigo', 'Wine', 'Charcoal']
    : ['Forest', 'Linen', 'Wine', 'Blue']) {
    sources.push({
      key: `shirt-${short}-${color.toLowerCase()}`,
      layer: 'shirt',
      path: `Characters/Clothing/${body}, Thin/Torso/Shirt 07 - Buttoned Longsleeve Shirt/${color}`,
      credit: 'Characters/Clothing/Credits.txt',
      authors: [eliza],
      entry: 'Shirt 07 - Buttoned Longsleeve Shirt',
    });
  }
}
for (const [key, style, color, artists] of [
  ['bob-blonde', 'Medium 08 - Bob, Bangs', 'Blonde', ['bluecarrot16', eliza]],
  ['bun-platinum', 'Medium 04 - Bangs & Bun', 'Platinum', ['bluecarrot16', eliza]],
  ['curly-silver', 'Medium 02 - Curly', 'Silver', [eliza]],
  ['parted-blonde', 'Short 02 - Parted', 'Blonde', [eliza]],
  ['cowlick-orange', 'Short 04 - Cowlick', 'Orange', ['bluecarrot16', eliza]],
  ['natural-black', 'Short 05 - Natural', 'Black', ['bluecarrot16', eliza]],
  ['twists-black', 'Medium 09 - Twists', 'Black', ['bluecarrot16', eliza]],
  ['cornrows-brown', 'Medium 05 - Cornrows', 'Brown', ['bluecarrot16', eliza]],
  ['bob-violet', 'Medium 08 - Bob, Bangs', 'Violet', ['bluecarrot16', eliza]],
  ['page-white', 'Medium 01 - Page', 'White', ['Johannes Sjölund (wulax)', eliza]],
])
  sources.push({
    key: `hair-${key}`,
    layer: 'hair',
    path: `Characters/Hair/${style}/${color}`,
    credit: 'Characters/Hair/Credits.txt',
    authors: artists,
    entry: style,
  });
for (const [body, index, short] of [
  ['Feminine', '01', 'f'],
  ['Masculine', '02', 'm'],
]) {
  for (const layer of ['body', 'head'])
    sources.push({
      key: `skin-${short}-ivory`,
      layer,
      path: `Characters/${layer === 'body' ? `Body/Body ${index} - ${body}, Thin` : `Head/Head ${index} - ${body}`}/Ivory`,
      credit: 'Characters/Credits.txt',
      authors: [
        redshrike,
        eliza,
        ...(short === 'm' && layer === 'body' ? ['Durrani', 'BenCreating'] : []),
      ],
      entry: layer === 'body' ? `Body - ${body}, Thin` : `Adult Head - ${body}`,
    });
}

const credits = new Map();
for (const credit of new Set(sources.map((source) => source.credit))) {
  const response = await fetch(sourceUrl(credit));
  if (!response.ok) throw new Error(`Cannot verify ${credit}: HTTP ${response.status}`);
  const text = await response.text();
  if (!text.includes('OGA-BY 3.0')) throw new Error(`License missing from ${credit}`);
  credits.set(credit, text);
}
for (const source of sources) {
  const declaration = credits.get(source.credit);
  const entryIndex = declaration.indexOf(source.entry);
  const entry = declaration.slice(entryIndex);
  if (entryIndex < 0 || !entry.slice(0, 900).includes('OGA-BY 3.0'))
    throw new Error(`Unverified license: ${source.entry}`);
}

const jobs = sources.flatMap((source) =>
  Object.entries(actions).map(([action, frames]) => ({ ...source, action, frames })),
);
const assets = [];
let next = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < jobs.length) {
      const source = jobs[next++];
      const path = `${source.path}/${source.action[0].toUpperCase() + source.action.slice(1)}.png`;
      const url = sourceUrl(path);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      if (
        data.subarray(1, 4).toString() !== 'PNG' ||
        data.readUInt32BE(16) !== source.frames * 64 ||
        data.readUInt32BE(20) !== 256
      )
        throw new Error(`Unexpected spritesheet: ${path}`);
      await mkdir(new URL(`${source.key}/`, destination), { recursive: true });
      const file = `${source.key}/${source.layer}-${source.action}.png`;
      await writeFile(new URL(file, destination), data);
      assets.push({
        file,
        source: url,
        revision,
        sha256: hash(data),
        bytes: data.length,
        width: source.frames * 64,
        height: 256,
        frameWidth: 64,
        frameHeight: 64,
        framesPerDirection: source.frames,
        directions: ['up', 'left', 'down', 'right'],
        authors: source.authors,
        inheritedCredits: [redshrike],
        license: 'OGA-BY-3.0',
        creditDeclaration: sourceUrl(source.credit),
        modifications: 'None. Original PNG, unchanged.',
      });
    }
  }),
);
assets.sort((a, b) => a.file.localeCompare(b.file));
await writeFile(
  new URL('wardrobe-manifest.json', destination),
  `${JSON.stringify(
    {
      title: 'Dmap modest wardrobe and expanded hair palettes',
      revision,
      license: 'OGA-BY-3.0',
      importedAt: '2026-09-09',
      assets,
      notes:
        'Original high-neck buttoned long sleeves replace the prior female yellow-shirt and plate silhouettes. Original light hair palettes are used without multiplicative darkening. All saved character IDs remain valid.',
    },
    null,
    2,
  )}\n`,
);
for (const [path, data] of credits) {
  const filename = path.includes('/Clothing/')
    ? 'upstream-clothing-credits.txt'
    : path.includes('/Hair/')
      ? 'upstream-hair-credits.txt'
      : 'upstream-characters-credits.txt';
  if ((await readFile(new URL(filename, destination), 'utf8').catch(() => '')) !== data)
    await writeFile(new URL(filename, destination), data);
}
console.log(
  `Imported ${assets.length} unchanged PNGs (${sources.length} animated layers), all idle/walk/run in four directions.`,
);
