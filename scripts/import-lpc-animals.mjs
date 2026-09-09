import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

/* global fetch */

const destination = new URL('../public/game-assets/lpc-animals/', import.meta.url);
const page = 'https://opengameart.org/content/lpc-cats-and-dogs';
const files = [
  {
    file: 'cat.png',
    source: 'https://opengameart.org/sites/default/files/cat_0.png',
    expectedSha256: '914bae85486052a70d29b26d881bfce3dcaa987f6f95cab08e4a65e30fa13f97',
  },
  {
    file: 'dog.png',
    source: 'https://opengameart.org/sites/default/files/dog_2.png',
    expectedSha256: '77f4667ab3f681408a8afa528f3fff0bea3e3cd7d0e28d5c11f2d09c7729b891',
  },
];
await mkdir(destination, { recursive: true });
const assets = [];
for (const item of files) {
  const response = await fetch(item.source);
  if (!response.ok) throw new Error(`${item.source}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(data).digest('hex');
  if (sha256 !== item.expectedSha256)
    throw new Error(`The verified original changed: ${item.file}`);
  if (
    data.subarray(1, 4).toString() !== 'PNG' ||
    data.readUInt32BE(16) !== 512 ||
    data.readUInt32BE(20) !== 256
  )
    throw new Error('Unexpected authored animal atlas');
  await writeFile(new URL(item.file, destination), data);
  assets.push({
    file: item.file,
    source: item.source,
    author: 'bluecarrot16',
    license: 'OGA-BY-3.0',
    sha256,
    bytes: data.length,
    width: 512,
    height: 256,
    frameWidth: 32,
    frameHeight: 32,
    directions: ['right', 'up', 'down', 'left'],
    walkColumns: [0, 1, 2, 1],
    colorColumns: [0, 4, 8, 12],
    modifications: 'None. Original PNG, unchanged.',
  });
}
const licenseUrl = 'https://static.opengameart.org/OGA-BY-3.0.txt';
const license = await fetch(licenseUrl);
if (!license.ok) throw new Error('Cannot retrieve license text');
const licenseText = (await license.text())
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .join('\n')
  .trimEnd();
await writeFile(new URL('LICENSE.txt', destination), `${licenseText}\n`);
await writeFile(
  new URL('manifest.json', destination),
  `${JSON.stringify(
    {
      title: '[LPC] Cats and Dogs',
      sourcePage: page,
      importedAt: '2026-09-09',
      assets,
      license: 'OGA-BY-3.0',
      licenseUrl,
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  new URL('CREDITS.txt', destination),
  `[LPC] Cats and Dogs\nArtist: bluecarrot16\nSelected license: OGA-BY 3.0\nSource and attribution link: ${page}\nFull license: LICENSE.txt\n\nOriginal 512x256 cat and dog PNGs are distributed unchanged.\nDmap selects authored 32x32 frames and coat palettes at runtime.\nThe four walking directions use atlas rows right, up, down, left;\ncolumns 0-2 in each four-column coat block. No pixels are repainted.\n\nPer-file original URLs, hashes and dimensions: manifest.json\nReproduce with: node scripts/import-lpc-animals.mjs\n`,
);
console.log(
  'Imported two original four-direction animal atlases; all four authored coat palettes retained.',
);
