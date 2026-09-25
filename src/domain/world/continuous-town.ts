import { z } from 'zod';
import { at, ground, makeSample, signpost, TILE } from './content/v1/builder';
import { NORSE_TEXTURES } from './content/v1/norse-props';
import { addTree, createPrefab, type SettlementPrefab } from './content/v1/prefabs';
import type { Point, Rect, RpgLandmark } from './content/v1/types';
import { parseWorldDocument, type WorldDocument, type WorldScene } from './document';
import { seededRandom, shuffled } from './random';
import { containsRect, overlaps, WORLD_PLAYER_FEET } from './geometry';
import { getWorldTheme } from './catalog/themes';
import { withTownHall } from './town-hall';

export const MAX_CONTINUOUS_TOWN_HOUSES = 1998;
import {
  blockLinks,
  frontage,
  LaneBuilder,
  CONTINUOUS_TOWN_BLOCK_SIZE,
} from './continuous-town-lanes';
export { CONTINUOUS_TOWN_BLOCK_SIZE } from './continuous-town-lanes';
const MAX_BLOCKS = 256;

export interface ContinuousTownPlot extends Point {
  variant: number;
}
export interface ContinuousTownBlock extends Point {
  id: number;
  categoryKey: string;
  /** First row's road center, in world pixels; subsequent rows are 448px apart. */
  roadY: number;
  plots: ContinuousTownPlot[];
  /** Missing means the original lane layout; newer lanes are persisted append-only. */
  roadStyle?: 2;
  roads?: Rect[];
}
export interface ContinuousTownEntry {
  categoryKey: string;
  channelKey: string;
  landmarkId: string;
  blockId: number;
  plotIndex: number;
}
/** Private saved allocation data. Never include category/channel keys in the public world. */
export interface ContinuousTownLayout {
  version: 1;
  seed: string;
  /** Village scale chosen from guild size at creation; fixed for the life of the town. */
  scale?: number;
  blocks: ContinuousTownBlock[];
  entries: ContinuousTownEntry[];
}

const MIN_TOWN_SCALE = 0.8;
const MAX_TOWN_SCALE = 1.25;
const BASE_BLOCK_SIZE = CONTINUOUS_TOWN_BLOCK_SIZE;

/** Approximate guild size maps to a village scale, not a per-member building count. */
export function villageScale(memberCount: number): number {
  // Unknown size keeps the original village; known sizes scale up or down from it.
  if (!Number.isFinite(memberCount) || memberCount <= 0) return 1;
  if (memberCount < 500) return MIN_TOWN_SCALE;
  if (memberCount < 2_500) return 1;
  if (memberCount < 10_000) return 1.12;
  return MAX_TOWN_SCALE;
}

interface TownGeometry {
  blockSize: number;
  columns: number;
  rows: number;
  blockPlots: number;
  block0Plots: number;
  colPitch: number;
  rowPitch: number;
  startX: number;
  startY: number;
  jitterX: number;
  jitterY: number;
  roadRow: number;
  reserved: (column: number, row: number) => boolean;
  civic: {
    vaultX: number;
    vaultY: number;
    signX: number;
    signY: number;
    rootX: number;
    rootRow: number;
  };
}

/** All village dimensions derive from one scale so a small server is a small, consistent village. */
function townGeometry(scale: number): TownGeometry {
  const clamp = (value: number, min: number) => Math.max(min, value);
  const scaled = (value: number, min = 0) => clamp(Math.round(value * scale), min);
  const columns = 3;
  const rows = 4;
  const colPitch = scaled(18, 12);
  const rowPitch = scaled(14, 12);
  return {
    blockSize: Math.round((BASE_BLOCK_SIZE * scale) / TILE) * TILE,
    columns,
    rows,
    blockPlots: columns * rows,
    block0Plots: columns * rows - 1,
    colPitch,
    rowPitch,
    startX: scaled(6, 4),
    startY: scaled(3, 2),
    // Jitter must keep the same lane corridors as the base grid: two clear tiles between columns
    // and enough room in front of a row for its approach road.
    jitterX: Math.min(scaled(4), colPitch - 12),
    jitterY: Math.min(scaled(3), rowPitch - 11),
    roadRow: scaled(14, 12),
    reserved: (column, row) => column === columns - 1 && row === rows - 1,
    civic: {
      vaultX: scaled(44),
      vaultY: scaled(46),
      signX: scaled(56),
      signY: scaled(53),
      rootX: scaled(49),
      rootRow: scaled(42),
    },
  };
}

