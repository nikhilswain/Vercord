import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { chromium } from '@playwright/test';
import {
  RPG_CHARACTER_DEFINITIONS,
  RPG_CHARACTER_LAYERS,
} from '../src/domain/world/catalog/characters.ts';

/* global fetch, Image, document, AbortSignal */

// Run after import-rpg-wardrobe.mjs. Only authored pose frames are extracted.
// Canvas restores the existing artists' palettes and composes Ivar's armor.
const revision = '675e21e04aaff8486a3a24e09573b3d5af9d28b9';
const upstream = `https://raw.githubusercontent.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator/${revision}/`;
const destination = new URL('../public/game-assets/lpc-characters/', import.meta.url);
const inspection = new URL('../.superpowers/lpc-casting/', import.meta.url);
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
function csvCells(line) {
  return [...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)].map((match) =>
    (match[1] ?? match[2]).replaceAll('""', '"'),
  );
}
function creditFor(path) {
  const key = path.replace(/^spritesheets\//, '').replace(/\.png$/, '');
  const line = credits
    .split(/\r?\n/)
    .filter((entry) => {
      const first = entry.split(',')[0];
      return key === first || key.startsWith(`${first}/`);
    })
    .sort((a, b) => b.split(',')[0].length - a.split(',')[0].length)[0];
  if (!line) throw new Error(`No credit declaration: ${path}`);
  const cells = csvCells(line);
  // The upstream armor row has unescaped descriptive columns before its authors.
  const licenseIndex = cells.findIndex((cell) => /OGA-BY 3\.0|CC0|CC-BY-SA 3\.0/.test(cell));
  const offered = cells[licenseIndex] ?? '';
  const license = offered.includes('OGA-BY 3.0')
    ? 'OGA-BY-3.0'
    : offered.includes('CC0')
      ? 'CC0-1.0'
      : offered.includes('CC-BY-SA 3.0')
        ? 'CC-BY-SA-3.0'
        : null;
  if (!license) throw new Error(`Unsupported source declaration: ${line}`);
  return { line, authors: cells[licenseIndex - 1].split(',').map((name) => name.trim()), license };
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
          data.readUInt32BE(16) !== 832 ||
          data.readUInt32BE(20) < 1664
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
    // Both original small heads match native spellcast at offsets [0,1,0,1].
    // Keep the original hairstyle (including Ivar's beard) at those exact offsets.
    entry.method = 'verified-head-offset';
  } else {
    entry.method = 'authored-spellcast';
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
  }
  jobs.push(entry);
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let result;
try {
  const page = await browser.newPage();
  result = await page.evaluate(
    async ({ jobs, headEvidence, appearances, layers }) => {
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
      const headOffsets = [0, 1, 0, 1];
      // This is the compatibility gate: no guessed body or head movement.
      for (const [type, src] of Object.entries(headEvidence)) {
        const native = pixels(await load(src)),
          context = native.getContext('2d');
        for (let row = 0; row < 4; row++)
          for (let frame = 0; frame < 7; frame++) {
            const reference = canvas(64, 64),
              ref = reference.getContext('2d');
            ref.drawImage(native, 0, (22 + row) * 64, 64, 64, 0, headOffsets[row], 64, 64);
            const a = ref.getImageData(0, 0, 64, 64).data,
              b = context.getImageData(frame * 64, row * 64, 64, 64).data;
            if (a.some((value, index) => value !== b[index]))
              throw new Error(`Native ${type} head differs at ${row}/${frame}.`);
          }
      }
      const outputs = [],
        sheets = {},
        validations = {};
      for (const job of jobs) {
        const original = await load(job.original),
          output = canvas(448, 256),
          context = output.getContext('2d');
        let paletteMap, paletteAgreement;
        if (job.method === 'verified-head-offset') {
          for (let row = 0; row < 4; row++)
            for (let frame = 0; frame < 7; frame++)
              context.drawImage(
                original,
                0,
                row * 64,
                64,
                64,
                frame * 64,
                row * 64 + headOffsets[row],
                64,
                64,
              );
        } else {
          const native = await load(job.native),
            sample = await load(job.paletteReferenceSource ?? job.native);
          const reference = await load(job.paletteReference ?? job.original);
          const a = pixels(reference).getContext('2d').getImageData(0, 0, 192, 256).data;
          const matching = canvas(192, 256),
            matchContext = matching.getContext('2d');
          for (let row = 0; row < 4; row++)
            for (let frame = 0; frame < 3; frame++)
              matchContext.drawImage(
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
          const b = matchContext.getImageData(0, 0, 192, 256).data,
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
          paletteMap = Object.fromEntries(
            Object.entries(votes).map(([from, count]) => [
              from,
              Object.entries(count).sort((left, right) => right[1] - left[1])[0][0],
            ]),
          );
          const matches = Object.values(votes).reduce(
            (sum, count) => sum + Math.max(...Object.values(count)),
            0,
          );
          paletteAgreement = matches / pairs;
          if (paletteAgreement < 0.94)
            throw new Error(`Palette correspondence too weak: ${job.key} ${paletteAgreement}`);
          context.drawImage(native, 0, 0, 448, 256, 0, 0, 448, 256);
          const rgba = context.getImageData(0, 0, 448, 256);
          for (let p = 0; p < rgba.data.length; p += 4)
            if (rgba.data[p + 3]) {
              const from = [...rgba.data.slice(p, p + 3)].join(','),
                replacement = paletteMap[from];
              if (!replacement) throw new Error(`Unmapped authored shade ${from} in ${job.key}`);
              const color = replacement.split(',').map(Number);
              rgba.data[p] = color[0];
              rgba.data[p + 1] = color[1];
              rgba.data[p + 2] = color[2];
            }
          context.putImageData(rgba, 0, 0);
          if (job.armor) {
            const armor = await load(job.armor);
            context.drawImage(armor, 0, 0, 448, 256, 0, 0, 448, 256);
          }
        }
        const frameValidation = [];
        for (let row = 0; row < 4; row++)
          for (let frame = 0; frame < 7; frame++) {
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
            if (!count) throw new Error(`Empty authored frame: ${job.key} ${row}/${frame}`);
            frameValidation.push({ pixels: count, bounds });
          }
        validations[job.key] = { frames: frameValidation, paletteAgreement, paletteMap };
        outputs.push({ key: job.key, png: encode(output) });
        sheets[job.key] = output;
      }
      const contact = canvas(1050, appearances.length * 286),
        contactContext = contact.getContext('2d');
      contactContext.imageSmoothingEnabled = false;
      contactContext.fillStyle = '#a7aea1';
      contactContext.fillRect(0, 0, contact.width, contact.height);
      for (const [index, appearance] of appearances.entries()) {
        contactContext.fillStyle = '#192b24';
        contactContext.font = '17px sans-serif';
        contactContext.fillText(
          `${appearance.name}: idle | 7 native casting frames (down / right)`,
          10,
          index * 286 + 23,
        );
        for (const [line, row] of [2, 3].entries())
          for (let frame = -1; frame < 7; frame++) {
            const composite = canvas(64, 64),
              ctx = composite.getContext('2d');
            for (const layer of layers) {
              const { source, tint } = appearance.layers[layer],
                key = `${source}/${layer}`;
              const sheet =
                frame < 0 ? await load(jobs.find((job) => job.key === key).original) : sheets[key];
              const part = canvas(64, 64),
                pc = part.getContext('2d');
              pc.drawImage(sheet, Math.max(0, frame) * 64, row * 64, 64, 64, 0, 0, 64, 64);
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
              ctx.drawImage(part, 0, 0);
            }
            contactContext.drawImage(
              composite,
              8 + (frame + 1) * 130,
              index * 286 + 29 + line * 128,
              128,
              128,
            );
          }
      }
      return { outputs, validations, contact: encode(contact), headOffsets };
    },
    { jobs, headEvidence, appearances: RPG_CHARACTER_DEFINITIONS, layers: RPG_CHARACTER_LAYERS },
  );
} finally {
  await browser.close();
}
const assets = [];
for (const output of result.outputs) {
  const job = jobs.find((item) => item.key === output.key),
    data = Buffer.from(output.png, 'base64');
  const file = `${output.key}-cast.png`;
  await writeFile(new URL(file, destination), data);
  const sourcePaths = [job.path, job.armorPath].filter(Boolean);
  const nativeSources = sourceRecords.filter((source) => sourcePaths.includes(source.path));
  assets.push({
    file,
    width: 448,
    height: 256,
    frameWidth: 64,
    frameHeight: 64,
    framesPerDirection: 7,
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
        ? 'Original head/hair front idle frame repeated at exact native small-head offsets: up/down 0px; left/right +1px Y. Native head pose is identical at every one of seven casting frames, verified pixel-for-pixel against the source idle. No altered hair silhouette.'
        : `Authored spellcast rows 0–3, columns 0–6 cropped at 64px. Exact original layer palette restored by matched idle-color correspondence.${job.armor ? ' Original iron armor casting frames composited over original V-neck shirt casting frames.' : ''} No painted shapes or fabricated body motion.`,
    validation: result.validations[output.key],
  });
}
assets.sort((a, b) => a.file.localeCompare(b.file));
sourceRecords.sort((a, b) => a.path.localeCompare(b.path));
const shareAlikeUrl =
  'https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/CC-BY-SA-3.0.txt';
const licenseResponse = await fetch(shareAlikeUrl, { signal: AbortSignal.timeout(20000) });
if (!licenseResponse.ok) throw new Error('Cannot obtain the body animation license.');
const shareAlikeLicense = Buffer.from(await licenseResponse.arrayBuffer());
if (!shareAlikeLicense.toString().includes('Attribution-ShareAlike 3.0'))
  throw new Error('Unexpected license document.');
await writeFile(new URL('LICENSE-CC-BY-SA-3.0.txt', destination), shareAlikeLicense);
await writeFile(
  new URL('casting-manifest.json', destination),
  `${JSON.stringify(
    {
      title: 'Native LPC spellcasting with preserved traveler appearance',
      revision,
      importedAt: '2026-09-12',
      timing: { frameMs: 100, durationMs: 700, releaseMs: 400 },
      animationDeclaration: sourceUrl('sources/source_index.html'),
      licenseDocuments: [
        {
          file: 'LICENSE-CC-BY-SA-3.0.txt',
          source: shareAlikeUrl,
          publisher: 'https://creativecommons.org/licenses/by-sa/3.0/',
          sha256: hash(shareAlikeLicense),
        },
      ],
      notes:
        'Revised LPC has no cast action. Expanded LPC authors supplied seven spellcast poses for compatible thin bodies and revised clothing. Original head and hairstyle frames follow pixel-verified native head offsets. Source and derived-asset licenses are recorded individually.',
      sources: sourceRecords,
      assets,
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  new URL('upstream-casting-credits.txt', destination),
  `Exact source rows from ${sourceUrl('CREDITS.csv')}\n\n${[...new Set(sourceRecords.map((source) => source.line))].join('\n')}\n`,
);
await mkdir(inspection, { recursive: true });
await writeFile(
  new URL('casting-contact-sheet.png', inspection),
  Buffer.from(result.contact, 'base64'),
);
console.log(
  `Imported ${assets.length} compatible casting layers for ${RPG_CHARACTER_DEFINITIONS.length} travelers; verified ${assets.length * 28} nonempty layer frames and 56 exact native head poses.`,
);
