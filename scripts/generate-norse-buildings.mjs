import { mkdirSync, writeFileSync } from 'node:fs';
import { log } from 'node:console';
import { fileURLToPath, URL } from 'node:url';

// Original Dmap artwork. Integer-coordinate shapes are authored at their native pixel density.
const output = fileURLToPath(new URL('../public/game-assets/norse/', import.meta.url));
mkdirSync(output, { recursive: true });

const C = {
  outline: '#202727',
  timber: '#6b503a',
  beam: '#3d3329',
  beamLight: '#997551',
  stone: '#5b625d',
  iron: '#717c79',
  light: '#eed197',
  amber: '#cc8d48',
};
const rect = (x, y, w, h, fill, extra = '') =>
  '<rect x="' +
  x +
  '" y="' +
  y +
  '" width="' +
  w +
  '" height="' +
  h +
  '" fill="' +
  fill +
  '" ' +
  extra +
  '/>';
const path = (d, fill, stroke = '', width = 1) =>
  '<path d="' +
  d +
  '" fill="' +
  fill +
  '"' +
  (stroke ? ' stroke="' + stroke + '" stroke-width="' + width + '"' : '') +
  '/>';
const poly = (points, fill, stroke = '', width = 1) =>
  '<polygon points="' +
  points +
  '" fill="' +
  fill +
  '"' +
  (stroke ? ' stroke="' + stroke + '" stroke-width="' + width + '"' : '') +
  '/>';
const group = (body, attrs = '') => '<g ' + attrs + '>' + body + '</g>';
const hash = (x, y) => ((x * 73 + y * 151 + x * y * 19) >>> 0) % 997;

function planks(x, y, w, h) {
  const colors = ['#6b503a', '#73563c', '#604731', '#7c5d40', '#654c36'];
  let result = rect(x, y, w, h, C.timber);
  for (let row = 0; row < Math.ceil(h / 7); row++) {
    const py = y + row * 7;
    const height = Math.min(7, y + h - py);
    result += rect(x, py, w, height, colors[row % colors.length]);
    result += rect(x, py + height - 1, w, 1, '#382e26');
    result += rect(x, py, w, 1, '#8a6748');
    for (let px = x + 8 + ((row * 17) % 29); px < x + w - 4; px += 29) {
      result += rect(px, py + 1, 1, Math.max(1, height - 2), '#4b382a');
      if (height > 3) result += rect(px + 3, py + 3, Math.min(9, x + w - px - 3), 1, '#98704a');
      if (height > 4 && px + 8 < x + w) result += rect(px + 7, py + 4, 3, 1, '#4b382a');
    }
  }
  return result;
}

function beam(x, y, h) {
  return (
    rect(x, y, 7, h, C.beam) +
    rect(x + 1, y, 2, h, C.beamLight) +
    rect(x + 1, y + 8, 5, 4, C.iron) +
    rect(x + 2, y + 9, 1, 1, '#ccd0be') +
    rect(x + 1, y + h - 10, 5, 4, '#565f5c') +
    rect(x + 4, y + h - 9, 1, 1, '#a3aba0')
  );
}

function stoneBase(x, y, w, h = 8) {
  let result = rect(x, y, w, h, '#373f3c');
  for (let px = x + 1; px < x + w - 2; px += 13) {
    const width = Math.min(11, x + w - 1 - px);
    result += rect(px, y + 1, width, h - 2, hash(px, y) % 2 ? '#636b61' : '#707468');
    result += rect(px + 1, y + 1, Math.max(1, width - 2), 1, '#8a8977');
    result += rect(px + 1, y + h - 3, Math.max(1, width - 3), 1, '#4b554e');
  }
  return result;
}

function windowAt(x, y, w = 18, h = 22) {
  return (
    rect(x - 3, y - 3, w + 6, h + 6, C.outline) +
    rect(x - 2, y - 2, w + 4, h + 4, '#a17b51') +
    rect(x, y, w, h, '#855934') +
    rect(x + 1, y + 2, w - 2, h - 4, C.amber) +
    rect(x + 2, y + 5, w - 4, h - 9, C.light) +
    rect(x + 3, y + 6, 3, 5, '#f7e0a2') +
    rect(x + Math.floor(w / 2) - 1, y, 2, h, '#59412e') +
    rect(x, y + Math.floor(h / 2), w, 2, '#59412e') +
    rect(x - 4, y + h + 1, w + 8, 3, '#bea07a') +
    rect(x - 4, y + h + 4, w + 8, 2, '#463b2e')
  );
}

