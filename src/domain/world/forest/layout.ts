import { at, block, ground, makeSample, object, signpost } from '../content/v1/builder';
import { addTree } from '../content/v1/prefabs';
import type { Point, Rect } from '../content/v1/types';
import type { WorldScene } from '../document';
import { seededRandom } from '../random';
import { addForestSiteScenery } from './site-scenery';
import {
  FOREST_REGIONS,
  forestAreaName,
  forestNeighbors,
  type ForestDestination,
  type ForestRegionId,
} from './catalog';

export interface ForestPortal extends Point {
  id: string;
  target: ForestDestination;
  /** An authored doorway already has its own scenery; do not draw a waygate over it. */
  doorway?: boolean;
}
export interface ForestSite extends Point {
  id: string;
  name: string;
  description: string;
}
export interface ForestLayout {
  region: ForestRegionId;
  scene: WorldScene;
  portals: ForestPortal[];
  sites: ForestSite[];
  clearings: Point[];
  water: Rect[];
  camp: Point;
}
export const FOREST_WIDTH = 8192;
export const FOREST_HEIGHT = 7168;
const nearBox = (p: Point, box: Rect, margin = 0) =>
  p.x >= box.x - margin &&
  p.x <= box.x + box.width + margin &&
  p.y >= box.y - margin &&
  p.y <= box.y + box.height + margin;

/** Version-pinned landscape shared by rendering and authoritative presence collision checks.
 * Only the region being entered is constructed; the whole forest is never baked into a texture.
 */
