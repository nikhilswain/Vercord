import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { chromium } from '@playwright/test';
import { format } from 'prettier';
import {
  RPG_CHARACTER_DEFINITIONS,
  RPG_CHARACTER_LAYERS,
} from '../src/domain/world/catalog/characters.ts';

/* global fetch, Image, document, AbortSignal */

// Run after import-rpg-wardrobe.mjs. Only authored slash and thrust pose frames are extracted.
// Canvas restores the existing artists' palettes and composes Ivar's armor.
const revision = '675e21e04aaff8486a3a24e09573b3d5af9d28b9';
const upstream = `https://raw.githubusercontent.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator/${revision}/`;
const destination = new URL('../public/game-assets/lpc-characters/', import.meta.url);
const weaponDestination = new URL('../public/game-assets/lpc-weapons/', import.meta.url);
const styles = {
  slash: { row: 12, frames: 6, frameMs: 90, durationMs: 540, releaseMs: 270 },
  thrust: { row: 4, frames: 8, frameMs: 80, durationMs: 640, releaseMs: 320 },
};
const inspection = new URL('../.superpowers/lpc-melee/', import.meta.url);
const sourceUrl = (path) => upstream + path.split('/').map(encodeURIComponent).join('/');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const imageData = (data) => `data:image/png;base64,${data.toString('base64')}`;
const originalManifest = JSON.parse(await readFile(new URL('manifest.json', destination), 'utf8'));
const wardrobeManifest = JSON.parse(
  await readFile(new URL('wardrobe-manifest.json', destination), 'utf8'),
);
const originals = [...originalManifest.assets, ...wardrobeManifest.assets];
const downloads = new Map();
const sourceRecords = [];
const csvResponse = await fetch(sourceUrl('CREDITS.csv'));
if (!csvResponse.ok) throw new Error('Cannot read pinned upstream credits.');
const credits = await csvResponse.text();
// CSV declarations contain quoted newlines and a few unescaped notes columns.
function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if (character === '\n' && !quoted) {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
const creditRows = parseCsv(credits);
function creditFor(path) {
  const key = path.replace(/^spritesheets\//, '').replace(/\.png$/, '');
  const cells = creditRows
    .filter((row) => key === row[0] || key.startsWith(row[0] + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (!cells) throw new Error('No credit declaration: ' + path);
  const licenseIndex = cells.findIndex((cell) => /OGA-BY 3\.0|CC0|CC-BY-SA 3\.0/.test(cell));
  const offered = cells[licenseIndex] ?? '';
  const license = offered.includes('OGA-BY 3.0')
    ? 'OGA-BY-3.0'
    : offered.includes('CC0')
      ? 'CC0-1.0'
      : offered.includes('CC-BY-SA 3.0')
        ? 'CC-BY-SA-3.0'
        : null;
  if (!license) throw new Error('Unsupported source declaration: ' + cells);
  return {
    declaration: cells,
    authors: cells[licenseIndex - 1]
      .replaceAll('\n', ' ')
      .split(',')
      .map((name) => name.trim()),
    license,
  };
}
async function download(path) {
  if (!downloads.has(path))
    downloads.set(
      path,
      (async () => {
        const response = await fetch(sourceUrl(path));
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        const data = Buffer.from(await response.arrayBuffer());
        if (
          data.subarray(1, 4).toString() !== 'PNG' ||
          ![832, 1152].includes(data.readUInt32BE(16)) ||
          data.readUInt32BE(20) < 768
        )
          throw new Error(`Unexpected universal sheet: ${path}`);
        const credit = creditFor(path);
        sourceRecords.push({
          path,
          source: sourceUrl(path),
          revision,
          sha256: hash(data),
          bytes: data.length,
          width: data.readUInt32BE(16),
          height: data.readUInt32BE(20),
          ...credit,
          creditDeclaration: sourceUrl('CREDITS.csv'),
        });
        return imageData(data);
      })(),
    );
  return downloads.get(path);
}
const required = new Map();
for (const appearance of RPG_CHARACTER_DEFINITIONS)
  for (const layer of RPG_CHARACTER_LAYERS) {
    const source = appearance.layers[layer].source;
    required.set(`${source}/${layer}`, { source, layer });
  }
const headPaths = {
  m: 'spritesheets/head/heads/human/male_small/light.png',
  f: 'spritesheets/head/heads/human/female_small/light.png',
};
const headEvidence = { m: await download(headPaths.m), f: await download(headPaths.f) };
const jobs = [];
for (const [key, { source, layer }] of required) {
  const localFile = `${key}-idle.png`;
  const original = await readFile(new URL(localFile, destination));
  const entry = {
    key,
    source,
    layer,
    original: imageData(original),
    originalFile: localFile,
    originalHash: hash(original),
    originalCredit: originals.find((item) => item.file === localFile),
  };
  if (!entry.originalCredit) throw new Error(`Unrecorded source ${localFile}`);
  const masculine =
    source === 'rowan' ||
    source === 'skin-m-ivory' ||
    source === 'ivar' ||
    source.startsWith('shirt-m-');
  const bodyType = masculine ? 'teen' : 'female';
  entry.bodyType = masculine ? 'm' : 'f';
  if (layer === 'head' || layer === 'hair') {
    // Each head and hairstyle follows pixel-verified native small-head frame offsets.
    entry.method = 'verified-head-offset';
  } else {
    entry.method = 'authored-melee';
    let path;
    if (layer === 'body') {
      path = `spritesheets/body/bodies/${bodyType}/light.png`;
      entry.paletteReference = imageData(
        await readFile(new URL(`${source}/head-idle.png`, destination)),
      );
      entry.paletteReferenceSource = headEvidence[entry.bodyType];
    } else if (layer === 'shirt') {
      const style =
        source === 'ivar'
          ? 'longsleeve2_vneck'
          : source === 'rowan'
            ? 'longsleeve2'
            : 'longsleeve2_buttoned';
      path = `spritesheets/torso/clothes/longsleeve/${style}/${bodyType}/white.png`;
      if (source === 'ivar') {
        const originalShirt = originalManifest.norseSources.find(
          (item) => item.id === 'ivar-shirt-idle',
        );
        const response = await fetch(originalShirt.source);
        if (!response.ok) throw new Error('Cannot obtain original Ivar wool palette.');
        const data = Buffer.from(await response.arrayBuffer());
        if (hash(data) !== originalShirt.sha256) throw new Error('Ivar source changed.');
        entry.paletteReference = imageData(data);
        entry.paletteReferenceRecord = originalShirt;
        entry.armorPath = 'spritesheets/torso/armour/plate/teen/iron.png';
        entry.armor = await download(entry.armorPath);
      }
    } else
      path = `spritesheets/${layer === 'pants' ? 'legs/pants2' : 'feet/boots2'}/thin/white.png`;
    entry.path = path;
    entry.native = await download(path);
    if (layer !== 'body' && source !== 'ivar') {
      entry.movingReferences = {};
      for (const action of ['walk', 'run'])
        entry.movingReferences[action] = imageData(
          await readFile(new URL(`${key}-${action}.png`, destination)),
        );
    }
  }
  jobs.push(entry);
}
const weaponRecipes = [
  {
    weapon: 'sword',
    style: 'slash',
    size: 192,
    front: 'weapon/sword/longsword/attack_slash/longsword',
    behind: 'weapon/sword/longsword/attack_slash/behind/longsword',
    definition: 'weapon_sword_longsword',
  },
  {
    weapon: 'axe',
    style: 'slash',
    size: 192,
    front: 'weapon/blunt/waraxe/attack_slash/waraxe',
    behind: 'weapon/blunt/waraxe/attack_slash/behind/waraxe',
    definition: 'weapon_blunt_waraxe',
  },
  {
    weapon: 'spear',
    style: 'thrust',
    size: 64,
    front: 'weapon/polearm/spear/foreground/steel',
    behind: 'weapon/polearm/spear/background/steel',
    definition: 'weapon_polearm_spear',
  },
  {
    weapon: 'staff',
    style: 'thrust',
    size: 64,
    front: 'weapon/magic/simple/foreground/simple',
    behind: 'weapon/magic/simple/background/simple',
    definition: 'weapon_magic_simple',
  },
];
for (const weapon of weaponRecipes) {
  weapon.paths = {};
  for (const layer of ['front', 'behind']) {
    weapon.paths[layer] = `spritesheets/${weapon[layer]}.png`;
    weapon[layer] = await download(weapon.paths[layer]);
  }
  // Preserve the upstream layer-order declaration alongside exact source credits.
  const response = await fetch(sourceUrl(`sheet_definitions/${weapon.definition}.json`));
  if (!response.ok) throw new Error(`Cannot obtain ${weapon.definition}`);
  weapon.declaration = await response.json();
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let result;
try {
  const page = await browser.newPage();
  result = await page.evaluate(
    async ({ jobs, headEvidence, appearances, layers, styles, weapons }) => {
      const canvas = (width, height) => {
        const item = document.createElement('canvas');
        item.width = width;
        item.height = height;
        return item;
      };
      const load = async (src) => {
        const item = new Image();
        item.src = src;
        await item.decode();
        return item;
      };
      const encode = (item) => item.toDataURL('image/png').split(',')[1];
      const pixels = (image) => {
        const item = canvas(image.width, image.height);
        item.getContext('2d').drawImage(image, 0, 0);
        return item;
      };
      // These translations are the exact native head movement, including the body's lunge.
      const offsets = {
        slash: [
          [
            [0, 0],
            [-1, 0],
            [-2, 0],
            [1, -1],
            [2, -1],
            [2, -1],
          ],
          [
            [0, 0],
            [-1, 2],
            [-2, 1],
            [-3, 0],
            [-4, 0],
            [-4, 0],
          ],
          [
            [0, 0],
            [0, 2],
            [-1, 1],
            [1, 0],
            [2, 0],
            [2, 0],
          ],
          [
            [0, 0],
            [1, 2],
            [2, 1],
            [3, 0],
            [4, 0],
            [4, 0],
          ],
        ],
        thrust: [
          [
            [0, 0],
            [0, 1],
            [1, 0],
            [1, 0],
            [2, 1],
            [2, 1],
            [2, 1],
            [1, 0],
          ],
          [
            [0, 1],
            [0, 1],
            [0, 1],
            [0, 0],
            [-2, 0],
            [-2, 0],
            [-2, 0],
            [0, 0],
          ],
          [
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
          ],
          [
            [0, 1],
            [0, 1],
            [0, 1],
            [0, 0],
            [2, 0],
            [2, 0],
            [2, 0],
            [0, 0],
          ],
        ],
      };
      for (const [type, src] of Object.entries(headEvidence)) {
        const native = pixels(await load(src)),
          context = native.getContext('2d');
        for (const [style, config] of Object.entries(styles))
          for (let row = 0; row < 4; row++)
            for (let frame = 0; frame < config.frames; frame++) {
              const reference = canvas(64, 64),
                ref = reference.getContext('2d');
              const [x, y] = offsets[style][row][frame];
              ref.drawImage(native, 0, (22 + row) * 64, 64, 64, x, y, 64, 64);
              const a = ref.getImageData(0, 0, 64, 64).data;
              const b = context.getImageData(frame * 64, (config.row + row) * 64, 64, 64).data;
              if (a.some((value, index) => value !== b[index]))
                throw new Error(`Native ${type} head differs at ${style} ${row}/${frame}`);
            }
      }
      const outputs = [],
        sheets = {},
        originals = {},
        validations = {};
      for (const job of jobs) {
        const original = await load(job.original);
        originals[job.key] = original;
        let paletteMap, paletteAgreement, native;
        if (job.method !== 'verified-head-offset') {
          native = await load(job.native);
          const sample = await load(job.paletteReferenceSource ?? job.native);
          const reference = await load(job.paletteReference ?? job.original);
          const a = pixels(reference).getContext('2d').getImageData(0, 0, 192, 256).data;
          const matching = canvas(192, 256),
            mc = matching.getContext('2d');
          for (let row = 0; row < 4; row++)
            for (let frame = 0; frame < 3; frame++)
              mc.drawImage(
                sample,
                [0, 0, 1][frame] * 64,
                (22 + row) * 64,
                64,
                64,
                frame * 64,
                row * 64,
                64,
                64,
              );
          const b = mc.getImageData(0, 0, 192, 256).data,
            votes = {};
          let pairs = 0;
          for (let p = 0; p < a.length; p += 4)
            if (a[p + 3] && b[p + 3]) {
              const from = [...b.slice(p, p + 3)].join(','),
                to = [...a.slice(p, p + 3)].join(',');
              votes[from] ??= {};
              votes[from][to] = (votes[from][to] ?? 0) + 1;
              pairs++;
            }
          const movingVotes = {};
          for (const [action, src] of Object.entries(job.movingReferences ?? {})) {
            const moving = await load(src),
              match = canvas(512, 256),
              matchContext = match.getContext('2d');
            for (let row = 0; row < 4; row++)
              for (let frame = 0; frame < 8; frame++)
                matchContext.drawImage(
                  sample,
                  (frame + (action === 'walk' ? 1 : 0)) * 64,
                  ((action === 'walk' ? 8 : 34) + row) * 64,
                  64,
                  64,
                  frame * 64,
                  row * 64,
                  64,
                  64,
                );
            const movingPixels = pixels(moving).getContext('2d').getImageData(0, 0, 512, 256).data;
            const nativePixels = matchContext.getImageData(0, 0, 512, 256).data;
            for (let p = 0; p < movingPixels.length; p += 4)
              if (movingPixels[p + 3] && nativePixels[p + 3]) {
                const from = [...nativePixels.slice(p, p + 3)].join(','),
                  to = [...movingPixels.slice(p, p + 3)].join(',');
                if (votes[from]) continue;
                movingVotes[from] ??= {};
                movingVotes[from][to] = (movingVotes[from][to] ?? 0) + 1;
              }
          }
          paletteMap = Object.fromEntries(
            Object.entries(votes).map(([from, count]) => [
              from,
              Object.entries(count).sort((a, b) => b[1] - a[1])[0][0],
            ]),
          );
          paletteAgreement =
            Object.values(votes).reduce(
              (sum, count) => sum + Math.max(...Object.values(count)),
              0,
            ) / pairs;
          if (paletteAgreement < 0.94)
            throw new Error(`Palette correspondence too weak: ${job.key} ${paletteAgreement}`);
          for (const [from, count] of Object.entries(movingVotes))
            paletteMap[from] = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
        }
        for (const [style, config] of Object.entries(styles)) {
          const extraShades = {};
          const output = canvas(config.frames * 64, 256),
            context = output.getContext('2d');
          if (job.method === 'verified-head-offset') {
            for (let row = 0; row < 4; row++)
              for (let frame = 0; frame < config.frames; frame++) {
                const [x, y] = offsets[style][row][frame];
                context.drawImage(
                  original,
                  0,
                  row * 64,
                  64,
                  64,
                  frame * 64 + x,
                  row * 64 + y,
                  64,
                  64,
                );
              }
          } else {
            context.drawImage(
              native,
              0,
              config.row * 64,
              config.frames * 64,
              256,
              0,
              0,
              config.frames * 64,
              256,
            );
            const rgba = context.getImageData(0, 0, output.width, 256);
            for (let p = 0; p < rgba.data.length; p += 4)
              if (rgba.data[p + 3]) {
                const from = [...rgba.data.slice(p, p + 3)].join(',');
                // Older thrust additions contain a few shades outside the Revised idle
                // palette. Normalize only those colors to the closest established shade;
                // all output colors remain part of this traveler's original outfit.
                if (!paletteMap[from] && !extraShades[from]) {
                  const color = from.split(',').map(Number);
                  const nearest = Object.keys(paletteMap).sort((a, b) => {
                    const distance = (value) =>
                      value
                        .split(',')
                        .map(Number)
                        .reduce((sum, channel, index) => sum + (channel - color[index]) ** 2, 0);
                    return distance(a) - distance(b);
                  })[0];
                  extraShades[from] = {
                    nearestSourceShade: nearest,
                    originalOutfitShade: paletteMap[nearest],
                  };
                }
                const replacement = paletteMap[from] ?? extraShades[from].originalOutfitShade;
                const color = replacement.split(',').map(Number);
                rgba.data[p] = color[0];
                rgba.data[p + 1] = color[1];
                rgba.data[p + 2] = color[2];
              }
            context.putImageData(rgba, 0, 0);
            if (job.armor)
              context.drawImage(
                await load(job.armor),
                0,
                config.row * 64,
                config.frames * 64,
                256,
                0,
                0,
                config.frames * 64,
                256,
              );
          }
          const frameValidation = [];
          for (let row = 0; row < 4; row++)
            for (let frame = 0; frame < config.frames; frame++) {
              const data = context.getImageData(frame * 64, row * 64, 64, 64).data;
              let count = 0;
              const bounds = [64, 64, 0, 0];
              for (let y = 0; y < 64; y++)
                for (let x = 0; x < 64; x++)
                  if (data[(y * 64 + x) * 4 + 3]) {
                    count++;
                    bounds[0] = Math.min(bounds[0], x);
                    bounds[1] = Math.min(bounds[1], y);
                    bounds[2] = Math.max(bounds[2], x + 1);
                    bounds[3] = Math.max(bounds[3], y + 1);
                  }
              if (!count)
                throw new Error(`Empty authored frame: ${job.key} ${style} ${row}/${frame}`);
              frameValidation.push({ pixels: count, bounds });
            }
          const key = `${job.key}-${style}`;
          validations[key] = { frames: frameValidation, paletteAgreement, paletteMap, extraShades };
          outputs.push({ key: job.key, style, png: encode(output) });
          sheets[key] = output;
        }
      }
      const weaponOutputs = [],
        weaponSheets = {};
      for (const weapon of weapons) {
        const config = styles[weapon.style];
        weaponSheets[weapon.weapon] = {};
        for (const layer of ['behind', 'front']) {
          const native = await load(weapon[layer]),
            output = canvas(config.frames * 192, 768),
            context = output.getContext('2d');
          if (weapon.size === 192) context.drawImage(native, 0, 0);
          else
            for (let row = 0; row < 4; row++)
              for (let frame = 0; frame < config.frames; frame++)
                context.drawImage(
                  native,
                  frame * 64,
                  (config.row + row) * 64,
                  64,
                  64,
                  frame * 192 + 64,
                  row * 192 + 64,
                  64,
                  64,
                );
          weaponSheets[weapon.weapon][layer] = output;
          weaponOutputs.push({ weapon: weapon.weapon, layer, png: encode(output) });
        }
        // Front/back parts may individually be empty; every composed weapon frame must exist.
        for (let row = 0; row < 4; row++)
          for (let frame = 0; frame < config.frames; frame++) {
            const combined = canvas(192, 192),
              ctx = combined.getContext('2d');
            for (const layer of ['behind', 'front'])
              ctx.drawImage(
                weaponSheets[weapon.weapon][layer],
                frame * 192,
                row * 192,
                192,
                192,
                0,
                0,
                192,
                192,
              );
            const data = ctx.getImageData(0, 0, 192, 192).data;
            if (!data.some((value, index) => index % 4 === 3 && value))
              throw new Error(`Empty ${weapon.weapon} ${row}/${frame}`);
          }
      }
      const contacts = [];
      // Each traveler / weapon gets all four directions and all attack frames at 2× zoom.
      for (const appearance of appearances) {
        const contact = canvas(8 * 192, 4 * 4 * 176),
          cc = contact.getContext('2d');
        cc.imageSmoothingEnabled = false;
        cc.fillStyle = '#a7aea1';
        cc.fillRect(0, 0, contact.width, contact.height);
        for (const [weaponIndex, weapon] of weapons.entries()) {
          const config = styles[weapon.style];
          for (let row = 0; row < 4; row++) {
            const y = (weaponIndex * 4 + row) * 176;
            cc.fillStyle = '#192b24';
            cc.font = '14px sans-serif';
            cc.fillText(
              `${appearance.name} · ${weapon.weapon} · ${['up', 'left', 'down', 'right'][row]}`,
              6,
              y + 18,
            );
            for (let frame = 0; frame < config.frames; frame++) {
              const composite = canvas(192, 192),
                ctx = composite.getContext('2d');
              ctx.drawImage(
                weaponSheets[weapon.weapon].behind,
                frame * 192,
                row * 192,
                192,
                192,
                0,
                0,
                192,
                192,
              );
              for (const layer of layers) {
                const { source, tint } = appearance.layers[layer],
                  part = canvas(64, 64),
                  pc = part.getContext('2d');
                pc.drawImage(
                  sheets[`${source}/${layer}-${weapon.style}`],
                  frame * 64,
                  row * 64,
                  64,
                  64,
                  0,
                  0,
                  64,
                  64,
                );
                if (tint !== undefined) {
                  const data = pc.getImageData(0, 0, 64, 64),
                    factors = [
                      ((tint >> 16) & 255) / 255,
                      ((tint >> 8) & 255) / 255,
                      (tint & 255) / 255,
                    ];
                  for (let p = 0; p < data.data.length; p += 4)
                    for (let color = 0; color < 3; color++) data.data[p + color] *= factors[color];
                  pc.putImageData(data, 0, 0);
                }
                ctx.drawImage(part, 64, 64);
              }
              ctx.drawImage(
                weaponSheets[weapon.weapon].front,
                frame * 192,
                row * 192,
                192,
                192,
                0,
                0,
                192,
                192,
              );
              // Crop transparent outer cell margin only; body and authored reach stay unscaled.
              cc.drawImage(composite, 48, 46, 96, 80, frame * 192, y + 20, 192, 160);
            }
          }
        }
        contacts.push({ id: appearance.id, png: encode(contact) });
      }
      return { outputs, weaponOutputs, validations, offsets, contacts };
    },
    {
      jobs,
      headEvidence,
      appearances: RPG_CHARACTER_DEFINITIONS,
      layers: RPG_CHARACTER_LAYERS,
      styles,
      weapons: weaponRecipes,
    },
  );
} finally {
  await browser.close();
}

const assets = [];
for (const output of result.outputs) {
  const job = jobs.find((item) => item.key === output.key),
    data = Buffer.from(output.png, 'base64');
  const file = `${output.key}-${output.style}.png`,
    config = styles[output.style];
  await writeFile(new URL(file, destination), data);
  const sourcePaths = [job.path, job.armorPath].filter(Boolean);
  const nativeSources = sourceRecords.filter((source) => sourcePaths.includes(source.path));
  assets.push({
    file,
    width: config.frames * 64,
    height: 256,
    frameWidth: 64,
    frameHeight: 64,
    framesPerDirection: config.frames,
    directions: ['up', 'left', 'down', 'right'],
    sha256: hash(data),
    bytes: data.length,
    license: nativeSources.some((item) => item.license === 'CC-BY-SA-3.0')
      ? 'CC-BY-SA-3.0'
      : job.originalCredit.license,
    originalFile: job.originalFile,
    originalSha256: job.originalHash,
    originalSource: job.originalCredit,
    ...(job.paletteReferenceRecord ? { paletteReference: job.paletteReferenceRecord } : {}),
    sourcePaths,
    authors: [
      ...new Set([
        ...job.originalCredit.authors,
        ...nativeSources.flatMap((source) => source.authors),
      ]),
    ],
    modifications:
      job.method === 'verified-head-offset'
        ? 'Original head/hair directional idle frame follows exact native small-head positions for every authored attack frame. Each offset verified pixel-for-pixel against both native head sheets. Original hair silhouette preserved.'
        : `Authored ${output.style} rows ${config.row}–${config.row + 3}, columns 0–${config.frames - 1} cropped at 64px. Original layer palette restored by matched idle-color correspondence, with additional existing shades sampled from matching walk/run cells. Legacy colors absent from those reference poses are normalized to the nearest established source shade in the original outfit palette, individually recorded in validation.extraShades.${job.armor ? ' Original iron armor attack frames composited over original V-neck shirt attack frames.' : ''} No painted shapes or fabricated body motion.`,
    validation: result.validations[`${output.key}-${output.style}`],
  });
}
await mkdir(weaponDestination, { recursive: true });
const weaponAssets = [];
for (const output of result.weaponOutputs) {
  const weapon = weaponRecipes.find((item) => item.weapon === output.weapon),
    data = Buffer.from(output.png, 'base64');
  const file = `${output.weapon}-${output.layer}.png`,
    source = sourceRecords.find((item) => item.path === weapon.paths[output.layer]);
  await writeFile(new URL(file, weaponDestination), data);
  weaponAssets.push({
    file,
    weapon: weapon.weapon,
    layer: output.layer,
    style: weapon.style,
    width: styles[weapon.style].frames * 192,
    height: 768,
    frameWidth: 192,
    frameHeight: 192,
    bodyOffset: [64, 64],
    framesPerDirection: styles[weapon.style].frames,
    directions: ['up', 'left', 'down', 'right'],
    sha256: hash(data),
    bytes: data.length,
    source,
    license: source.license,
    authors: source.authors,
    modifications:
      weapon.size === 192
        ? 'Original authored 192px front/back slash frames, unchanged pixels.'
        : 'Authored 64px thrust cells placed at (64,64) in 192px cells; transparent padding only. No scaling, rotation or weapon translation relative to the body.',
    layerDeclaration: sourceUrl(`sheet_definitions/${weapon.definition}.json`),
    layerDefinition: weapon.declaration,
  });
}
assets.sort((a, b) => a.file.localeCompare(b.file));
sourceRecords.sort((a, b) => a.path.localeCompare(b.path));
await writeFile(
  new URL('melee-manifest.json', destination),
  `${JSON.stringify({ title: 'Native LPC melee with preserved traveler appearance', revision, importedAt: '2026-09-12', styles, animationDeclaration: sourceUrl('sources/source_index.html'), headOffsets: result.offsets, notes: 'Authored attack body/clothing frames with original traveler palettes and native head/hair offsets. Weapon parts preserve authored front/behind placement and the same native frame clock.', sources: sourceRecords, assets }, null, 2)}\n`,
);
await writeFile(
  new URL('manifest.json', weaponDestination),
  `${JSON.stringify({ title: 'Native LPC held weapon attack layers', revision, importedAt: '2026-09-12', notes: 'These LPC animated in-world weapon equivalents are distinct from the TrulyMalicious inventory illustrations. Runtime tier tints preserve native silhouettes. Every composed weapon frame is checked for nonempty pixels; front/behind ordering follows the pinned sheet definitions.', assets: weaponAssets }, null, 2)}\n`,
);
await writeFile(
  new URL('upstream-melee-credits.txt', destination),
  `Source CSV: ${sourceUrl('CREDITS.csv')}\n\n${sourceRecords.map((source) => `${source.path}\n${JSON.stringify(source.declaration)}`).join('\n\n')}\n`,
);
await writeFile(
  new URL('CREDITS.txt', weaponDestination),
  `Native LPC held weapon attacks\n\nThese animated weapon layers are distinct from the TrulyMalicious inventory illustrations. Source revision ${revision}. Each imported source, author, license, SHA-256 and modification is recorded in manifest.json.\n\n${weaponAssets.map((asset) => `${asset.file}\nAuthors: ${asset.authors.join(', ')}\nLicense: ${asset.license}\nSource: ${asset.source.source}\nModifications: ${asset.modifications}`).join('\n\n')}\n`,
);
for (const license of ['LICENSE-CC-BY-SA-3.0.txt', 'LICENSE.txt']) {
  const data = await readFile(new URL(license, destination));
  await writeFile(
    new URL(license, weaponDestination),
    data
      .toString('utf8')
      .replace(/[ \t]+$/gm, '')
      .trimEnd() + '\n',
  );
}
const cc0Response = await fetch(
  'https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/CC0-1.0.txt',
  { signal: AbortSignal.timeout(20000) },
);
if (!cc0Response.ok) throw new Error('Cannot obtain CC0 license document.');
await writeFile(
  new URL('LICENSE-CC0-1.0.txt', weaponDestination),
  Buffer.from(await cc0Response.arrayBuffer()),
);
for (const manifest of [
  new URL('melee-manifest.json', destination),
  new URL('manifest.json', weaponDestination),
])
  await writeFile(manifest, await format(await readFile(manifest, 'utf8'), { parser: 'json' }));
await mkdir(inspection, { recursive: true });
for (const contact of result.contacts)
  await writeFile(
    new URL(`${contact.id}-melee.png`, inspection),
    Buffer.from(contact.png, 'base64'),
  );
console.log(
  `Imported ${assets.length} melee layer sheets for ${RPG_CHARACTER_DEFINITIONS.length} travelers and ${weaponAssets.length} authored weapon layers; validated ${jobs.length * 56} nonempty body-layer frames, 112 exact head poses, and 112 composed weapon frames.`,
);