function door(x, baseline, w = 28, h = 42) {
  const y = baseline - h;
  let result =
    rect(x - 4, y - 5, w + 8, h + 5, C.outline) +
    rect(x - 3, y - 3, 3, h + 3, '#987248') +
    rect(x + w, y - 3, 3, h + 3, '#6e5036') +
    rect(x - 3, y - 4, w + 6, 4, '#a27b4d') +
    rect(x, y, w, h - 3, '#40362b');
  for (let px = x + 2; px < x + w - 1; px += 6) {
    result += rect(px, y + 1, 4, h - 5, '#604a32') + rect(px, y + 2, 1, h - 7, '#7a5b3b');
  }
  for (const py of [y + 11, y + 29]) {
    result += rect(x + 1, py, w - 2, 3, '#343e3e') + rect(x + 2, py, w - 4, 1, '#79827b');
    result += rect(x + 3, py + 1, 1, 1, '#b8b5a0') + rect(x + w - 5, py + 1, 1, 1, '#b8b5a0');
  }
  result += rect(x + w - 7, y + 21, 3, 5, '#bb9661') + rect(x + w - 6, y + 22, 1, 3, '#293332');
  return result + rect(x - 3, baseline - 3, w + 6, 3, '#8f8d76');
}

function shield(cx, cy, color = '#8d4936') {
  const rim = '-7,-9 7,-9 7,-7 10,-7 10,7 7,7 7,10 -7,10 -7,7 -10,7 -10,-7 -7,-7';
  const face = '-6,-7 6,-7 6,-5 8,-5 8,5 6,5 6,8 -6,8 -6,5 -8,5 -8,-5 -6,-5';
  return group(
    poly(rim, '#273333') +
      poly(face, color) +
      rect(-1, -7, 2, 15, '#a9a38a') +
      rect(-8, -1, 16, 2, '#a9a38a') +
      rect(-3, -3, 6, 6, '#283432') +
      rect(-2, -2, 4, 4, '#a0a89b') +
      rect(-2, -2, 2, 1, '#d4cfb3'),
    'transform="translate(' + cx + ',' + cy + ')"',
  );
}

function roof(points, x, y, w, h, id, turf = false) {
  const palette = turf
    ? ['#52634a', '#5d6b4d', '#637251', '#465b45', '#71805a']
    : ['#343e40', '#3c4647', '#455051', '#394447', '#4b5453', '#303b3f'];
  let tiles = rect(x, y, w, h, palette[0]);
  for (let row = 0; row < Math.ceil(h / 8); row++) {
    for (let col = -1; col < Math.ceil(w / 12); col++) {
      const px = x + col * 12 + (row % 2) * 6;
      const py = y + row * 8;
      const n = hash(col + 20, row + 3);
      tiles += rect(px, py, 11, 7, palette[n % palette.length]);
      tiles += rect(px, py + 6, 11, 1, turf ? '#384d3c' : '#222d31');
      tiles += rect(px + 1, py, 9, 1, turf ? '#83916b' : '#68716b');
      if (n % 4 === 0) tiles += rect(px + 3, py + 3, 4, 1, turf ? '#92a06c' : '#6d7569');
      if (n % 11 === 0) tiles += rect(px + 7, py + 2, 2, 3, '#56684c');
    }
  }
  return (
    '<defs><clipPath id="' +
    id +
    '">' +
    poly(points, '#fff') +
    '</clipPath></defs>' +
    group(tiles, 'clip-path="url(#' + id + ')"') +
    poly(points, 'none', C.outline, 3)
  );
}

function ridge(x, y, w) {
  let result =
    rect(x, y, w, 7, '#322d26') +
    rect(x + 1, y + 1, w - 2, 2, '#a28255') +
    rect(x + 2, y + 4, w - 4, 1, '#655138');
  for (let px = x + 9; px < x + w - 4; px += 16)
    result += rect(px, y + 1, 3, 5, '#65716c') + rect(px, y + 1, 2, 1, '#aab09d');
  return result;
}

function carvedFinial(x, y, mirror = false) {
  const body = 'M0 25V17H4V11H7V5H10V0H17V3H14V7H18V10H10V16H7V25Z';
  return group(
    path(body, '#3f3328', '#202927', 1) +
      path('M2 23V18H6V12H9V8H11V4H14', 'none', '#ab8958', 2) +
      rect(14, 2, 1, 1, '#f0d698'),
    'transform="translate(' + x + ',' + y + ')' + (mirror ? ' scale(-1,1)' : '') + '"',
  );
}