export function buildForestLayout(seed: string, region: ForestRegionId): ForestLayout {
  const definition = FOREST_REGIONS[region];
  const random = seededRandom(`${seed}:mosswild-v1:${region}`);
  const sample = makeSample('village', definition.name, definition.subtitle, at(128, 207));
  sample.bounds = { x: 0, y: 0, width: FOREST_WIDTH, height: FOREST_HEIGHT };
  sample.textures = sample.textures.filter((t) =>
    [
      'lpc-terrain',
      'lpc-trees',
      'lpc-flowers',
      'lpc-rocks',
      'rpg-signpost',
      'lpc-stone-floor',
      'lpc-walls',
      'lpc-pillar',
      'lpc-dungeon-details',
    ].includes(t.key),
  );
  sample.terrain = { version: 1, roads: [] };
  sample.textures.push({
    key: 'forest-weathered-stone',
    url: '/game-assets/ruined-temple/flagstone.png',
  });
  const roads = sample.terrain.roads;
  const clearings: Point[] = [];
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++)
      clearings.push(
        at(33 + col * 63 + Math.floor(random() * 12), 29 + row * 52 + Math.floor(random() * 10)),
      );
  const corridor = (a: Point, b: Point, width: number) => {
    roads.push({
      x: Math.min(a.x, b.x) - width / 2,
      y: Math.min(a.y, b.y) - width / 2,
      width: Math.abs(a.x - b.x) + width,
      height: Math.abs(a.y - b.y) + width,
    });
  };
  const connect = (a: Point, b: Point, width = 128) => {
    // Offset bends prevent every path from becoming a straight grid intersection.
    const horizontal = Math.abs(a.x - b.x) > Math.abs(a.y - b.y);
    const middle = horizontal ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
    const p = horizontal ? { x: middle, y: a.y } : { x: a.x, y: middle };
    const q = horizontal ? { x: middle, y: b.y } : { x: b.x, y: middle };
    corridor(a, p, width);
    corridor(p, q, width);
    corridor(q, b, width);
  };
  const order = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, col) => row * 4 + (row % 2 ? 3 - col : col)),
  ).flat();
  for (let i = 1; i < order.length; i++) connect(clearings[order[i - 1]!]!, clearings[order[i]!]!);
  // Secondary loops make several ways through each region, including optional detours.
  for (const [a, b] of [
    [1, 5],
    [6, 10],
    [8, 12],
    [11, 15],
  ] as const)
    connect(clearings[a]!, clearings[b]!, 80);
  for (const p of clearings) roads.push({ x: p.x - 144, y: p.y - 128, width: 288, height: 256 });
  const camp = at(128, 112);
  roads.push({ x: camp.x - 176, y: camp.y - 160, width: 352, height: 320 });
  connect(camp, clearings[6]!);
  connect(camp, clearings[9]!, 96);
  const portals: ForestPortal[] = forestNeighbors(region).map((target) => {
    const [x, y] = definition.grid,
      [tx, ty] = FOREST_REGIONS[target].grid;
    const point = tx < x ? at(9, 112) : tx > x ? at(247, 112) : ty < y ? at(128, 9) : at(128, 215);
    return { ...point, id: `trail-${target}`, target };
  });
  if (region === 'verge') portals.push({ ...at(128, 215), id: 'trail-town', target: 'town' });
  for (const portal of portals) {
    const nearest = [...clearings].sort(
      (a, b) =>
        Math.hypot(a.x - portal.x, a.y - portal.y) - Math.hypot(b.x - portal.x, b.y - portal.y),
    )[0]!;
    connect(portal, nearest, 160);
    roads.push({ x: portal.x - 144, y: portal.y - 144, width: 288, height: 288 });
    signpost(sample, portal.x / 32 + 2, portal.y / 32 - 1.5);
    sample.landmarks.push({
      ...portal,
      name: portal.target === 'town' ? 'Return to town' : forestAreaName(portal.target),
      description: 'Follow this trail into the next region.',
      radius: 82,
      kind: 'portal',
    });
  }
  const entry =
    portals.find((p) => p.target === 'town') ??
    portals.find((p) => p.y > FOREST_HEIGHT / 2) ??
    portals[0]!;
  sample.spawn = { x: entry.x, y: entry.y + 24 };
  // The eight authored discoveries occupy alternating clearings; the others host wildlife.
  const sites: ForestSite[] = definition.sites.map(([name, description], i) => ({
    ...clearings[(i * 7) % clearings.length]!,
    id: `${region}-site-${i}`,
    name,
    description,
  }));
  sample.landmarks.push({
    ...camp,
    id: `${region}-camp`,
    name: 'Trail shelter',
    description: 'A safe clearing. The nearby sign names the paths out of this region.',
    radius: 76,
    kind: 'view',
  });
  for (const site of sites) {
    sample.landmarks.push({ ...site, radius: 68, kind: 'view' });
    signpost(sample, site.x / 32 + 2.4, site.y / 32 - 1);
    addForestSiteScenery(sample, site, seed);
  }
  signpost(sample, camp.x / 32 + 2.5, camp.y / 32 - 1.5);
  for (const dx of [-4, 4]) addTree(sample, camp.x / 32 + dx, camp.y / 32 - 2, false, 'tallOak');
  const water: Rect[] = [];
  const wet = definition.terrain === 'water' || definition.terrain === 'marsh';
  for (let attempt = 0; attempt < 90 && water.length < (wet ? 7 : 2); attempt++) {
    const x = 14 + Math.floor(random() * 216),
      y = 16 + Math.floor(random() * 174);
    const w = wet ? 12 + Math.floor(random() * 10) : 9,
      h = wet ? 10 + Math.floor(random() * 8) : 8;
    const box = { ...at(x, y), width: w * 32, height: h * 32 };
    if (
      roads.some(
        (r) =>
          box.x < r.x + r.width + 96 &&
          box.x + box.width + 96 > r.x &&
          box.y < r.y + r.height + 96 &&
          box.y + box.height + 96 > r.y,
      ) ||
      water.some(
        (r) =>
          box.x < r.x + r.width &&
          box.x + box.width > r.x &&
          box.y < r.y + r.height &&
          box.y + box.height > r.y,
      )
    )
      continue;
    water.push(box);
    sample.colliders.push(box);
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        ground(
          sample,
          'lpc-terrain',
          (dy === 0 ? 10 : dy === h - 1 ? 12 : 11) * 16 + (dx === 0 ? 0 : dx === w - 1 ? 2 : 1),
          x + dx,
          y + dy,
          -60,
        );
  }
  // Irregular stands and small gaps, with no repeated rows. A local bucket budget keeps
  // placement linear and avoids dense overlapping trunks while preserving clear trails.
  const treeCells = new Map<string, Point[]>();
  for (let attempt = 0; attempt < 7500; attempt++) {
    const p = at(3 + random() * 250, 6 + random() * 214);
    if (roads.some((r) => nearBox(p, r, 48)) || water.some((r) => nearBox(p, r, 48))) continue;
    const cx = Math.floor(p.x / 96),
      cy = Math.floor(p.y / 96);
    let crowded = false;
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let y = cy - 1; y <= cy + 1; y++)
        if (treeCells.get(`${x}:${y}`)?.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 58))
          crowded = true;
    if (crowded) continue;
    const key = `${cx}:${cy}`,
      cell = treeCells.get(key) ?? [];
    cell.push(p);
    treeCells.set(key, cell);
    const roll = random();
    const variant =
      definition.terrain === 'ridge' && roll < 0.65
        ? 'pine'
        : roll < 0.25
          ? 'oak'
          : roll < 0.6
            ? 'tallOak'
            : 'oldOak';
    addTree(sample, p.x / 32, p.y / 32, false, variant);
    sample.stamps[sample.stamps.length - 1]!.tint = definition.canopy;
    if (definition.terrain === 'ridge' && roll > 0.94) {
      object(sample, 'lpc-rocks', 'medium', p.x / 32 - 1, p.y / 32, p.y / 32 + 0.5);
      block(sample, p.x / 32 - 0.6, p.y / 32 + 0.2, 1.3, 0.5);
    }
  }
  for (let i = 0; i < 280; i++) {
    const p = at(8 + random() * 240, 8 + random() * 206);
    if (water.some((r) => nearBox(p, r, 32))) continue;
    ground(sample, 'lpc-flowers', i % 40, p.x / 32, p.y / 32, -55);
  }
  // Solid boundaries end the region; travel happens at marked clearings rather than invisible edges.
  sample.colliders.push(
    { x: 0, y: 0, width: FOREST_WIDTH, height: 32 },
    { x: 0, y: FOREST_HEIGHT - 32, width: FOREST_WIDTH, height: 32 },
    { x: 0, y: 0, width: 32, height: FOREST_HEIGHT },
    { x: FOREST_WIDTH - 32, y: 0, width: 32, height: FOREST_HEIGHT },
  );
  // Use the existing outer-approach clearing. Adding this passage does not consume the
  // landscape RNG or move any published tree, road, discovery, or regional waygate.
  if (region === 'rootbound-reach') {
    const approach = sites[0]!;
    const entrance: ForestPortal = {
      id: 'trail-temple',
      target: 'temple',
      x: approach.x,
      y: approach.y + 64,
    };
    portals.push(entrance);
    sample.landmarks = sample.landmarks.filter((p) => p.id !== approach.id);
    sample.landmarks.push({
      ...entrance,
      name: 'Rootbound Temple',
      radius: 82,
      kind: 'portal',
      description:
        'Enter the temple courtyard. Mira waits beyond this arch; a choir echoes from the sanctuary.',
    });
  }
  const scene: WorldScene = {
    ...sample,
    stamps: sample.stamps.map((s, i) => ({ ...s, id: `forest-stamp-${i}` })),
    colliders: sample.colliders.map((s, i) => ({ ...s, id: `forest-collider-${i}` })),
    lights: [],
  };
  return { region, scene, portals, sites, clearings, water, camp };
}

export { townForestEntrance } from './town-entrance';
