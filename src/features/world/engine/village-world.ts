import type { MapRoomType, MapSnapshot } from '../../../domain/map/snapshot';
import type {
  Point,
  Rect,
  WorldArea,
  WorldDefinition,
  WorldPath,
  WorldPortal,
  WorldTileLayer,
  WorldTileStamp,
} from './types';
import { KENNEY_TINY_TOWN_THEME } from './themes';

const TILE = KENNEY_TINY_TOWN_THEME.worldTileSize;
const WORLD_COLUMNS = 38;
const WORLD_WIDTH = WORLD_COLUMNS * TILE;
const AREA_WIDTH = 13 * TILE;
const LEFT_AREA_X = 2 * TILE;
const RIGHT_AREA_X = 23 * TILE;
const ROAD_LEFT = 17 * TILE;
const ROAD_WIDTH = 4 * TILE;
const TOP_MARGIN = 4 * TILE;
const ROW_GAP = 3 * TILE;
const ACCENTS = ['#9284f7', '#45c5c7', '#d59645', '#83a8f5', '#f17c86', '#64e6ae'];

interface AreaSlot {
  bounds: Rect;
  accent: string;
  side: 'left' | 'right';
  variant: number;
}

type CellSet = Set<string>;

const TREE_TILES = [
  [[3], [15]],
  [[4], [16]],
  [[5], [17]],
];

const GROVE_PATTERNS: Array<Array<[number, number]>> = [
  [
    [0.01, 0.18], [0.08, 0.66], [0.18, 0.86], [0.46, 0.08], [0.86, 0.12], [0.92, 0.68],
  ],
  [
    [0.03, 0.22], [0.12, 0.82], [0.34, 0.08], [0.62, 0.88], [0.88, 0.18], [0.94, 0.56],
  ],
  [
    [0.01, 0.42], [0.1, 0.12], [0.26, 0.86], [0.54, 0.09], [0.84, 0.84], [0.93, 0.3],
  ],
  [
    [0.02, 0.72], [0.16, 0.16], [0.42, 0.08], [0.7, 0.16], [0.9, 0.34], [0.82, 0.82],
  ],
  [
    [0.03, 0.22], [0.09, 0.7], [0.3, 0.88], [0.62, 0.1], [0.88, 0.28], [0.92, 0.76],
  ],
];

const ROOM_PATTERNS: Array<Array<[number, number]>> = [
  [[0.29, 0.56], [0.72, 0.54], [0.51, 0.88], [0.16, 0.84]],
  [[0.26, 0.54], [0.68, 0.58], [0.47, 0.88], [0.84, 0.84]],
  [[0.24, 0.55], [0.67, 0.66], [0.46, 0.88], [0.82, 0.54]],
  [[0.28, 0.54], [0.72, 0.52], [0.5, 0.87], [0.18, 0.82]],
  [[0.42, 0.55], [0.76, 0.78], [0.22, 0.86], [0.75, 0.52]],
];

function areaHeight(roomCount: number): number {
  const extraRows = Math.max(0, Math.ceil(roomCount / 2) - 2);
  return 11 * TILE + extraRows * 5 * TILE;
}

