import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { chromium } from '@playwright/test';

/* global fetch, Image, document */

// Import with: node scripts/import-norse-characters.mjs
// Canvas only assembles original animated layers; it never paints clothing.
const revised = 'f07f7f5892e67c932c68f70bb04472f2c64e46bc';
const expanded = '675e21e04aaff8486a3a24e09573b3d5af9d28b9';
const repositories = {
  revised: `https://raw.githubusercontent.com/ElizaWy/LPC/${revised}/`,
  expanded: `https://raw.githubusercontent.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator/${expanded}/`,
};
const destination = new URL('../public/game-assets/lpc-characters/', import.meta.url);
const inspectionDirectory = new URL('../.superpowers/norse-characters/', import.meta.url);
const layers = ['body', 'head', 'pants', 'shirt', 'boots', 'hair'];
const actions = { idle: 3, walk: 8, run: 8 };
const directions = ['up', 'left', 'down', 'right'];
const artists = {
  eliza: 'Eliza Wyatt (DeathsDarling)',
  wulax: 'Johannes Sjölund (wulax)',
  bluecarrot: 'bluecarrot16',
  bigbear: 'Michael Whitlock (bigbeargames)',
  makrohn: 'Matthew Krohn (makrohn)',
};
const recipes = [
  {
    id: 'ivar',
    name: 'Ivar',
    base: 'rowan',
    description:
      'Iron armor over forest wool, leather boots, ash-brown page hair and a medium beard.',
    shirt: 'Characters/Clothing/Masculine, Thin/Torso/Shirt 02 - V-neck Longsleeve Shirt/Forest',
    hair: 'Characters/Hair/Medium 01 - Page/Ash Brown',
    beard: 'Characters/Hair/Facial Hair 07 - Medium Beard/Ash Brown',
    armor: 'spritesheets/torso/armour/plate/teen/iron.png',
    hairArtists: [artists.wulax, artists.eliza],
  },
  {
    id: 'sigrid',
    name: 'Sigrid',
    base: 'ash',
    description: 'Copper armor over wine wool, dark boots and chestnut hair tied in a bun.',
    shirt: 'Characters/Clothing/Feminine, Thin/Torso/Shirt 03 - Scoop Longsleeve Shirt/Wine',
    hair: 'Characters/Hair/Medium 04 - Bangs & Bun/Chestnut',
    armor: 'spritesheets/torso/armour/plate/female/copper.png',
    hairArtists: [artists.bluecarrot, artists.eliza],
  },
];
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const imageData = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;
const sourceUrl = (repository, path) =>
  repositories[repository] + path.split('/').map(encodeURIComponent).join('/');
