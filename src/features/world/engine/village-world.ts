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
const EDGE_MARGIN = 2 * TILE;
const STREET_WIDTH = 3 * TILE;
const AREA_GAP = 2 * TILE;
const AREA_HEADER_HEIGHT = 2 * TILE;
const AREA_PADDING_X = TILE;
const ROOM_CELL_WIDTH = 5 * TILE;
const ROOM_CELL_HEIGHT = 6 * TILE;
const MAX_DISTRICT_COLUMNS = 4;
const TARGET_WORLD_ASPECT = 1.6;
const ACCENTS = ['#9284f7', '#45c5c7', '#d59645', '#83a8f5', '#f17c86', '#64e6ae'];

interface AreaSlot {
  bounds: Rect;
  accent: string;
  column: number;
  roomColumns: number;
  variant: number;
}

interface AreaMeasurement {
  width: number;
  height: number;
  roomColumns: number;
}

interface PackedColumn {
  areaIndexes: number[];
  height: number;
  width: number;
}

interface VillageLayout {
  slots: AreaSlot[];
  width: number;
  height: number;
  streets: Rect[];
  verticalStreets: Rect[];
  intersections: Point[];
  spawn: Point;
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

function measureArea(roomCount: number): AreaMeasurement {
  const roomColumns =
    roomCount === 0
      ? 1
      : Math.min(4, roomCount, Math.max(1, Math.ceil(Math.sqrt(roomCount * 1.35))));
  const roomRows = Math.ceil(roomCount / roomColumns);
  return {
    width: AREA_PADDING_X * 2 + roomColumns * ROOM_CELL_WIDTH,
    height: Math.max(
      8 * TILE,
      AREA_HEADER_HEIGHT + Math.max(1, roomRows) * ROOM_CELL_HEIGHT + TILE,
    ),
    roomColumns,
  };
}

function packAreas(measurements: AreaMeasurement[], columnCount: number): PackedColumn[] {
  const columns = Array.from({ length: columnCount }, (): PackedColumn => ({
    areaIndexes: [],
    height: 0,
    width: 0,
  }));

  measurements.forEach((measurement, areaIndex) => {
    const target = columns.reduce((shortest, column) =>
      column.height < shortest.height ? column : shortest,
    );
    if (target.areaIndexes.length > 0) target.height += AREA_GAP;
    target.areaIndexes.push(areaIndex);
    target.height += measurement.height;
    target.width = Math.max(target.width, measurement.width);
  });

  return columns;
}

function chooseColumnPacking(measurements: AreaMeasurement[]): PackedColumn[] {
  const maximum = Math.min(MAX_DISTRICT_COLUMNS, measurements.length);
  let best = packAreas(measurements, 1);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let columnCount = 1; columnCount <= maximum; columnCount += 1) {
    const candidate = packAreas(measurements, columnCount);
    const width =
      EDGE_MARGIN * 2 +
      STREET_WIDTH * (columnCount + 1) +
      candidate.reduce((total, column) => total + column.width, 0);
    const height =
      EDGE_MARGIN * 2 +
      STREET_WIDTH * 2 +
      Math.max(0, ...candidate.map((column) => column.height));
    const score = Math.abs(Math.log(width / height / TARGET_WORLD_ASPECT));
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function createEmptyLayout(): VillageLayout {
  const width = 24 * TILE;
  const height = 16 * TILE;
  const vertical = {
    x: width / 2 - STREET_WIDTH / 2,
    y: EDGE_MARGIN,
    width: STREET_WIDTH,
    height: height - EDGE_MARGIN * 2,
  };
  const horizontal = {
    x: EDGE_MARGIN,
    y: height / 2 - STREET_WIDTH / 2,
    width: width - EDGE_MARGIN * 2,
    height: STREET_WIDTH,
  };
  const spawn = { x: width / 2, y: height / 2 };
  return {
    slots: [],
    width,
    height,
    streets: [vertical, horizontal],
    verticalStreets: [vertical],
    intersections: [spawn],
    spawn,
  };
}

function createVillageLayout(snapshot: MapSnapshot): VillageLayout {
  if (snapshot.areas.length === 0) return createEmptyLayout();

  const measurements = snapshot.areas.map((area) => measureArea(area.rooms.length));
  const columns = chooseColumnPacking(measurements);
  const contentHeight = Math.max(...columns.map((column) => column.height));
  const contentTop = EDGE_MARGIN + STREET_WIDTH;
  const height = EDGE_MARGIN * 2 + STREET_WIDTH * 2 + contentHeight;
  const slots: AreaSlot[] = [];
  const verticalStreets: Rect[] = [];
  let cursorX = EDGE_MARGIN;

  columns.forEach((column, columnIndex) => {
    verticalStreets.push({
      x: cursorX,
      y: EDGE_MARGIN,
      width: STREET_WIDTH,
      height: height - EDGE_MARGIN * 2,
    });
    cursorX += STREET_WIDTH;
    const columnX = cursorX;
    let cursorY =
      contentTop +
      Math.floor((contentHeight - column.height) / (TILE * 2)) * TILE;

    column.areaIndexes.forEach((areaIndex) => {
      const measurement = measurements[areaIndex];
      if (!measurement) return;
      const centeredX =
        columnX + Math.floor((column.width - measurement.width) / (TILE * 2)) * TILE;
      slots[areaIndex] = {
        bounds: {
          x: centeredX,
          y: cursorY,
          width: measurement.width,
          height: measurement.height,
        },
        accent: ACCENTS[areaIndex % ACCENTS.length] ?? ACCENTS[0] ?? '#9284f7',
        column: columnIndex,
        roomColumns: measurement.roomColumns,
        variant: areaIndex % GROVE_PATTERNS.length,
      };
      cursorY += measurement.height + AREA_GAP;
    });

    cursorX += column.width;
  });

  verticalStreets.push({
    x: cursorX,
    y: EDGE_MARGIN,
    width: STREET_WIDTH,
    height: height - EDGE_MARGIN * 2,
  });
  cursorX += STREET_WIDTH;
  const width = cursorX + EDGE_MARGIN;
  const topStreet = {
    x: EDGE_MARGIN,
    y: EDGE_MARGIN,
    width: width - EDGE_MARGIN * 2,
    height: STREET_WIDTH,
  };
  const bottomStreet = {
    x: EDGE_MARGIN,
    y: height - EDGE_MARGIN - STREET_WIDTH,
    width: width - EDGE_MARGIN * 2,
    height: STREET_WIDTH,
  };
  const streetCenters = verticalStreets.map((street) => street.x + street.width / 2);
  const centerX = width / 2;
  const spawnX = streetCenters.reduce((closest, candidate) =>
    Math.abs(candidate - centerX) < Math.abs(closest - centerX) ? candidate : closest,
  );
  const spawn = { x: spawnX, y: bottomStreet.y + bottomStreet.height / 2 };
  const intersections = verticalStreets.flatMap((street) => [
    { x: street.x + street.width / 2, y: topStreet.y + topStreet.height / 2 },
    { x: street.x + street.width / 2, y: bottomStreet.y + bottomStreet.height / 2 },
  ]);

  return {
    slots,
    width,
    height,
    streets: [...verticalStreets, topStreet, bottomStreet],
    verticalStreets,
    intersections,
    spawn,
  };
}

function roomPositions(slot: AreaSlot, count: number): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / slot.roomColumns);
    const column = index % slot.roomColumns;
    const roomsInRow = Math.min(slot.roomColumns, count - row * slot.roomColumns);
    const rowWidth = roomsInRow * ROOM_CELL_WIDTH;
    const rowX = slot.bounds.x + (slot.bounds.width - rowWidth) / 2;
    return {
      x: rowX + column * ROOM_CELL_WIDTH + ROOM_CELL_WIDTH / 2,
      y: slot.bounds.y + AREA_HEADER_HEIGHT + 4 * TILE + row * ROOM_CELL_HEIGHT,
    };
  });
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