function longhouse() {
  let s = poly('12,178 244,178 252,183 244,186 12,186 6,182', '#172421', '', 1);
  s += planks(16, 120, 224, 60) + stoneBase(16, 172, 224);
  s += path('M23 131L69 169M66 131L26 167M188 131L230 169M228 131L187 169', 'none', '#352f28', 6);
  s += path('M23 131L69 169M188 131L230 169', 'none', '#99724b', 2);
  s += windowAt(42, 139, 18, 22) + windowAt(195, 139, 18, 22);
  s +=
    door(114, 180) +
    beam(17, 124, 49) +
    beam(80, 125, 47) +
    beam(168, 125, 47) +
    beam(232, 124, 49);
  s += shield(95, 145, '#496057') + shield(159, 145, '#8d4936');
  s += poly('37,35 62,17 194,17 219,35', '#53605a', C.outline, 2);
  s += path('M50 31H207M59 24H198', 'none', '#748074', 1);
  s += roof('4,121 38,35 218,35 252,121', 2, 34, 252, 89, 'longhouse-roof');
  s += path('M6 122L39 36M250 122L217 36', 'none', '#9b7b51', 5);
  s += path('M9 121L41 39M247 121L215 39', 'none', '#3e382d', 2);
  s +=
    rect(3, 122, 250, 6, '#292c28') +
    rect(5, 122, 246, 2, '#a08051') +
    rect(7, 126, 242, 3, '#171f20');
  s += ridge(33, 31, 190) + carvedFinial(28, 10) + carvedFinial(228, 10, true);
  // The small carved lintel marks the main entrance without adding an invented alphabet.
  s += path('M113 134L127 129L141 134M119 135L127 132L135 135', 'none', '#bb965e', 1);
  return s;
}

function cottage() {
  let s = poly('10,146 150,146 156,151 148,154 12,154 5,150', '#172421');
  s += planks(12, 100, 136, 48) + stoneBase(12, 140, 136);
  s += beam(14, 102, 38) + beam(139, 102, 38) + windowAt(106, 109, 19, 22) + door(44, 148);
  s +=
    path('M88 104L88 139M88 112L103 137', 'none', '#3c3329', 5) +
    path('M89 114L102 135', 'none', '#9e784e', 1);
  s += poly('19,33 40,18 120,18 141,33', '#728063', C.outline, 2);
  s += roof('1,101 22,33 138,33 159,101', 0, 32, 160, 72, 'cottage-roof', true);
  s +=
    path('M2 101L23 33M158 101L137 33', 'none', '#6c5a3e', 5) +
    path('M4 100L25 36M156 100L135 36', 'none', '#b49b69', 1);
  s +=
    rect(1, 102, 158, 5, '#38382d') +
    rect(2, 102, 156, 2, '#a8905d') +
    rect(4, 106, 152, 2, '#202a25');
  for (const [px, py] of [
    [18, 91],
    [37, 66],
    [77, 40],
    [120, 92],
    [143, 88],
    [99, 70],
  ]) {
    s += rect(px, py, 2, 5, '#9fa870') + rect(px - 2, py + 2, 6, 1, '#7d9360');
  }
  s += ridge(18, 29, 124) + carvedFinial(14, 8) + carvedFinial(146, 8, true);
  s += shield(29, 121, '#856139');
  return s;
}

function chimney(x, y) {
  let s = rect(x, y, 24, 51, '#333c38');
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 2; col++) {
      s += rect(x + 1 + col * 11, y + row * 7 + 1, 10, 6, (row + col) % 2 ? '#788075' : '#626f65');
      s += rect(x + 2 + col * 11, y + row * 7 + 1, 8, 1, '#a4a28b');
    }
  }
  return (
    s +
    rect(x - 2, y - 2, 28, 6, '#353d38') +
    rect(x - 1, y - 2, 26, 2, '#8c9381') +
    rect(x + 3, y - 1, 18, 2, '#202929')
  );
}