async function download(repository, path) {
  const response = await fetch(sourceUrl(repository, path));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const manifest = JSON.parse(await readFile(new URL('manifest.json', destination), 'utf8'));
const creditsCsv = await download('expanded', 'CREDITS.csv');
const creditRows = creditsCsv
  .toString('utf8')
  .split(/\r?\n/)
  .filter((line) => /^(beards\/beard\/medium|torso\/armour\/plate\/(female|teen)),/.test(line));
if (creditRows.length !== 3 || creditRows.some((line) => !line.includes('OGA-BY 3.0'))) {
  throw new Error('The pinned armor and beard declarations must explicitly offer OGA-BY 3.0.');
}
await writeFile(
  new URL('upstream-norse-credits.txt', destination),
  `Unmodified relevant rows from ${repositories.expanded}CREDITS.csv\n\n${creditRows.join('\n')}\n`,
);

const sources = [];
const input = [];
for (const recipe of recipes) {
  const character = { ...recipe, sheets: {}, armorImage: '' };
  const armor = await download('expanded', recipe.armor);
  character.armorImage = imageData(armor);
  sources.push({
    id: `${recipe.id}-armor`,
    appearance: recipe.id,
    upstreamPath: recipe.armor,
    source: sourceUrl('expanded', recipe.armor),
    revision: expanded,
    sha256: hash(armor),
    bytes: armor.length,
    width: armor.readUInt32BE(16),
    height: armor.readUInt32BE(20),
    authors: [
      'JaidynReiman',
      artists.bluecarrot,
      artists.bigbear,
      artists.wulax,
      ...(recipe.id === 'sigrid' ? [artists.makrohn] : []),
    ],
    license: 'OGA-BY-3.0',
    creditDeclaration: `${repositories.expanded}CREDITS.csv`,
    provenance: [
      'https://opengameart.org/content/lpc-medieval-fantasy-character-sprites',
      'https://opengameart.org/content/lpc-combat-armor-for-women',
    ],
  });
  for (const action of Object.keys(actions)) {
    character.sheets[action] = {};
    for (const layer of layers) {
      if (layer !== 'shirt' && layer !== 'hair') {
        character.sheets[action][layer] = imageData(
          await readFile(new URL(`${recipe.base}/${layer}-${action}.png`, destination)),
        );
        continue;
      }
      const path = `${recipe[layer]}/${action[0].toUpperCase() + action.slice(1)}.png`;
      const buffer = await download('revised', path);
      character.sheets[action][layer] = imageData(buffer);
      sources.push({
        id: `${recipe.id}-${layer}-${action}`,
        appearance: recipe.id,
        upstreamPath: path,
        source: sourceUrl('revised', path),
        revision: revised,
        sha256: hash(buffer),
        bytes: buffer.length,
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
        authors: layer === 'hair' ? recipe.hairArtists : [artists.eliza],
        inheritedCredits: ['Stephen Challener (Redshrike)'],
        license: 'OGA-BY-3.0',
        creditDeclaration: sourceUrl(
          'revised',
          `Characters/${layer === 'hair' ? 'Hair' : 'Clothing'}/Credits.txt`,
        ),
      });
    }
    if (recipe.beard) {
      const path = `${recipe.beard}/${action[0].toUpperCase() + action.slice(1)}.png`;
      const buffer = await download('revised', path);
      character.sheets[action].beard = imageData(buffer);
      sources.push({
        id: `${recipe.id}-beard-${action}`,
        appearance: recipe.id,
        upstreamPath: path,
        source: sourceUrl('revised', path),
        revision: revised,
        sha256: hash(buffer),
        bytes: buffer.length,
        authors: [artists.eliza],
        license: 'OGA-BY-3.0',
        creditDeclaration: `${repositories.expanded}CREDITS.csv`,
        provenance: ['https://opengameart.org/content/lpc-expanded-sit-run-jump-more'],
        note: 'The pinned Revised Hair/Credits.txt omits facial hair. The Expanded per-entry beard declaration explicitly names ElizaWy, OGA-BY 3.0 and the original Revised Hair repository.',
      });
    }
  }
  input.push(character);
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
let result;
try {
  const page = await browser.newPage();
  result = await page.evaluate(
    async ({ input, layers, actions }) => {
      const load = async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return image;
      };
      const canvas = (width, height) => {
        const item = document.createElement('canvas');
        item.width = width;
        item.height = height;
        return item;
      };
      const encode = (item) => item.toDataURL('image/png').split(',')[1];
      const scan = (sheet, frames) => {
        if (sheet.width !== frames * 64 || sheet.height !== 256)
          throw new Error('Unexpected sheet dimensions.');
        const temp = canvas(sheet.width, sheet.height);
        const context = temp.getContext('2d');
        context.drawImage(sheet, 0, 0);
        const frameBounds = [];
        for (let row = 0; row < 4; row++)
          for (let column = 0; column < frames; column++) {
            const pixels = context.getImageData(column * 64, row * 64, 64, 64).data;
            let left = 64,
              top = 64,
              right = 0,
              bottom = 0;
            for (let y = 0; y < 64; y++)
              for (let x = 0; x < 64; x++)
                if (pixels[(y * 64 + x) * 4 + 3]) {
                  left = Math.min(left, x);
                  top = Math.min(top, y);
                  right = Math.max(right, x + 1);
                  bottom = Math.max(bottom, y + 1);
                }
            if (left === 64) throw new Error(`Empty frame at ${row}/${column}.`);
            frameBounds.push([left, top, right, bottom]);
          }
        const heights = frameBounds.map((bounds) => bounds[3] - bounds[1]);
        return {
          nonemptyFrames: frameBounds.length,
          framesPerDirection: [frames, frames, frames, frames],
          unionBounds: [
            Math.min(...frameBounds.map((bounds) => bounds[0])),
            Math.min(...frameBounds.map((bounds) => bounds[1])),
            Math.max(...frameBounds.map((bounds) => bounds[2])),
            Math.max(...frameBounds.map((bounds) => bounds[3])),
          ],
          frameHeightRange: [Math.min(...heights), Math.max(...heights)],
        };
      };
      const outputs = [],
        validation = {};
      const contact = canvas(1152, 3260);
      const contactContext = contact.getContext('2d');
      contactContext.imageSmoothingEnabled = false;
      contactContext.fillStyle = '#a4aea7';
      contactContext.fillRect(0, 0, contact.width, contact.height);
      let contactY = 0;
      for (const character of input) {
        validation[character.id] = {};
        const armor = await load(character.armorImage);
        contactContext.fillStyle = '#1c2b2c';
        contactContext.font = '22px sans-serif';
        contactContext.fillText(character.name, 20, contactY + 28);
        contactY += 40;
        for (const [action, frames] of Object.entries(actions)) {
          const images = {};
          for (const [layer, source] of Object.entries(character.sheets[action]))
            images[layer] = await load(source);
          const shirt = canvas(frames * 64, 256);
          const context = shirt.getContext('2d');
          context.drawImage(images.shirt, 0, 0);
          const armorSheet = canvas(frames * 64, 256);
          const armorContext = armorSheet.getContext('2d');
          // Upstream sources/source_index.html specifies these rows and idle 0-0-1.
          // Walk excludes the stationary first column; Run is the dedicated Revised cycle.
          const sourceRow = { idle: 22, walk: 8, run: 34 }[action];
          for (let row = 0; row < 4; row++)
            for (let column = 0; column < frames; column++) {
              const sourceColumn =
                action === 'idle' ? [0, 0, 1][column] : column + (action === 'walk' ? 1 : 0);
              armorContext.drawImage(
                armor,
                sourceColumn * 64,
                (sourceRow + row) * 64,
                64,
                64,
                column * 64,
                row * 64,
                64,
                64,
              );
            }
          context.drawImage(armorSheet, 0, 0);
          images.shirt = shirt;
          if (images.beard) {
            const hair = canvas(frames * 64, 256);
            const hairContext = hair.getContext('2d');
            hairContext.drawImage(images.hair, 0, 0);
            hairContext.drawImage(images.beard, 0, 0);
            images.hair = hair;
          }
          validation[character.id][action] = { armor: scan(armorSheet, frames), layers: {} };
          const composed = canvas(frames * 64, 256);
          const composedContext = composed.getContext('2d');
          for (const layer of layers) {
            validation[character.id][action].layers[layer] = scan(images[layer], frames);
            composedContext.drawImage(images[layer], 0, 0);
          }
          validation[character.id][action].composite = scan(composed, frames);
          for (const layer of ['shirt', 'hair']) {
            const output = canvas(frames * 64, 256);
            output.getContext('2d').drawImage(images[layer], 0, 0);
            outputs.push({
              file: `${character.id}/${layer}-${action}.png`,
              png: encode(output),
              appearance: character.id,
              layer,
              action,
            });
          }
          if (action === 'idle') {
            const portrait = canvas(40, 40);
            portrait.getContext('2d').drawImage(composed, 12, 136, 40, 40, 0, 0, 40, 40);
            outputs.push({
              file: `${character.id}/portrait.png`,
              png: encode(portrait),
              appearance: character.id,
            });
          }
          contactContext.fillStyle = '#1c2b2c';
          contactContext.font = '17px sans-serif';
          contactContext.fillText(action, 16, contactY + 20);
          // Every rendered frame in four directions, enlarged with nearest-neighbor sampling.
          contactContext.drawImage(composed, 110, contactY, frames * 128, 512);
          contactY += 528;
        }
      }
      return { outputs, validation, contactPng: encode(contact) };
    },
    { input, layers, actions },
  );
} finally {
  await browser.close();
}

manifest.appearances = manifest.appearances.filter(
  (item) => !recipes.some((recipe) => recipe.id === item.id),
);
manifest.assets = manifest.assets.filter(
  (item) => !recipes.some((recipe) => recipe.id === item.appearance),
);
manifest.derivedAssets = manifest.derivedAssets.filter(
  (item) => !recipes.some((recipe) => item.file.startsWith(`${recipe.id}/`)),
);
for (const recipe of recipes) {
  await mkdir(new URL(`${recipe.id}/`, destination), { recursive: true });
  manifest.appearances.push({
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    layers,
    layerSources: Object.fromEntries(
      layers.map((layer) => [
        layer,
        layer === 'shirt' || layer === 'hair' ? recipe.id : recipe.base,
      ]),
    ),
    portrait: `${recipe.id}/portrait.png`,
  });
}
for (const output of result.outputs) {
  const buffer = Buffer.from(output.png, 'base64');
  // Keep Sigrid's single hair layer byte-identical to the source original.
  const originalHair =
    output.appearance === 'sigrid' && output.layer === 'hair'
      ? Buffer.from(input[1].sheets[output.action].hair.split(',')[1], 'base64')
      : buffer;
  await writeFile(new URL(output.file, destination), originalHair);
  const entry = {
    file: output.file,
    appearance: output.appearance,
    sha256: hash(originalHair),
    bytes: originalHair.length,
    width: originalHair.readUInt32BE(16),
    height: originalHair.readUInt32BE(20),
    license: 'OGA-BY-3.0',
  };
  if (output.layer) {
    const selectedSources =
      output.layer === 'shirt'
        ? [`${output.appearance}-shirt-${output.action}`, `${output.appearance}-armor`]
        : [
            `${output.appearance}-hair-${output.action}`,
            ...(output.appearance === 'ivar' ? [`ivar-beard-${output.action}`] : []),
          ];
    manifest.assets.push({
      ...entry,
      layer: output.layer,
      action: output.action,
      sourceIds: selectedSources,
      authors: [
        ...new Set(
          sources
            .filter((source) => selectedSources.includes(source.id))
            .flatMap((source) => source.authors),
        ),
      ],
      modifications:
        output.layer === 'shirt'
          ? 'Original animated wool and armor composited frame-for-frame with Canvas 2D. Armor rows: idle 22-25 (columns 0,0,1), walk 8-11 (columns 1-8), run 34-37 (columns 0-7). No recoloring, resampling, or painted garments.'
          : output.appearance === 'ivar'
            ? 'Original animated page hair and beard composited without recoloring or resampling.'
            : 'None. Original PNG, unchanged.',
      frameWidth: 64,
      frameHeight: 64,
      framesPerDirection: actions[output.action],
      directions,
      alphaValidation: result.validation[output.appearance][output.action].layers[output.layer],
    });
  } else {
    const recipe = recipes.find((item) => item.id === output.appearance);
    manifest.derivedAssets.push({
      ...entry,
      title: `${recipe.name} appearance portrait`,
      derivedFrom: layers.map(
        (layer) =>
          `${layer === 'shirt' || layer === 'hair' ? recipe.id : recipe.base}/${layer}-idle.png`,
      ),
      authors: [
        ...new Set([
          ...sources
            .filter((source) => source.appearance === recipe.id)
            .flatMap((source) => source.authors),
          'Stephen Challener (Redshrike)',
          'Durrani',
          'BenCreating',
        ]),
      ],
      modifications:
        'Canvas 2D composition cropped at x=12, y=136, width=40, height=40 (front idle frame zero). No recoloring or resampling.',
    });
  }
}
manifest.norseSources = sources;
manifest.norseValidation = {
  method:
    'Headless Chrome Canvas alpha scan of every armor, runtime layer and composed frame; visual contact-sheet inspection.',
  renderedFrames: 152,
  runtimeLayerFrames: 912,
  armorFrames: 152,
  results: result.validation,
};
manifest.validation = {
  nonemptyLayers:
    'Every 64x64 frame in all 48 unique runtime sheets has nontransparent pixels for every direction and action. Ivar and Sigrid reuse 24 existing body/head/pants/boots sheets.',
  framesInspected: 1216,
};
manifest.sourceEvidence = manifest.sourceEvidence.filter((item) => !item.norse);
manifest.sourceEvidence.push(
  {
    norse: true,
    url: `${repositories.expanded}CREDITS.csv`,
    note: 'Selected teen/female plate armor and medium-beard rows explicitly offer OGA-BY 3.0; exact rows retained in upstream-norse-credits.txt.',
  },
  {
    norse: true,
    url: `${repositories.expanded}sources/source_index.html`,
    note: 'Pinned animation mapping: idle rows 22-25 with columns 0,0,1; walk rows 8-11, moving columns 1-8; run rows 34-37, columns 0-7.',
  },
);
await writeFile(new URL('manifest.json', destination), `${JSON.stringify(manifest, null, 2)}\n`);
await mkdir(inspectionDirectory, { recursive: true });
await writeFile(
  new URL('norse-contact-sheet.png', inspectionDirectory),
  Buffer.from(result.contactPng, 'base64'),
);
console.log(
  'Imported Ivar and Sigrid. Verified 152 composed frames, 912 runtime layer frames and 152 armor frames in headless Chrome.',
);