function layoutScale(layout: { scale?: number }): number {
  const value = layout.scale ?? 1;
  return value >= MIN_TOWN_SCALE && value <= MAX_TOWN_SCALE ? value : 1;
}
export interface ContinuousTownRequest {
  key: string;
  rooms: Array<{ key: string }>;
}

const key = z.string().min(1).max(128);
const integer = z.number().int().min(0).max(32768);
const layoutSchema = z
  .object({
    version: z.literal(1),
    seed: z.string().min(1).max(256),
    scale: z.number().min(MIN_TOWN_SCALE).max(MAX_TOWN_SCALE).optional(),
    blocks: z
      .array(
        z
          .object({
            id: z
              .number()
              .int()
              .min(0)
              .max(MAX_BLOCKS - 1),
            categoryKey: key,
            x: integer,
            y: integer,
            roadY: integer,
            plots: z
              .array(
                z
                  .object({ x: integer, y: integer, variant: z.number().int().min(0).max(2) })
                  .strict(),
              )
              .min(8)
              .max(12),
            roadStyle: z.literal(2).optional(),
            roads: z
              .array(
                z
                  .object({
                    x: integer,
                    y: integer,
                    width: integer.positive(),
                    height: integer.positive(),
                  })
                  .strict(),
              )
              .min(1)
              .max(256)
              .optional(),
          })
          .strict(),
      )
      .max(MAX_BLOCKS),
    entries: z
      .array(
        z
          .object({
            categoryKey: key,
            channelKey: key,
            landmarkId: z.string().regex(/^house:(0|[1-9][0-9]{0,3})$/),
            blockId: z
              .number()
              .int()
              .min(0)
              .max(MAX_BLOCKS - 1),
            plotIndex: z.number().int().min(0).max(11),
          })
          .strict(),
      )
      .max(MAX_CONTINUOUS_TOWN_HOUSES),
  })
  .strict();

/** Enumerate square shells; every newly allocated cell touches an older cell. */
function blockOrigin(id: number, size: number): Point {
  const shell = Math.floor(Math.sqrt(id));
  const offset = id - shell * shell;
  return offset <= shell
    ? { x: shell * size, y: offset * size }
    : { x: (2 * shell - offset) * size, y: shell * size };
}

