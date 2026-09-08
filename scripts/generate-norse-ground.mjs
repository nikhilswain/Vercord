import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

// Original Dmap pixel artwork. This authoring script runs offline, never in the game loop.
const destination = new URL('../public/game-assets/norse/', import.meta.url);
await mkdir(destination, { recursive: true });
const rect = (x, y, w, h, fill) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const path = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>\n`;
const noise = (n) => (Math.imul(n + 31, 1597334677) ^ Math.imul(n + 7, 3812015801)) >>> 0;
const meadow = (variant) => {
  let art = rect(0, 0, 32, 32, '#536650');
  for (let i = 0; i < 35; i++) {
    const n = noise(i + variant * 103);
    const x = n % 30,
      y = (n >>> 8) % 30;
    art += rect(x, y, 2 + (n % 3), 1, ['#4b5e49', '#5b7054', '#627656'][n % 3]);
    if (i % 6 === 0) art += rect(x + 1, y - 1, 1, 2, '#71805b');
  }
  return art;
};
const cobbles = (variant) => {
  let art = rect(0, 0, 32, 32, '#5b5b50');
  for (let row = 0; row < 4; row++) {
    for (let col = -1; col < 4; col++) {
      const n = noise(row * 13 + col + variant * 31);
      const x = col * 11 + (row % 2) * 5,
        y = row * 8;
      const color = ['#83877b', '#919084', '#747d75', '#9b9787'][n % 4];
      art += path(`M${x + 2} ${y}h6v1h2v5h-1v1h-7v-1h-1v-5h1z`, '#434e48');
      art += rect(x + 2, y, 7, 5, color) + rect(x + 3, y, 5, 1, '#acaa96');
      if (n % 3 === 0) art += rect(x + 3, y + 4, 3, 1, '#667068');
    }
  }
  return art;
};
const water = (variant) => {
  let art = rect(0, 0, 32, 32, '#304f59');
  for (let i = 0; i < 7; i++) {
    const n = noise(i + variant * 53);
    const x = n % 26,
      y = (n >>> 8) % 30;
    art += rect(x, y, 3 + (n % 4), 1, i % 2 ? '#385e66' : '#3e6970');
    if (i % 3 === 0) art += rect(x + 2, y + 1, 4, 1, '#284750');
  }
  return art;
};
const tiles = [];
// Frames 0–15: stone lanes, N/E/S/W connectivity bits. Moss breaks up their edges.
for (let mask = 0; mask < 16; mask++) {
  let tile = cobbles(mask % 4);
  for (let p = 0; p < 32; p += 2) {
    const n = noise(p),
      thickness = 2 + (n % 4);
    if (!(mask & 1)) tile += rect(p, 0, 2, thickness, '#536650');
    if (!(mask & 2)) tile += rect(32 - thickness, p, thickness, 2, '#536650');
    if (!(mask & 4)) tile += rect(p, 32 - thickness, 2, thickness, '#536650');
    if (!(mask & 8)) tile += rect(0, p, thickness, 2, '#536650');
  }
  tiles.push(tile);
}
for (let v = 0; v < 4; v++) tiles.push(meadow(v));
for (let v = 0; v < 4; v++) tiles.push(water(v));
// Frames 24–27: transparent rocky shore strips facing north/east/south/west.
let shore = '';
for (let i = 0; i < 8; i++) {
  const y = noise(i) % 4;
  shore += rect(i * 4, y, 4, 4, '#414f49') + rect(i * 4, y, 3, 2, '#8f9583');
  shore += rect(i * 4 + 1, y + 7, 4, 1, '#648385');
}
for (let rotation = 0; rotation < 4; rotation++)
  tiles.push(`<g transform="rotate(${rotation * 90} 16 16)">${shore}</g>`);
let dock = rect(0, 0, 32, 32, '#463c31');
for (let y = 0; y < 32; y += 8) {
  dock += rect(0, y, 32, 6, '#827354') + rect(0, y, 32, 1, '#aa9567');
  dock += rect(4, y + 3, 10, 1, '#6e5c43') + rect(20, y + 2, 8, 1, '#95805b');
  dock += rect(2, y + 2, 1, 1, '#3b3d36') + rect(29, y + 2, 1, 1, '#3b3d36');
}
tiles.push(dock, cobbles(7), meadow(8), water(9));
const atlas = tiles
  .map(
    (tile, i) =>
      `<svg x="${(i % 8) * 32}" y="${Math.floor(i / 8) * 32}" width="32" height="32" overflow="hidden">${tile}</svg>`,
  )
  .join('');
await writeFile(new URL('terrain.svg', destination), svg(256, 128, atlas));

await writeFile(
  new URL('runestone.svg', destination),
  svg(
    48,
    72,
    path('M7 61h35v6H7z', '#334138') +
      path('M11 63V23l4-13 7-5 13 3 5 16v39l-6 5H18z', '#414f50') +
      path('M15 59V23l5-12 9-2 6 4 2 13v32l-6 5H20z', '#818b83') +
      path('M15 24l5-13 9-2 6 4-14 2-4 12v28h-2z', '#a4ad98') +
      path(
        'M21 22h2v13l9-7v3l-9 7v13h-2zM23 22l8 7v3l-8-7zM29 43h2v12h-2zM24 44h2v9h-2z',
        '#c4aa72',
      ) +
      path('M9 59h10v3h13v-3h7v5h-6v3H17v-2H9z', '#526b4d') +
      rect(33, 18, 2, 4, '#687972') +
      rect(16, 48, 2, 3, '#687972'),
  ),
);

await writeFile(
  new URL('hearth.svg', destination),
  svg(
    64,
    48,
    path('M10 27h45v4h5v9H5v-9h5z', '#35433b') +
      path('M9 27h9v-5h30v4h9v16H9z', '#717a70') +
      path('M13 26h8v-3h25v4h9v10H12z', '#a0a08a') +
      path('M16 27h29v4h6v6H14v-6h2z', '#363831') +
      path('M17 33l27-10 3 5-27 10zM18 24l29 11-3 5-29-11z', '#684a32') +
      path('M23 30l3-12 4 4 4-20 5 19 5-5 2 15-6 6H28z', '#b96536') +
      path('M28 30l4-10 3 5 2-13 5 17-5 7h-6z', '#e5a153') +
      path('M33 30l3-10 4 11-3 5z', '#f5d28b') +
      rect(7, 32, 8, 3, '#909a85') +
      rect(47, 37, 9, 3, '#535f57'),
  ),
);

await writeFile(
  new URL('banner.svg', destination),
  svg(
    32,
    96,
    path('M10 87h18v5H10z', '#334039') +
      rect(16, 8, 5, 82, '#4a3d31') +
      rect(16, 9, 2, 78, '#a08454') +
      path('M13 7l5-7 5 7-5 5z', '#a6afa3') +
      path('M3 16h24v40l-6-4-5 9-5-7-8 3z', '#373c39') +
      path('M4 18h21v35l-5-4-5 9-4-7-7 4z', '#844c3b') +
      rect(5, 18, 3, 35, '#a56445') +
      rect(22, 18, 2, 32, '#623f34') +
      path('M14 25h2v19h-2zM9 30h2l8 8v-3h2v7h-2l-8-8v4H9z', '#dac28b') +
      rect(10, 14, 19, 3, '#a08454'),
  ),
);

await writeFile(
  new URL('supplies.svg', destination),
  svg(
    64,
    48,
    path('M3 38h57v6H3z', '#344139') +
      path('M4 16h26v25H4z', '#48392e') +
      rect(6, 18, 22, 21, '#916f4c') +
      path('M7 19h3v18H7zM17 19h2v18h-2zM25 19h2v18h-2zM7 19h20v3H7zM7 35h20v3H7z', '#b18d5b') +
      path('M33 10l5-5h15l6 6v25l-6 5H38l-5-5z', '#4c4236') +
      path('M36 12l3-4h13l4 4v23l-4 3H39l-3-3z', '#947a50') +
      rect(39, 12, 2, 24, '#baa06b') +
      rect(48, 12, 2, 24, '#6d573d') +
      rect(34, 15, 24, 4, '#525a54') +
      rect(34, 29, 24, 4, '#525a54') +
      rect(35, 15, 21, 1, '#899183') +
      rect(35, 29, 21, 1, '#899183'),
  ),
);
