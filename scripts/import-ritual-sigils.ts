import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'assets/runtime/summoning-circles/source');
const output = resolve(root, 'public/game-assets/ritual-sigils');
mkdirSync(output, { recursive: true });
const provenance = [];
for (const [name, file] of [
  ['sun', 'circle7.svg'],
  ['moon', 'circle4.svg'],
] as const) {
  const original = readFileSync(resolve(source, file), 'utf8');
  // Preserve strokes, circles and white cutouts. Invert the source ink into a luminance mask.
  const paths = original.match(/<(?:path|circle|polygon)\b[\s\S]*?\/>/g);
  if (!paths?.length) throw new Error(`No vector paths in ${file}`);
  const mask = paths
    .map((path) =>
      path
        .replace(/#(?:FFFFFF|000000|050505)/g, (color) => (color === '#FFFFFF' ? '#000' : '#fff'))
        .replace(/stroke-width="4"/g, 'stroke-width="6"'),
    )
    .join('\n');
  writeFileSync(
    resolve(output, `${name}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="-40 -40 1080 1080"><defs><mask id="ink" maskUnits="userSpaceOnUse" x="-40" y="-40" width="1080" height="1080" style="mask-type:luminance"><g fill="#fff">${mask}</g></mask></defs><rect x="-40" y="-40" width="1080" height="1080" fill="#fff" mask="url(#ink)"/></svg>\n`,
  );
  provenance.push({
    name,
    source: file,
    sha256: createHash('sha256').update(original).digest('hex'),
    changes:
      'White mask, 96px raster canvas, padded viewBox, slightly reinforced strokes. Animation and floor projection are authored in game code.',
  });
}
writeFileSync(
  resolve(output, 'provenance.json'),
  JSON.stringify(
    {
      author: 'Luke.RUSTLTD',
      source: 'https://opengameart.org/content/4-summoning-circles',
      download: 'https://opengameart.org/sites/default/files/summoning_circles.zip',
      license: 'CC0-1.0',
      assets: provenance,
    },
    null,
    2,
  ) + '\n',
);
copyFileSync(
  resolve(root, 'public/game-assets/lpc-weapons/LICENSE-CC0-1.0.txt'),
  resolve(output, 'LICENSE-CC0-1.0.txt'),
);
console.log(
  'Imported two CC0 ritual sigils. Run after extracting summoning_circles.zip into assets/runtime/summoning-circles/source.',
);