/** Validate the saved allocation without repairing it or deriving replacement geometry. */
export function parseContinuousTownLayout(value: unknown): ContinuousTownLayout {
  const layout = layoutSchema.parse(value);
  const geometry = townGeometry(layoutScale(layout));
  const fail = () => {
    throw new Error('Invalid saved continuous town layout');
  };
  for (const [index, block] of layout.blocks.entries()) {
    const origin = blockOrigin(index, geometry.blockSize);
    if (
      block.id !== index ||
      block.x !== origin.x ||
      block.y !== origin.y ||
      ![
        geometry.roadRow * TILE,
        (geometry.roadRow + (block.roadStyle === 2 ? 1 : 0)) * TILE,
      ].includes(block.roadY - block.y) ||
      block.plots.length !== (index === 0 ? geometry.block0Plots : geometry.blockPlots)
    )
      fail();
    if ((block.roadStyle === 2) !== (block.roads !== undefined)) fail();
    for (const road of block.roads ?? []) {
      if (
        !containsRect({ ...block, width: geometry.blockSize, height: geometry.blockSize }, road) ||
        [road.x, road.y, road.width, road.height].some((coordinate) => coordinate % TILE !== 0)
      )
        fail();
    }
    const slots = new Set<string>();
    for (const plot of block.plots) {
      const x = (plot.x - block.x) / TILE - geometry.startX;
      const y = (plot.y - block.y) / TILE - geometry.startY;
      const column = Math.floor(x / geometry.colPitch);
      const row = Math.floor(y / geometry.rowPitch);
      const slot = `${column}:${row}`;
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        column < 0 ||
        column > geometry.columns - 1 ||
        row < 0 ||
        row > geometry.rows - 1 ||
        x % geometry.colPitch > (block.roadStyle === 2 ? geometry.jitterX : 2) ||
        y % geometry.rowPitch > (block.roadStyle === 2 ? geometry.jitterY : 1) ||
        slots.has(slot) ||
        (index === 0 && geometry.reserved(column, row))
      )
        fail();
      slots.add(slot);
    }
  }
  const channels = new Set<string>();
  const occupied = new Set<string>();
  for (const [index, entry] of layout.entries.entries()) {
    const block = layout.blocks[entry.blockId];
    const channel = JSON.stringify([entry.categoryKey, entry.channelKey]);
    const plot = `${entry.blockId}:${entry.plotIndex}`;
    if (
      !block ||
      block.categoryKey !== entry.categoryKey ||
      !block.plots[entry.plotIndex] ||
      entry.landmarkId !== `house:${index}` ||
      channels.has(channel) ||
      occupied.has(plot)
    )
      fail();
    channels.add(channel);
    occupied.add(plot);
  }
  return layout;
}

function createBlock(
  id: number,
  categoryKey: string,
  seed: string,
  scale: number,
): ContinuousTownBlock {
  const geometry = townGeometry(scale);
  const origin = blockOrigin(id, geometry.blockSize);
  const random = seededRandom(`${seed}:continuous-town-v1:block:${id}`);
  const plots: ContinuousTownPlot[] = [];
  const roadY = origin.y + (geometry.roadRow + Math.floor(random() * 2)) * TILE;
  for (let row = 0; row < geometry.rows; row++) {
    for (let column = 0; column < geometry.columns; column++) {
      // The first block's last plot contains the public vault and village sign.
      if (id === 0 && geometry.reserved(column, row)) continue;
      plots.push({
        x:
          origin.x +
          (geometry.startX +
            column * geometry.colPitch +
            Math.floor(random() * (geometry.jitterX + 1))) *
            TILE,
        y:
          origin.y +
          (geometry.startY +
            row * geometry.rowPitch +
            Math.floor(random() * (geometry.jitterY + 1))) *
            TILE,
        variant: Math.floor(random() * 3),
      });
    }
  }
  const block: ContinuousTownBlock = {
    id,
    categoryKey,
    ...origin,
    roadY,
    // Plots stay in row-major order so a category's houses fill the first slots and cluster
    // together instead of scattering across the whole block.
    plots,
    roadStyle: 2,
    roads: [],
  };
  const root =
    id === 0
      ? { x: geometry.civic.rootX * TILE, y: roadY + geometry.civic.rootRow * TILE }
      : frontage(block.plots[0]!);
  block.roads!.push({ x: root.x - TILE, y: root.y - TILE, width: 2 * TILE, height: 2 * TILE });
  return block;
}