function addRectCells(cells: CellSet, rect: Rect): void {
  const firstColumn = Math.floor(rect.x / TILE);
  const lastColumn = Math.ceil((rect.x + rect.width) / TILE) - 1;
  const firstRow = Math.floor(rect.y / TILE);
  const lastRow = Math.ceil((rect.y + rect.height) / TILE) - 1;
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      cells.add(cellKey(column, row));
    }
  }
}

function createDirtPathCells(layout: VillageLayout): CellSet {
  const cells: CellSet = new Set();
  layout.streets.forEach((street) => addRectCells(cells, street));
  layout.intersections.forEach((intersection) => {
    const centerColumn = Math.floor(intersection.x / TILE);
    const centerRow = Math.floor(intersection.y / TILE);
    for (let row = centerRow - 2; row <= centerRow + 2; row += 1) {
      for (let column = centerColumn - 2; column <= centerColumn + 2; column += 1) {
        cells.add(cellKey(column, row));
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

function buildStonePaths(
  portals: WorldPortal[],
  areas: WorldArea[],
  slots: AreaSlot[],
  verticalStreets: Rect[],
  dirtCells: CellSet,
): WorldTileLayer[] {
  const stoneCells: CellSet = new Set();
  const slotsByAreaKey = new Map(
    areas.flatMap((area, index) => {
      const slot = slots[index];
      return slot ? [[area.key, slot] as const] : [];
    }),
  );

  portals.forEach((portal) => {
    const slot = slotsByAreaKey.get(portal.areaKey);
    if (!slot) return;
    const startColumn = Math.floor(portal.x / TILE);
    const startRow = Math.floor(portal.y / TILE);
    const pathRow = startRow + 1;
    const areaCenter = slot.bounds.x + slot.bounds.width / 2;
    const roadCenters = verticalStreets.map((street) => street.x + street.width / 2);
    const leftRoads = roadCenters.filter((center) => center < slot.bounds.x);
    const rightRoads = roadCenters.filter(
      (center) => center > slot.bounds.x + slot.bounds.width,
    );
    const leftRoad = leftRoads.at(-1);
    const rightRoad = rightRoads[0];
    const targetX =
      portal.x < areaCenter
        ? (leftRoad ?? rightRoad)
        : (rightRoad ?? leftRoad);
    if (targetX === undefined) return;
    const targetColumn = Math.floor(targetX / TILE);

    for (let row = startRow; row <= pathRow; row += 1) {
      stoneCells.add(cellKey(startColumn, row));
    }
    const first = Math.min(startColumn, targetColumn);
    const last = Math.max(startColumn, targetColumn);
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
  layout: VillageLayout,
  areas: WorldArea[],
  portals: WorldPortal[],
): WorldTileLayer[] {
  const dirtCells = createDirtPathCells(layout);
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
    ...buildStonePaths(portals, areas, layout.slots, layout.verticalStreets, dirtCells),
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
    blockers.push(stampBounds(tree));
  }
}

function buildBorderForest(
  worldWidth: number,
  worldHeight: number,
  blockers: Rect[],
  spawn: Point,
): WorldTileStamp[] {
  const stamps: WorldTileStamp[] = [];
  const worldColumns = Math.ceil(worldWidth / TILE);

  for (let column = 0; column < worldColumns; column += 1) {
    const x = column * TILE + (column % 2 === 0 ? -8 : 10);
    addTree(stamps, blockers, `north-tree-${column}`, x, column % 3 === 0 ? -18 : 2, column, true);
    if (column % 4 === 1) {
      addTree(stamps, blockers, `north-tree-deep-${column}`, x + 28, 42, column + 1, true);
    }
    if (column % 2 === 0 && Math.abs(x - spawn.x) > TILE * 2.5) {
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
    addTree(stamps, blockers, `east-tree-${row}`, worldWidth - (row % 3 === 0 ? 72 : 46), row * TILE - 18, row + 1, true);
  }

  return stamps;
}

function addSceneryStamps(
  stamps: WorldTileStamp[],
  blockers: Rect[],
  candidates: WorldTileStamp[],
): void {
  candidates.forEach((candidate) => {
    const bounds = stampBounds(candidate);
    if (blockers.some((blocker) => intersects(bounds, inflate(blocker, 10)))) return;
    stamps.push(candidate);
    blockers.push(bounds);
  });
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

    const signX = slot.column % 2 === 0 ? area.bounds.x + area.bounds.width - 72 : area.bounds.x + 24;
    addSceneryStamps(stamps, sceneryBlockers, [
      stamp(`district-sign-${area.key}`, signX, area.bounds.y + 74, [[83]], { solid: false }),
    ]);

    switch (areaIndex % 5) {
      case 0:
        addSceneryStamps(stamps, sceneryBlockers, [
          stamp(`district-fence-${area.key}`, area.bounds.x + 58, area.bounds.y + area.bounds.height - 62, [[80, 81, 81, 82]]),
          stamp(`district-mailbox-${area.key}`, area.bounds.x + area.bounds.width - 132, area.bounds.y + area.bounds.height * 0.72, [[128]]),
        ]);
        break;
      case 1:
        addSceneryStamps(stamps, sceneryBlockers, [
          stamp(`district-log-${area.key}`, area.bounds.x + area.bounds.width * 0.1, area.bounds.y + area.bounds.height * 0.68, [[106]]),
          stamp(`district-target-${area.key}`, area.bounds.x + area.bounds.width * 0.82, area.bounds.y + area.bounds.height * 0.7, [[95]]),
          stamp(`district-crate-${area.key}`, area.bounds.x + area.bounds.width * 0.12, area.bounds.y + area.bounds.height * 0.82, [[130]]),
        ]);
        break;
      case 2:
        addSceneryStamps(stamps, sceneryBlockers, [
          stamp(`district-fence-${area.key}`, area.bounds.x + 248, area.bounds.y + area.bounds.height - 62, [[80, 81, 81, 82]]),
          stamp(`district-hay-${area.key}`, area.bounds.x + 68, area.bounds.y + area.bounds.height * 0.72, [[94]]),
          stamp(`district-well-${area.key}`, area.bounds.x + area.bounds.width - 112, area.bounds.y + area.bounds.height * 0.78, [[104]], {
            solid: true,
            hitbox: { x: 8, y: 24, width: 32, height: 22 },
          }),
        ]);
        break;
      case 4:
        addSceneryStamps(stamps, sceneryBlockers, [
          stamp(`district-chest-${area.key}`, area.bounds.x + area.bounds.width * 0.72, area.bounds.y + area.bounds.height * 0.72, [[131]]),
          stamp(`district-stump-${area.key}`, area.bounds.x + area.bounds.width * 0.2, area.bounds.y + area.bounds.height * 0.78, [[92]]),
          stamp(`district-mushroom-${area.key}`, area.bounds.x + area.bounds.width * 0.27, area.bounds.y + area.bounds.height * 0.82, [[29]]),
        ]);
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
      addSceneryStamps(stamps, sceneryBlockers, [
        stamp(`quiet-well-${area.key}`, area.bounds.x + area.bounds.width * 0.46, area.bounds.y + area.bounds.height * 0.48, [[104]], { solid: true, hitbox: { x: 8, y: 24, width: 32, height: 22 } }),
        stamp(`quiet-mushroom-${area.key}`, area.bounds.x + area.bounds.width * 0.59, area.bounds.y + area.bounds.height * 0.58, [[29]], { solid: false }),
      ]);
    }
  });

  return stamps;
}

function buildVillageProps(
  layout: VillageLayout,
  areas: WorldArea[],
  portals: WorldPortal[],
  tileLayers: WorldTileLayer[],
): WorldTileStamp[] {
  const buildingBlockers = portals.map(buildingBounds);
  const pathBlockers = tileLayers
    .filter((layer) => layer.tileIndex !== 1 && layer.tileIndex !== 2)
    .map((layer) => layer.bounds);
  return [
    ...buildBorderForest(layout.width, layout.height, buildingBlockers, layout.spawn),
    ...buildAreaScenery(areas, layout.slots, portals, pathBlockers),
  ];
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
  const layout = createVillageLayout(snapshot);
  const { areas, portals } = buildAreas(snapshot, layout.slots);
  const tileLayers = buildTileLayers(layout, areas, portals);
  const tileStamps = buildVillageProps(layout, areas, portals, tileLayers);
  const paths: WorldPath[] = layout.streets.map((bounds, index) => ({
    id: `village-street-${index}`,
    bounds,
  }));
  const stampColliders = tileStamps
    .map(colliderForStamp)
    .filter((collider): collider is Rect => collider !== null);

  return {
    name: snapshot.server.displayName,
    environment: 'exterior',
    theme: KENNEY_TINY_TOWN_THEME,
    bounds: { x: 0, y: 0, width: layout.width, height: layout.height },
    spawn: layout.spawn,
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