function createAreaSlots(snapshot: MapSnapshot): { slots: AreaSlot[]; height: number } {
  const slots: AreaSlot[] = [];
  let y = TOP_MARGIN;

  for (let index = 0; index < snapshot.areas.length; index += 2) {
    const leftArea = snapshot.areas[index];
    const rightArea = snapshot.areas[index + 1];
    const leftHeight = areaHeight(leftArea?.rooms.length ?? 0);
    const rightHeight = areaHeight(rightArea?.rooms.length ?? 0);
    const rowHeight = Math.max(leftHeight, rightHeight);

    if (leftArea) {
      const isFinalSoloArea = !rightArea && index > 0;
      slots.push({
        bounds: {
          x: isFinalSoloArea ? 4 * TILE : LEFT_AREA_X,
          y,
          width: AREA_WIDTH,
          height: leftHeight,
        },
        accent: ACCENTS[index % ACCENTS.length] ?? ACCENTS[0] ?? '#9284f7',
        side: 'left',
        variant: index % GROVE_PATTERNS.length,
      });
    }

    if (rightArea) {
      slots.push({
        bounds: { x: RIGHT_AREA_X, y, width: AREA_WIDTH, height: rightHeight },
        accent: ACCENTS[(index + 1) % ACCENTS.length] ?? ACCENTS[0] ?? '#9284f7',
        side: 'right',
        variant: (index + 1) % GROVE_PATTERNS.length,
      });
    }

    y += rowHeight + ROW_GAP;
  }

  return { slots, height: Math.ceil((y - ROW_GAP + TOP_MARGIN) / TILE) * TILE };
}

function roomPositions(slot: AreaSlot, count: number): Point[] {
  const pattern = ROOM_PATTERNS[slot.variant] ?? ROOM_PATTERNS[0] ?? [];
  return Array.from({ length: count }, (_, index) => {
    const authored = pattern[index];
    if (authored) {
      return {
        x: Math.round(slot.bounds.x + slot.bounds.width * authored[0]),
        y: Math.round(slot.bounds.y + slot.bounds.height * authored[1]),
      };
    }

    const overflow = index - pattern.length;
    return {
      x: slot.bounds.x + (overflow % 2 === 0 ? 0.3 : 0.7) * slot.bounds.width,
      y: slot.bounds.y + 11 * TILE + Math.floor(overflow / 2) * 5 * TILE,
    };
  });
}

function hashKey(value: string): number {
  return [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);
}

function buildingStyleFor(type: MapRoomType, areaIndex: number, roomIndex: number): number {
  switch (type) {
    case 'announcement':
      return 1;
    case 'forum':
      return 2;
    case 'stage':
      return 3;
    case 'media':
    case 'unsupported':
      return 5;
    case 'voice':
      return 4;
    default:
      return (areaIndex + roomIndex) % 2 === 0 ? 0 : 4;
  }
}

function buildAreas(snapshot: MapSnapshot, slots: AreaSlot[]): {
  areas: WorldArea[];
  portals: WorldPortal[];
} {
  const areas: WorldArea[] = [];
  const portals: WorldPortal[] = [];

  snapshot.areas.forEach((area, areaIndex) => {
    const slot = slots[areaIndex];
    if (!slot) return;
    areas.push({
      key: area.key,
      label: area.label,
      accent: slot.accent,
      bounds: slot.bounds,
      roomCount: area.rooms.length,
    });

    const positions = roomPositions(slot, area.rooms.length);
    area.rooms.forEach((room, roomIndex) => {
      const position = positions[roomIndex];
      if (!position) return;
      portals.push({
        ...position,
        key: room.key,
        areaKey: area.key,
        areaLabel: area.label,
        room,
        accent: slot.accent,
        destination: 'room',
        buildingStyle: buildingStyleFor(room.type, areaIndex, roomIndex),
      });
    });
  });

  return { areas, portals };
}

function cellKey(column: number, row: number): string {
  return `${column},${row}`;
}

function readCell(key: string): [number, number] {
  const [column = '0', row = '0'] = key.split(',');
  return [Number(column), Number(row)];
}

function laneCenter(row: number): number {
  if (row < 10) return 19;
  if (row < 22) return 20;
  if (row < 34) return 19;
  return 18;
}