/** Add allocations only; existing plots, roads, identities and vacant growth capacity stay fixed. */
export function extendTownLayout(
  previous: ContinuousTownLayout | null,
  requests: ContinuousTownRequest[],
  seed: string,
  memberCount = 0,
): ContinuousTownLayout {
  const layout = previous
    ? parseContinuousTownLayout(previous)
    : parseContinuousTownLayout({
        version: 1,
        seed,
        scale: villageScale(memberCount),
        blocks: [],
        entries: [],
      });
  if (layout.seed !== seed) throw new Error('Saved town seed does not match');
  const scale = layoutScale(layout);
  const previousBlocks = layout.blocks.length;
  const previousEntries = layout.entries.length;
  const groups = z
    .array(z.object({ key, rooms: z.array(z.object({ key })).max(MAX_CONTINUOUS_TOWN_HOUSES) }))
    .max(MAX_BLOCKS)
    .parse(requests);
  const categoryKeys = new Set<string>();
  for (const group of groups) {
    if (
      categoryKeys.has(group.key) ||
      new Set(group.rooms.map((room) => room.key)).size !== group.rooms.length
    )
      throw new Error('Duplicate town request');
    categoryKeys.add(group.key);
  }
  const existing = new Set(
    layout.entries.map((entry) => JSON.stringify([entry.categoryKey, entry.channelKey])),
  );
  const occupied = new Set(layout.entries.map((entry) => `${entry.blockId}:${entry.plotIndex}`));
  const appendBlock = (categoryKey: string) => {
    if (layout.blocks.length >= MAX_BLOCKS)
      throw new Error('Continuous town block capacity reached');
    const block = createBlock(layout.blocks.length, categoryKey, layout.seed, scale);
    layout.blocks.push(block);
    return block;
  };
  const orderedGroups = shuffled(
    [...groups].sort((a, b) => a.key.localeCompare(b.key)),
    seededRandom(`${seed}:continuous-town-v1:categories`),
  );
  for (const group of orderedGroups) {
    let blocks = layout.blocks.filter((block) => block.categoryKey === group.key);
    if (!blocks.length) blocks = [appendBlock(group.key)];
    for (const room of [...group.rooms].sort((a, b) => a.key.localeCompare(b.key))) {
      const identity = JSON.stringify([group.key, room.key]);
      if (existing.has(identity)) continue;
      if (layout.entries.length >= MAX_CONTINUOUS_TOWN_HOUSES)
        throw new Error('Continuous town house capacity reached');
      let block = blocks.find((candidate) =>
        candidate.plots.some((_, index) => !occupied.has(`${candidate.id}:${index}`)),
      );
      if (!block) {
        block = appendBlock(group.key);
        blocks.push(block);
      }
      const plotIndex = block.plots.findIndex((_, index) => !occupied.has(`${block.id}:${index}`));
      layout.entries.push({
        categoryKey: group.key,
        channelKey: room.key,
        landmarkId: `house:${layout.entries.length}`,
        blockId: block.id,
        plotIndex,
      });
      occupied.add(`${block.id}:${plotIndex}`);
      existing.add(identity);
    }
  }
  const geometry = townGeometry(scale);
  const builders = new Map<number, LaneBuilder>();
  const builder = (block: ContinuousTownBlock) => {
    let value = builders.get(block.id);
    if (!value) {
      value = new LaneBuilder(
        block,
        layout.seed,
        geometry.blockSize,
        block.id === 0
          ? { x: geometry.civic.vaultX * TILE, y: geometry.civic.vaultY * TILE }
          : undefined,
      );
      builders.set(block.id, value);
    }
    return value;
  };
  if (previousBlocks === 0 && layout.blocks[0]?.roadStyle === 2) {
    builder(layout.blocks[0]).connect({
      x: geometry.civic.signX * TILE,
      y: layout.blocks[0].roadY + geometry.civic.rootRow * TILE,
    });
  }
  for (const entry of layout.entries.slice(previousEntries)) {
    const block = layout.blocks[entry.blockId]!;
    if (block.roadStyle === 2) builder(block).connect(frontage(block.plots[entry.plotIndex]!));
  }
  const vaultPoint = { x: geometry.civic.vaultX * TILE, y: geometry.civic.vaultY * TILE };
  for (const block of layout.blocks.slice(previousBlocks)) {
    for (const link of blockLinks(block, layout, geometry.blockSize, vaultPoint)) {
      builder(block).connect(link.local);
      if (link.parent.roadStyle === 2) builder(link.parent).connect(link.remote);
    }
  }
  return layout;
}

