import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import process from 'node:process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { RPG_SAMPLES } from '../src/features/rpg/sample-worlds.ts';

/* global fetch */

const commit = 'f07f7f5892e67c932c68f70bb04472f2c64e46bc';
const base = `https://raw.githubusercontent.com/ElizaWy/LPC/${commit}/`;
const destination = new URL('../public/game-assets/lpc-world/', import.meta.url);
const commonArtists = ['Lanea Zimmerman (Sharm)', 'Eliza Wyatt (DeathsDarling)'];
const files = [
  ['terrain-summer.png', 'Terrain/terrain_summer.png', 'Terrain', commonArtists],
  ['trees-summer.png', 'Terrain/trees_summer.png', 'Terrain', commonArtists],
  ['flowers.png', 'Terrain/flowers.png', 'Terrain', [...commonArtists, 'Hyptosis', 'BlueCarrot16']],
  ['rocks.png', 'Terrain/Rocks, Grasslands.png', 'Terrain', ['Eliza Wyatt (DeathsDarling)']],
  [
    'brick-house-a.png',
    'Structure/Structures/Brick House A.png',
    'Structure/Structures',
    commonArtists,
  ],
  [
    'brick-house-b.png',
    'Structure/Structures/Brick House B.png',
    'Structure/Structures',
    commonArtists,
  ],
  [
    'paneled-house-a.png',
    'Structure/Structures/Paneled House A.png',
    'Structure/Structures',
    commonArtists,
  ],
  ['jagged-walls.png', 'Structure/Walls/Jagged Stone Walls.png', 'Structure/Walls', commonArtists],
  ['diamond-floor.png', 'Structure/Floor/Diamond Tile B.png', 'Structure/Floor', commonArtists],
  ['stone-floor.png', 'Structure/Floor/Tile B.png', 'Structure/Floor', commonArtists],
  ['gritty-dirt.png', 'Structure/Floor/Gritty Dirt.png', 'Structure/Floor', commonArtists],
  [
    'wood-bridge.png',
    'Structure/Bridges/Wood Bridge A - Rails.png',
    'Structure/Bridges',
    commonArtists,
  ],
  ['stone-pillars.png', 'Structure/Pillars/Stone Pillar A.png', 'Structure/Pillars', commonArtists],
  ['signs.png', 'Structure/Signs/Sign Backgrounds A.png', 'Structure/Signs', commonArtists],
  [
    'arched-doorway.png',
    'Structure/Doors/64x64px Arched Doors/Arched Doorway A.png',
    'Structure/Doors',
    commonArtists,
  ],
  [
    'door-48.png',
    'Structure/Doors/32x48px Doors/12 Panel Door A.png',
    'Structure/Doors',
    commonArtists,
  ],
  [
    'door-64.png',
    'Structure/Doors/32x64px Doors/15 Panel Door A.png',
    'Structure/Doors',
    commonArtists,
  ],
  ['cement-stairs.png', 'Structure/Stairs/Cement Stairs A.png', 'Structure/Stairs', commonArtists],
  [
    'dungeon-elements.png',
    'Objects/Small Items/Dungeon Elements.png',
    'Objects/Small Items',
    commonArtists,
  ],
  ['chests.png', 'Objects/Furniture/Chest.png', 'Objects/Furniture', commonArtists],
  [
    'shelves.png',
    'Objects/Furniture/Shelf.png',
    'Objects/Furniture',
    ['Eliza Wyatt (DeathsDarling)'],
  ],
  ['wall-lights.png', 'Objects/Wall Items/Lighting, Wall.png', 'Objects/Wall Items', commonArtists],
];

const creditsName = (directory) =>
  `credits-${directory.replaceAll(/[ /]/g, '-').toLowerCase()}.txt`;
const sourceUrl = (path) => `${base}${path.split('/').map(encodeURIComponent).join('/')}`;
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
await mkdir(destination, { recursive: true });

