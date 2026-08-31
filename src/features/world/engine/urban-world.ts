import type { MapSnapshot } from '../../../domain/map/snapshot';
import type {
  Point,
  Rect,
  WorldArea,
  WorldDefinition,
  WorldPath,
  WorldPortal,
  WorldProp,
  WorldTileLayer,
} from './types';
import { KENNEY_URBAN_THEME } from './themes';

const WORLD_WIDTH = 1536;
const AREA_WIDTH = 512;
const LEFT_AREA_X = 96;
const RIGHT_AREA_X = 928;
const CENTRAL_PATH_X = 704;
const CENTRAL_PATH_WIDTH = 128;
const TOP_MARGIN = 112;
const ROW_GAP = 192;
const ACCENTS = ['#9284f7', '#45c5c7', '#d59645', '#83a8f5', '#f17c86', '#64e6ae'];

interface AreaSlot {
  bounds: Rect;
  accent: string;
}

function areaHeight(roomCount: number): number {
  const roomRows = Math.max(1, Math.ceil(roomCount / 3));
  return Math.max(288, 184 + roomRows * 104);
}

function createAreaSlots(snapshot: MapSnapshot): {
  slots: AreaSlot[];
  paths: WorldPath[];
  height: number;
} {
  const slots: AreaSlot[] = [];
  const paths: WorldPath[] = [];
  let y = TOP_MARGIN;

  for (let index = 0; index < snapshot.areas.length; index += 2) {
    const leftArea = snapshot.areas[index];
    const rightArea = snapshot.areas[index + 1];
    const leftHeight = areaHeight(leftArea?.rooms.length ?? 0);
    const rightHeight = areaHeight(rightArea?.rooms.length ?? 0);
    const rowHeight = Math.max(leftHeight, rightHeight);

    if (leftArea) {
      slots.push({
        bounds: { x: LEFT_AREA_X, y, width: AREA_WIDTH, height: leftHeight },
        accent: ACCENTS[index % ACCENTS.length] ?? ACCENTS[0] ?? '#9284f7',
      });
      paths.push({
        id: `connector-${leftArea.key}`,
        bounds: { x: LEFT_AREA_X + AREA_WIDTH, y: y + leftHeight / 2 - 48, width: 96, height: 96 },
      });
    }

    if (rightArea) {
      slots.push({
        bounds: { x: RIGHT_AREA_X, y, width: AREA_WIDTH, height: rightHeight },
        accent: ACCENTS[(index + 1) % ACCENTS.length] ?? ACCENTS[0] ?? '#9284f7',
      });
      paths.push({
        id: `connector-${rightArea.key}`,
        bounds: { x: CENTRAL_PATH_X + CENTRAL_PATH_WIDTH, y: y + rightHeight / 2 - 48, width: 96, height: 96 },
      });
    }

    y += rowHeight + ROW_GAP;
  }

  const height = Math.max(1024, y - ROW_GAP + TOP_MARGIN);
  paths.unshift({
    id: 'central-spine',
    bounds: { x: CENTRAL_PATH_X, y: 0, width: CENTRAL_PATH_WIDTH, height },
  });
  return { slots, paths, height };
}

function roomPositions(bounds: Rect, count: number): Point[] {
  if (count === 0) return [];
  const columns = Math.min(3, count);
  const horizontalGap = bounds.width / (columns + 1);
  return Array.from({ length: count }, (_, index) => ({
    x: bounds.x + horizontalGap * ((index % columns) + 1),
    y: bounds.y + 142 + Math.floor(index / columns) * 104,
  }));
}

function buildAreas(snapshot: MapSnapshot, slots: AreaSlot[]): {
  areas: WorldArea[];
  portals: WorldPortal[];
} {
  const areas: WorldArea[] = [];
  const portals: WorldPortal[] = [];

  snapshot.areas.forEach((area, index) => {
    const slot = slots[index];
    if (!slot) return;
    areas.push({
      key: area.key,
      label: area.label,
      accent: slot.accent,
      bounds: slot.bounds,
      roomCount: area.rooms.length,
    });

    const positions = roomPositions(slot.bounds, area.rooms.length);
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
      });
    });
  });
  return { areas, portals };
}