function placePrefab(
  scene: WorldScene,
  prefabKey: SettlementPrefab,
  origin: Point,
  id: string,
): RpgLandmark {
  const prefab = createPrefab(
    prefabKey,
    getWorldTheme(scene.id).generation.style === 'norse-timber',
  );
  const shift = <T extends Point>(point: T): T => ({
    ...point,
    x: point.x + origin.x,
    y: point.y + origin.y,
  });
  scene.stamps.push(
    ...prefab.scene.stamps.map((stamp, part) => ({
      ...shift(stamp),
      depth: stamp.depth === undefined || stamp.depth < 0 ? stamp.depth : stamp.depth + origin.y,
      id: `overworld:${id}:stamp:${part}`,
    })),
  );
  scene.colliders.push(
    ...prefab.scene.colliders.map((box, part) => ({
      ...shift(box),
      id: `overworld:${id}:collider:${part}`,
    })),
  );
  scene.lights.push(
    ...prefab.scene.lights.map((light, part) => ({
      ...shift(light),
      id: `overworld:${id}:light:${part}`,
    })),
  );
  const landmark = { ...shift(prefab.scene.landmarks[0]!), id };
  if (id.startsWith('house:')) {
    const centers: Partial<Record<SettlementPrefab, number>> = {
      hall: 5,
      brick: 5.5,
      paneled: 5.5,
      longhouse: 5,
      cottage: 4.5,
      smithy: 5,
    };
    landmark.labelAnchor = {
      x: origin.x + centers[prefabKey]! * TILE,
      y: origin.y + (prefabKey === 'paneled' ? 2 : 1) * TILE,
    };
  }
  scene.landmarks.push(landmark);
  return landmark;
}

function addDecorations(scene: WorldScene, seed: string, block: ContinuousTownBlock): void {
  const norse = getWorldTheme(scene.id).generation.style === 'norse-timber';
  for (const [index, plot] of block.plots.entries()) {
    const garden = makeSample(scene.id, 'garden', 'garden', plot);
    const random = seededRandom(`${seed}:continuous-town-v1:garden:${block.id}:${index}`);
    const x = plot.x / TILE;
    const y = plot.y / TILE;
    addTree(garden, x + 12, y + 8, norse, random() < 0.3 ? 'tallOak' : 'oak');
    if (random() < 0.6) addTree(garden, x + 14, y + 5, norse, 'pine');
    // These remain ordinary negative-depth stamps above the compact base terrain.
    for (const offset of [10, 12])
      ground(
        garden,
        'lpc-flowers',
        norse ? 7 : 1 + Math.floor(random() * 4) * 2,
        x + offset,
        y + 9,
        -30,
      );
    scene.stamps.push(
      ...garden.stamps.map((stamp, part) => ({
        ...stamp,
        id: `overworld:garden:${block.id}:${index}:stamp:${part}`,
      })),
    );
    scene.colliders.push(
      ...garden.colliders.map((box, part) => ({
        ...box,
        id: `overworld:garden:${block.id}:${index}:collider:${part}`,
      })),
    );
  }
}