if (process.argv.includes('--download')) {
  const existing = JSON.parse(await readFile(new URL('manifest.json', destination), 'utf8'));
  for (const [filename, path] of files) {
    const response = await fetch(sourceUrl(path));
    if (!response.ok) throw new Error(`Unable to download ${path}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const expected = existing.files.find((entry) => entry.file === filename).sha256;
    if (sha256(bytes) !== expected) throw new Error(`Pinned hash mismatch: ${filename}`);
    await writeFile(new URL(filename, destination), bytes);
  }
  const directories = new Set([
    ...files.map((entry) => entry[2]),
    'Structure/Roofing',
    'Structure/Windows',
  ]);
  for (const directory of directories) {
    const response = await fetch(sourceUrl(`${directory}/Credits.txt`));
    if (!response.ok) throw new Error(`Unable to download credits for ${directory}`);
    await writeFile(new URL(creditsName(directory), destination), await response.text());
  }
}

const manifest = {
  title: 'LPC Revised — Willowmere and The Lantern Vault scenery',
  repository: 'https://github.com/ElizaWy/LPC',
  commit,
  license: 'OGA-BY-3.0',
  licenseFile: 'OGA-BY-3.0.txt',
  creditsFile: 'CREDITS.md',
  modifications:
    'Original PNG files are byte-for-byte copies. Frames are selected at runtime without altering source files. Dmap authored the scene layout, collision footprints, and dialogue. Original artists retain their artwork rights.',
  provenance: {
    baseAssets:
      'https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles',
    baseAssetsLicenseNote:
      'The source attribution instructions explicitly permit Lanea Zimmerman and Stephen Challener assets under OGA-BY 3.0 despite the page-level license badge. The pinned per-file declarations are retained in the accompanying credits files.',
    houseComponents: [
      'Brick Wall Block Edging',
      'Brick Wall A',
      'Siding, Plain',
      'Doorframe A (32x48px and 32x64px)',
      'Stone Windows A',
      'Ornamental Windows A',
      'Short Steps A',
      'Brick Chimney A',
      'Hipped Shingle Roof A',
      'Flat Shingle Roof A',
      'Gable Shingle Roof A',
    ],
    houseComponentNotices: [
      'credits-structure-walls.txt',
      'credits-structure-doors.txt',
      'credits-structure-windows.txt',
      'credits-structure-stairs.txt',
      'credits-structure-roofing.txt',
    ],
  },
  geometry: {
    nativeTileSize: 32,
    frameCoordinates:
      'Top-left source pixels; uniform sheets use zero-based row-major numeric frames.',
    positioning:
      'Stamps use top-left origin. Negative depth means ground. Upright stamps sort by their authored world-space foot baseline. Tree colliders cover trunks, not leaves; masonry and water colliders match non-walkable ground, with the bridge deck left open.',
    animation:
      'Scenery is static. No implied environment animation coverage. All frame selections and exact per-stamp collision footprints are in src/features/rpg/sample-worlds.ts.',
  },
  files: await Promise.all(
    files.map(async ([file, path, directory, artists]) => {
      const bytes = await readFile(new URL(file, destination));
      const texture = RPG_SAMPLES.village.textures.find((entry) => entry.url.endsWith(`/${file}`));
      return {
        file,
        title: path.split('/').at(-1).replace('.png', ''),
        artists,
        license: 'OGA-BY-3.0',
        source: sourceUrl(path),
        pinnedCredits: sourceUrl(`${directory}/Credits.txt`),
        notices: creditsName(directory),
        sha256: sha256(bytes),
        bytes: bytes.length,
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
        frames: texture?.frames ?? {
          uniformWidth: texture?.frameWidth ?? bytes.readUInt32BE(16),
          uniformHeight: texture?.frameHeight ?? bytes.readUInt32BE(20),
        },
      };
    }),
  ),
};
await writeFile(new URL('manifest.json', destination), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Verified ${manifest.files.length} original scenery PNGs; wrote ${fileURLToPath(new URL('manifest.json', destination))}`,
);