function buildProps(areas: WorldArea[], worldHeight: number): WorldProp[] {
  const props: WorldProp[] = [
    { id: 'northwest-tree', kind: 'tree', x: 24, y: 32, width: 64, height: 80, solid: true },
    { id: 'northeast-tree', kind: 'tree', x: 1448, y: 32, width: 64, height: 80, solid: true },
    {
      id: 'southwest-tree',
      kind: 'tree',
      x: 24,
      y: worldHeight - 112,
      width: 64,
      height: 80,
      solid: true,
    },
    {
      id: 'southeast-tree',
      kind: 'tree',
      x: 1448,
      y: worldHeight - 112,
      width: 64,
      height: 80,
      solid: true,
    },
  ];

  areas.forEach((area, index) => {
    props.push({
      id: `bench-${area.key}`,
      kind: 'bench',
      x: area.bounds.x + (index % 2 === 0 ? 30 : area.bounds.width - 126),
      y: area.bounds.y + area.bounds.height - 54,
      width: 96,
      height: 32,
      solid: true,
    });
    props.push({
      id: `planter-${area.key}`,
      kind: 'planter',
      x: area.bounds.x + area.bounds.width - 72,
      y: area.bounds.y + 82,
      width: 44,
      height: 44,
      solid: true,
      tint: area.accent,
    });
    props.push(
      {
        id: `tree-left-${area.key}`,
        kind: 'tree',
        x: area.bounds.x + 24,
        y: area.bounds.y + area.bounds.height - 108,
        width: 64,
        height: 80,
        solid: true,
      },
      {
        id: `tree-right-${area.key}`,
        kind: 'tree',
        x: area.bounds.x + area.bounds.width - 88,
        y: area.bounds.y + area.bounds.height - 108,
        width: 64,
        height: 80,
        solid: true,
      },
    );
  });

  for (let y = 152; y < worldHeight - 96; y += 224) {
    props.push(
      {
        id: `lamp-west-${y}`,
        kind: 'lamp',
        x: CENTRAL_PATH_X - 36,
        y,
        width: 28,
        height: 56,
        solid: true,
      },
      {
        id: `lamp-east-${y}`,
        kind: 'lamp',
        x: CENTRAL_PATH_X + CENTRAL_PATH_WIDTH + 8,
        y: y + 96,
        width: 28,
        height: 56,
        solid: true,
      },
    );
  }
  return props;
}

export function createUrbanWorld(snapshot: MapSnapshot): WorldDefinition {
  const layout = createAreaSlots(snapshot);
  const { areas, portals } = buildAreas(snapshot, layout.slots);
  const props = buildProps(areas, layout.height);
  const tileLayers: WorldTileLayer[] = [
    ...layout.paths.map((path) => ({
      id: path.id,
      bounds: path.bounds,
      tileIndex: KENNEY_URBAN_THEME.tiles.path,
    })),
    ...areas.map((area) => ({
      id: `neighborhood-${area.key}`,
      bounds: area.bounds,
      tileIndex: KENNEY_URBAN_THEME.tiles.plaza,
    })),
  ];
  const bounds: Rect = { x: 0, y: 0, width: WORLD_WIDTH, height: layout.height };
  const portalColliders: Rect[] = portals.map((portal) => ({
    x: portal.x - 44,
    y: portal.y - 72,
    width: 88,
    height: 48,
  }));

  return {
    name: snapshot.server.displayName,
    environment: 'exterior',
    theme: KENNEY_URBAN_THEME,
    bounds,
    spawn: { x: CENTRAL_PATH_X + CENTRAL_PATH_WIDTH / 2, y: 64 },
    areas,
    paths: layout.paths,
    tileLayers,
    portals,
    props,
    colliders: [
      ...props.filter((prop) => prop.solid).map(({ x, y, width, height }) => ({ x, y, width, height })),
      ...portalColliders,
    ],
  };
}