function addWoodland(
  scene: WorldScene,
  layout: ContinuousTownLayout,
  block: ContinuousTownBlock,
): void {
  const geometry = townGeometry(layoutScale(layout));
  const tiles = geometry.blockSize / TILE;
  const norse = getWorldTheme(scene.id).generation.style === 'norse-timber';
  const random = seededRandom(`${layout.seed}:woodland-v2:${block.id}`);
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const nature = makeSample(scene.id, 'woodland', 'woodland', block);
  const plots: Rect[] = layout.entries
    .filter((entry) => entry.blockId === block.id)
    .map((entry) => ({
      ...block.plots[entry.plotIndex]!,
      width: 11 * TILE,
      height: 9 * TILE,
    }));
  if (block.id === 0)
    plots.push({
      ...at(geometry.civic.vaultX, geometry.civic.vaultY),
      width: 14 * TILE,
      height: 9 * TILE,
    });
  const area = { ...block, width: geometry.blockSize, height: geometry.blockSize };
  const roads = scene.terrain!.roads.filter((road) => overlaps(road, area));
  const open = (box: Rect) =>
    containsRect(area, box) &&
    !plots.some((plot) => overlaps(plot, box)) &&
    !roads.some((road) => overlaps(road, box));
  for (let grove = 0; grove < 4; grove++) {
    const center = { x: integer(6, tiles - 7), y: integer(7, tiles - 5) };
    for (let tree = 0; tree < 10; tree++) {
      const x = block.x / TILE + center.x + integer(-5, 5);
      const y = block.y / TILE + center.y + integer(-4, 4);
      const canopy = { x: x * TILE - 48, y: y * TILE - 128, width: 96, height: 144 };
      const trunk = { x: x * TILE - 12, y: y * TILE - 12, width: 24, height: 24 };
      const variant = random() < 0.25 ? 'pine' : random() < 0.3 ? 'tallOak' : 'oak';
      if (!open(canopy) || nature.colliders.some((box) => overlaps(trunk, box))) continue;
      addTree(nature, x, y, norse, variant);
    }
  }
  for (let patch = 0; patch < 10; patch++) {
    const point = {
      x: block.x + integer(3, tiles - 4) * TILE,
      y: block.y + integer(4, tiles - 4) * TILE,
    };
    const flower = 1 + integer(0, 3) * 2;
    const pair = random() < 0.4;
    if (open({ ...point, width: 2 * TILE, height: TILE })) {
      ground(nature, 'lpc-flowers', norse ? 7 : flower, point.x / TILE, point.y / TILE, -30);
      if (pair) ground(nature, 'lpc-flowers', 7, point.x / TILE + 1, point.y / TILE, -30);
    }
  }
  scene.stamps.push(
    ...nature.stamps.map((stamp, index) => ({
      ...stamp,
      id: `overworld:woodland:${block.id}:stamp:${index}`,
    })),
  );
  scene.colliders.push(
    ...nature.colliders.map((box, index) => ({
      ...box,
      id: `overworld:woodland:${block.id}:collider:${index}`,
    })),
  );
}

function blockRoads(block: ContinuousTownBlock, bounds: Rect): Rect[] {
  const size = CONTINUOUS_TOWN_BLOCK_SIZE;
  const left = Math.max(0, block.x - TILE);
  const top = Math.max(0, block.y - TILE);
  const roads: Rect[] = [
    {
      x: block.x + TILE,
      y: top,
      width: 3 * TILE,
      height: Math.min(bounds.height, block.y + size + TILE) - top,
    },
    {
      x: left,
      y: block.y + TILE,
      width: Math.min(bounds.width, block.x + size + TILE) - left,
      height: 3 * TILE,
    },
  ];
  for (let row = 0; row < 4; row++)
    roads.push({
      x: block.x + 2 * TILE,
      y: block.roadY + row * 14 * TILE - TILE,
      width: 59 * TILE,
      height: 3 * TILE,
    });
  return roads;
}

function approach(roads: Rect[], entrance: Point, roadY: number): void {
  const y = Math.floor((entrance.y + WORLD_PLAYER_FEET.offsetY) / TILE) * TILE;
  roads.push({
    x: (Math.floor(entrance.x / TILE) - 1) * TILE,
    y,
    width: 3 * TILE,
    height: roadY + 2 * TILE - y,
  });
}