function smithy() {
  let s = poly('13,146 179,146 187,151 176,154 14,154 6,150', '#172421');
  s += planks(16, 96, 160, 52) + stoneBase(16, 140, 160);
  // A recessed, glowing forge is scenery; the solid foundation stays consistent with the collider.
  s += rect(111, 104, 49, 36, '#353b33') + rect(115, 108, 41, 29, '#242b29');
  s += path('M120 134V125H124V118H129V122H133V113H137V122H144V117H147V126H151V134Z', '#bd773e');
  s +=
    path('M125 134V128H131V122H135V127H141V124H145V134Z', '#edc773') +
    rect(119, 134, 34, 3, '#554932');
  s +=
    rect(108, 137, 55, 5, '#90917b') +
    rect(112, 106, 3, 30, '#778170') +
    rect(156, 106, 4, 30, '#596855');
  s += door(43, 148) + beam(17, 101, 39) + beam(88, 101, 39) + beam(168, 101, 39);
  s += roof('4,97 33,35 157,35 188,97', 2, 34, 189, 66, 'smithy-roof');
  s +=
    path('M5 97L33 35M187 97L157 35', 'none', '#9a7650', 5) +
    path('M8 96L34 38M184 96L156 38', 'none', '#3f382c', 2);
  s +=
    rect(4, 98, 184, 6, '#282e2a') +
    rect(5, 98, 182, 2, '#94724a') +
    rect(7, 103, 178, 2, '#1c2424');
  s += ridge(29, 31, 132) + carvedFinial(25, 10) + carvedFinial(166, 10, true) + chimney(130, 17);
  // Hanging smith's sign: a pixel anvil silhouette on an iron bracket.
  s +=
    rect(79, 108, 2, 12, '#999b89') +
    rect(74, 117, 14, 15, '#343d37') +
    rect(75, 118, 12, 13, '#a08155');
  s += path('M77 121H85V124H82V127H84V129H77V127H79V124H76V122Z', '#303e3b');
  return s;
}

function longboat() {
  let s = poly('2,62 13,68 40,73 124,73 147,64 158,53 148,60 120,66 43,66 14,61', '#1d3536');
  s += poly(
    '5,42 20,48 42,55 115,55 139,43 153,30 148,53 126,68 40,71 17,62 7,52',
    '#332f27',
    C.outline,
    2,
  );
  s += poly('12,46 30,52 47,59 115,59 140,46 148,39 143,53 124,64 43,66 23,58', '#997145');
  s += path('M17 52L43 61H119L143 48M21 57L43 65H120L139 55', 'none', '#4c3d2c', 2);
  s += poly('17,45 42,35 113,33 141,40 118,55 47,57', '#473c2b', C.outline, 2);
  s += poly('28,45 45,38 111,36 132,41 115,50 47,52', '#b48c56');
  for (let px = 43; px < 121; px += 13)
    s += path('M' + px + ' 38L' + (px + 1) + ' 53', 'none', '#644b32', 2);
  for (const px of [48, 76, 104])
    s += rect(px, 39, 5, 14, '#423b2c') + rect(px + 1, 39, 2, 14, '#c09861');
  s += rect(79, 10, 4, 40, '#382f25') + rect(80, 11, 1, 37, '#c69c62');
  s += path('M81 11L47 48M81 11L115 46', 'none', '#c3b187', 1);
  // Furled sail leaves the boat readable at gameplay scale.
  s +=
    rect(57, 16, 49, 5, '#382f29') +
    rect(58, 12, 47, 6, '#d0c39c') +
    rect(59, 12, 45, 2, '#eee0b5');
  for (const px of [62, 75, 88, 101]) s += rect(px, 12, 2, 7, '#7e5940');
  for (const [px, color] of [
    [44, '#8d4936'],
    [67, '#536b5b'],
    [92, '#8d4936'],
    [117, '#536b5b'],
  ])
    s += shield(px, 60, color);
  s += path('M7 52V38H4V28H8V20H15V22H20V27H15V31H11V41H15V53Z', '#644b32', C.outline, 1);
  s += path('M10 47V34H8V29H11V24H16', 'none', '#bd955d', 2) + rect(14, 24, 2, 2, '#eee2b6');
  s += path(
    'M143 49V36H147V27H150V20H156V22H159V27H153V33H151V43H148V50Z',
    '#644b32',
    C.outline,
    1,
  );
  s += path('M146 46V36H150V29H153V24H156', 'none', '#bd955d', 2);
  return s;
}

for (const [name, width, height, draw] of [
  ['longhouse', 256, 192, longhouse],
  ['cottage', 160, 160, cottage],
  ['smithy', 192, 160, smithy],
  ['longboat', 160, 80, longboat],
]) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    width +
    '" height="' +
    height +
    '" viewBox="0 0 ' +
    width +
    ' ' +
    height +
    '" shape-rendering="crispEdges"><title>Frosthavn ' +
    name +
    '</title>' +
    draw() +
    '</svg>\n';
  writeFileSync(output + '/' + name + '.svg', svg);
  log(name + '.svg (' + width + '×' + height + ')');
}