function createDirtPathCells(worldHeight: number, slots: AreaSlot[]): CellSet {
  const cells: CellSet = new Set();
  const worldRows = worldHeight / TILE;

  for (let row = 0; row < worldRows; row += 1) {
    const center = laneCenter(row);
    for (let column = center - 1; column <= center + 1; column += 1) {
      cells.add(cellKey(column, row));
    }

    const previousCenter = laneCenter(Math.max(0, row - 1));
    if (previousCenter !== center) {
      for (let column = Math.min(previousCenter, center) - 1; column <= Math.max(previousCenter, center) + 1; column += 1) {
        cells.add(cellKey(column, row));
      }
    }
  }

  slots.forEach((slot) => {
    const row = Math.round((slot.bounds.y + slot.bounds.height * 0.58) / TILE);
    const center = laneCenter(row);
    for (let plazaRow = row - 1; plazaRow <= row + 1; plazaRow += 1) {
      for (let column = center - 2; column <= center + 2; column += 1) {
        cells.add(cellKey(column, plazaRow));
      }
    }
  });

  return cells;
}

function dirtTileFor(cells: CellSet, column: number, row: number): number {
  const top = cells.has(cellKey(column, row - 1));
  const right = cells.has(cellKey(column + 1, row));
  const bottom = cells.has(cellKey(column, row + 1));
  const left = cells.has(cellKey(column - 1, row));
  if (!top && !left) return 12;
  if (!top && !right) return 14;
  if (!bottom && !left) return 36;
  if (!bottom && !right) return 38;
  if (!top) return 13;
  if (!bottom) return 37;
  if (!left) return 24;
  if (!right) return 26;
  return 25;
}

function buildGroundDetails(areas: WorldArea[], dirtCells: CellSet): WorldTileLayer[] {
  const details: WorldTileLayer[] = [];
  const detailOffsets: Array<[number, number, number]> = [
    [0.08, 0.28, 1], [0.13, 0.31, 2], [0.18, 0.27, 1],
    [0.78, 0.18, 2], [0.84, 0.22, 1], [0.88, 0.18, 1],
    [0.12, 0.76, 2], [0.17, 0.8, 1], [0.72, 0.78, 1], [0.77, 0.82, 2],
  ];

  areas.forEach((area, areaIndex) => {
    detailOffsets.forEach(([offsetX, offsetY, tileIndex], detailIndex) => {
      const column = Math.floor((area.bounds.x + area.bounds.width * offsetX) / TILE);
      const row = Math.floor((area.bounds.y + area.bounds.height * offsetY) / TILE);
      if (dirtCells.has(cellKey(column, row))) return;
      details.push({
        id: `grass-detail-${areaIndex}-${detailIndex}`,
        bounds: { x: column * TILE, y: row * TILE, width: TILE, height: TILE },
        tileIndex,
      });
    });
  });

  return details;
}

function buildStonePaths(portals: WorldPortal[], dirtCells: CellSet): WorldTileLayer[] {
  const stoneCells: CellSet = new Set();

  portals.forEach((portal) => {
    const startColumn = Math.floor(portal.x / TILE);
    const startRow = Math.floor((portal.y + TILE * 0.35) / TILE);
    const isLeft = portal.x < WORLD_WIDTH / 2;
    const roadEdge = laneCenter(startRow) + (isLeft ? -2 : 2);
    const bend = hashKey(portal.key) % 2 === 0 ? 1 : -1;
    const pathRow = startRow + bend;

    stoneCells.add(cellKey(startColumn, startRow));
    stoneCells.add(cellKey(startColumn, pathRow));
    const first = Math.min(startColumn, roadEdge);
    const last = Math.max(startColumn, roadEdge);
    for (let column = first; column <= last; column += 1) {
      const key = cellKey(column, pathRow);
      if (!dirtCells.has(key)) stoneCells.add(key);
    }
  });

  return [...stoneCells].map((key, index) => {
    const [column, row] = readCell(key);
    return {
      id: `stone-path-${index}`,
      bounds: { x: column * TILE, y: row * TILE, width: TILE, height: TILE },
      tileIndex: 43,
    };
  });
}