/** Generate complete anonymous geometry only when its private allocation changes, then save it. */
export function generateContinuousTownDocument(
  base: WorldDocument,
  savedLayout: ContinuousTownLayout,
): WorldDocument {
  const layout = parseContinuousTownLayout(savedLayout);
  const scale = layoutScale(layout);
  const geometry = townGeometry(scale);
  const theme = base.themeId;
  const pack = getWorldTheme(theme);
  const civicBlock = layout.blocks[0] ?? createBlock(0, 'civic', layout.seed, scale);
  const blocks = layout.blocks.length ? layout.blocks : [civicBlock];
  if (!layout.blocks.length)
    new LaneBuilder(civicBlock, layout.seed, geometry.blockSize, {
      x: geometry.civic.vaultX * TILE,
      y: geometry.civic.vaultY * TILE,
    }).connect({
      x: geometry.civic.signX * TILE,
      y: civicBlock.roadY + geometry.civic.rootRow * TILE,
    });
  const bounds = {
    x: 0,
    y: 0,
    width: Math.max(...blocks.map((block) => block.x)) + geometry.blockSize,
    height: Math.max(...blocks.map((block) => block.y)) + geometry.blockSize,
  };
  const sample = makeSample(
    theme,
    pack.name,
    pack.generation.townSubtitle,
    at(geometry.civic.rootX, Math.round(56 * scale)),
  );
  const scene: WorldScene = {
    ...sample,
    bounds,
    stamps: [],
    colliders: [],
    lights: [],
    terrain: { version: 1, roads: [] },
  };
  scene.background = pack.generation.background;
  if (pack.generation.style === 'norse-timber') {
    scene.textures = [...scene.textures, ...NORSE_TEXTURES];
  }
  const roads = scene.terrain!.roads;
  for (const block of blocks) {
    if (block.roadStyle === 2) {
      roads.push(
        ...block.roads!,
        ...blockLinks(block, layout, geometry.blockSize, {
          x: geometry.civic.vaultX * TILE,
          y: geometry.civic.vaultY * TILE,
        }).map((link) => link.bridge),
      );
    } else {
      roads.push(...blockRoads(block, bounds));
      addDecorations(scene, layout.seed, block);
    }
  }
  for (const entry of layout.entries) {
    const block = layout.blocks[entry.blockId]!;
    const plot = block.plots[entry.plotIndex]!;
    const entrance = placePrefab(
      scene,
      pack.generation.housePrefabs[plot.variant]!,
      plot,
      entry.landmarkId,
    );
    const row = Math.floor(((plot.y - block.y) / TILE - geometry.startY) / geometry.rowPitch);
    const roadY =
      block.roadStyle === 2 ? frontage(plot).y : block.roadY + row * geometry.rowPitch * TILE;
    approach(roads, entrance, roadY);
    if (entry === layout.entries[0]) scene.spawn = { x: entrance.x, y: entrance.y + TILE };
  }
  const civicRoadY = civicBlock.roadY + geometry.civic.rootRow * TILE;
  const vault = placePrefab(
    scene,
    'vault',
    at(geometry.civic.vaultX, geometry.civic.vaultY),
    'town-vault',
  );
  approach(roads, vault, civicRoadY);
  const civic = makeSample(
    theme,
    'square',
    'square',
    at(geometry.civic.signX, geometry.civic.signY),
  );
  const sign = signpost(civic, geometry.civic.signX, geometry.civic.signY);
  scene.stamps.push(
    ...civic.stamps.map((stamp, index) => ({ ...stamp, id: `overworld:square:stamp:${index}` })),
  );
  scene.colliders.push(
    ...civic.colliders.map((box, index) => ({ ...box, id: `overworld:square:collider:${index}` })),
  );
  scene.landmarks.push({
    ...sign,
    id: 'town-square',
    name: 'Town square',
    radius: 64,
    kind: 'sign',
    description:
      'The village lanes connect every neighborhood. Stone steps nearby lead into the Lantern Vault.',
  });
  approach(roads, sign, civicRoadY);
  for (const block of blocks) if (block.roadStyle === 2) addWoodland(scene, layout, block);
  if (!layout.entries.length) scene.spawn = { x: vault.x, y: civicRoadY + TILE / 2 };
  // Road rectangles form connected spines and frontages by construction. Parsing checks
  // every solid base and entrance without allocating a flood-fill grid for the whole map.
  return parseWorldDocument(
    withTownHall({
      ...base,
      scenes: { overworld: scene, dungeon: base.scenes.dungeon },
    }),
  );
}