function buildTileLayers(
  worldHeight: number,
  areas: WorldArea[],
  slots: AreaSlot[],
  portals: WorldPortal[],
): WorldTileLayer[] {
  const dirtCells = createDirtPathCells(worldHeight, slots);
  const dirt = [...dirtCells].map((key, index) => {
    const [column, row] = readCell(key);
    return {
      id: `village-lane-${index}`,
      bounds: { x: column * TILE, y: row * TILE, width: TILE, height: TILE },
      tileIndex: dirtTileFor(dirtCells, column, row),
    };
  });
  return [
    ...buildGroundDetails(areas, dirtCells),
    ...dirt,
    ...buildStonePaths(portals, dirtCells),
  ];
}

function stamp(
  id: string,
  x: number,
  y: number,
  tiles: Array<Array<number | null>>,
  options: Pick<WorldTileStamp, 'hitbox' | 'layer' | 'solid' | 'sortY'> = {},
): WorldTileStamp {
  return { id, x: Math.round(x), y: Math.round(y), tiles, tileSize: TILE, ...options };
}

function stampBounds(item: WorldTileStamp): Rect {
  return {
    x: item.x,
    y: item.y,
    width: Math.max(0, ...item.tiles.map((row) => row.length)) * item.tileSize,
    height: item.tiles.length * item.tileSize,
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function inflate(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function buildingBounds(portal: WorldPortal): Rect {
  const styles = KENNEY_TINY_TOWN_THEME.exterior?.buildings ?? [];
  const style = styles[(portal.buildingStyle ?? 0) % Math.max(1, styles.length)];
  const columns = Math.max(0, ...(style?.tiles.map((row) => row.length) ?? [3]));
  const rows = style?.tiles.length ?? 4;
  const doorColumn = style?.doorColumn ?? 1;
  return {
    x: portal.x - (doorColumn + 0.5) * TILE,
    y: portal.y - rows * TILE,
    width: columns * TILE,
    height: rows * TILE,
  };
}

function addTree(
  stamps: WorldTileStamp[],
  blockers: Rect[],
  id: string,
  x: number,
  y: number,
  variant: number,
  force = false,
): void {
  const tree = stamp(id, x, y, TREE_TILES[variant % TREE_TILES.length] ?? TREE_TILES[0] ?? [[4], [16]], {
    solid: true,
    hitbox: { x: 15, y: 69, width: 18, height: 25 },
  });
  if (force || !blockers.some((blocker) => intersects(stampBounds(tree), inflate(blocker, 20)))) {
    stamps.push(tree);
  }
}

function buildBorderForest(worldHeight: number, blockers: Rect[]): WorldTileStamp[] {
  const stamps: WorldTileStamp[] = [];
  const gapStart = ROAD_LEFT - TILE;
  const gapEnd = ROAD_LEFT + ROAD_WIDTH + TILE;

  for (let column = 0; column < WORLD_COLUMNS; column += 1) {
    const x = column * TILE + (column % 2 === 0 ? -8 : 10);
    if (x < gapStart || x > gapEnd) {
      addTree(stamps, blockers, `north-tree-${column}`, x, column % 3 === 0 ? -18 : 2, column, true);
      if (column % 4 === 1) addTree(stamps, blockers, `north-tree-deep-${column}`, x + 28, 42, column + 1, true);
    }
    if (column % 2 === 0) {
      addTree(
        stamps,
        blockers,
        `south-tree-${column}`,
        x,
        worldHeight - (column % 4 === 0 ? 98 : 82),
        column + 2,
        true,
      );
    }
  }

  const sideRows = Math.floor(worldHeight / TILE);
  for (let row = 2; row < sideRows - 2; row += 2) {
    addTree(stamps, blockers, `west-tree-${row}`, row % 4 === 0 ? -12 : 22, row * TILE, row, true);
    addTree(stamps, blockers, `east-tree-${row}`, WORLD_WIDTH - (row % 3 === 0 ? 72 : 46), row * TILE - 18, row + 1, true);
  }

  return stamps;
}

function buildAreaScenery(
  areas: WorldArea[],
  slots: AreaSlot[],
  portals: WorldPortal[],
  pathBlockers: Rect[],
): WorldTileStamp[] {
  const stamps: WorldTileStamp[] = [];
  const buildingBlockers = [...portals.map(buildingBounds), ...pathBlockers];

  areas.forEach((area, areaIndex) => {
    const slot = slots[areaIndex];
    if (!slot) return;
    const sceneryBlockers = [
      ...buildingBlockers,
      { x: area.bounds.x + 8, y: area.bounds.y + 6, width: 370, height: 68 },
    ];
    const pattern = GROVE_PATTERNS[slot.variant] ?? GROVE_PATTERNS[0] ?? [];
    pattern.forEach(([offsetX, offsetY], treeIndex) => {
      addTree(
        stamps,
        sceneryBlockers,
        `district-tree-${area.key}-${treeIndex}`,
        area.bounds.x + area.bounds.width * offsetX,
        area.bounds.y + area.bounds.height * offsetY,
        areaIndex + treeIndex,
      );
    });

    const signX = slot.side === 'left' ? area.bounds.x + area.bounds.width - 72 : area.bounds.x + 24;
    stamps.push(stamp(`district-sign-${area.key}`, signX, area.bounds.y + 74, [[83]], { solid: false }));

    switch (areaIndex % 5) {
      case 0:
        stamps.push(
          stamp(`district-fence-${area.key}`, area.bounds.x + 58, area.bounds.y + area.bounds.height - 62, [[80, 81, 81, 82]]),
          stamp(`district-mailbox-${area.key}`, area.bounds.x + area.bounds.width - 132, area.bounds.y + area.bounds.height * 0.72, [[128]]),
        );
        break;
      case 1:
        stamps.push(
          stamp(`district-log-${area.key}`, area.bounds.x + area.bounds.width * 0.1, area.bounds.y + area.bounds.height * 0.68, [[106]]),
          stamp(`district-target-${area.key}`, area.bounds.x + area.bounds.width * 0.82, area.bounds.y + area.bounds.height * 0.7, [[95]]),
          stamp(`district-crate-${area.key}`, area.bounds.x + area.bounds.width * 0.12, area.bounds.y + area.bounds.height * 0.82, [[130]]),
        );
        break;
      case 2:
        stamps.push(
          stamp(`district-fence-${area.key}`, area.bounds.x + 248, area.bounds.y + area.bounds.height - 62, [[80, 81, 81, 82]]),
          stamp(`district-hay-${area.key}`, area.bounds.x + 68, area.bounds.y + area.bounds.height * 0.72, [[94]]),
          stamp(`district-well-${area.key}`, area.bounds.x + area.bounds.width - 112, area.bounds.y + area.bounds.height * 0.78, [[104]], {
            solid: true,
            hitbox: { x: 8, y: 24, width: 32, height: 22 },
          }),
        );
        break;
      case 4:
        stamps.push(
          stamp(`district-chest-${area.key}`, area.bounds.x + area.bounds.width * 0.72, area.bounds.y + area.bounds.height * 0.72, [[131]]),
          stamp(`district-stump-${area.key}`, area.bounds.x + area.bounds.width * 0.2, area.bounds.y + area.bounds.height * 0.78, [[92]]),
          stamp(`district-mushroom-${area.key}`, area.bounds.x + area.bounds.width * 0.27, area.bounds.y + area.bounds.height * 0.82, [[29]]),
        );
        break;
      default:
        break;
    }

    if (area.roomCount === 0) {
      const quietGrove: Array<[number, number]> = [
        [0.2, 0.35], [0.31, 0.22], [0.43, 0.29], [0.55, 0.2], [0.7, 0.32],
        [0.76, 0.5], [0.67, 0.66], [0.51, 0.72], [0.34, 0.68], [0.2, 0.57],
      ];
      quietGrove.forEach(([offsetX, offsetY], groveIndex) => {
        addTree(
          stamps,
          sceneryBlockers,
          `quiet-grove-${area.key}-${groveIndex}`,
          area.bounds.x + area.bounds.width * offsetX,
          area.bounds.y + area.bounds.height * offsetY,
          groveIndex + areaIndex,
        );
      });
      stamps.push(
        stamp(`quiet-well-${area.key}`, area.bounds.x + area.bounds.width * 0.46, area.bounds.y + area.bounds.height * 0.48, [[104]], { solid: true, hitbox: { x: 8, y: 24, width: 32, height: 22 } }),
        stamp(`quiet-mushroom-${area.key}`, area.bounds.x + area.bounds.width * 0.59, area.bounds.y + area.bounds.height * 0.58, [[29]], { solid: false }),
      );
    }
  });

  return stamps;
}

function buildVillageProps(
  worldHeight: number,
  areas: WorldArea[],
  slots: AreaSlot[],
  portals: WorldPortal[],
  tileLayers: WorldTileLayer[],
): WorldTileStamp[] {
  const buildingBlockers = portals.map(buildingBounds);
  const pathBlockers = tileLayers
    .filter((layer) => layer.tileIndex !== 1 && layer.tileIndex !== 2)
    .map((layer) => layer.bounds);
  const stamps = [
    ...buildBorderForest(worldHeight, buildingBlockers),
    ...buildAreaScenery(areas, slots, portals, pathBlockers),
  ];

  const crossingRows = [
    ...new Set(slots.map((slot) => Math.round((slot.bounds.y + slot.bounds.height * 0.58) / TILE))),
  ];
  crossingRows.forEach((row, index) => {
    const center = laneCenter(row);
    const side = index % 2 === 0 ? -1 : 1;
    stamps.push(
      stamp(`crossing-well-${index}`, (center + side * 3) * TILE, row * TILE - 24, [[104]], {
        solid: true,
        hitbox: { x: 8, y: 24, width: 32, height: 22 },
      }),
      stamp(`crossing-sign-${index}`, (center - side * 3) * TILE, row * TILE, [[83]], { solid: false }),
    );
  });

  return stamps;
}

function colliderForStamp(item: WorldTileStamp): Rect | null {
  if (!item.solid) return null;
  const bounds = stampBounds(item);
  return {
    x: item.x + (item.hitbox?.x ?? 0),
    y: item.y + (item.hitbox?.y ?? 0),
    width: item.hitbox?.width ?? bounds.width,
    height: item.hitbox?.height ?? bounds.height,
  };
}

function colliderForPortal(portal: WorldPortal): Rect {
  const bounds = buildingBounds(portal);
  return {
    x: bounds.x + 5,
    y: bounds.y + 5,
    width: bounds.width - 10,
    height: bounds.height - 29,
  };
}

export function createVillageWorld(snapshot: MapSnapshot): WorldDefinition {
  const layout = createAreaSlots(snapshot);
  const { areas, portals } = buildAreas(snapshot, layout.slots);
  const tileLayers = buildTileLayers(layout.height, areas, layout.slots, portals);
  const tileStamps = buildVillageProps(layout.height, areas, layout.slots, portals, tileLayers);
  const paths: WorldPath[] = [
    {
      id: 'village-lane',
      bounds: { x: ROAD_LEFT - TILE, y: 0, width: ROAD_WIDTH + TILE * 2, height: layout.height },
    },
  ];
  const stampColliders = tileStamps
    .map(colliderForStamp)
    .filter((collider): collider is Rect => collider !== null);

  return {
    name: snapshot.server.displayName,
    environment: 'exterior',
    theme: KENNEY_TINY_TOWN_THEME,
    bounds: { x: 0, y: 0, width: WORLD_WIDTH, height: layout.height },
    spawn: { x: ROAD_LEFT + ROAD_WIDTH / 2 + TILE / 2, y: TILE * 2 },
    areas,
    paths,
    tileLayers,
    tileStamps,
    portals,
    props: [],
    colliders: [
      ...stampColliders,
      ...portals.map(colliderForPortal),
    ],
  };
}
