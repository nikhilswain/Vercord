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
import { KENNEY_TINY_TOWN_THEME } from './themes';

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
  const roomRows = Math.max(1, Math.ceil(roomCount / 2));
  return Math.max(420, 224 + roomRows * 184);
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
  const columns = Math.min(2, count);
  const horizontalGap = bounds.width / (columns + 1);
  return Array.from({ length: count }, (_, index) => ({
    x: bounds.x + horizontalGap * ((index % columns) + 1),
    y: bounds.y + 210 + Math.floor(index / columns) * 184,
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
  const tree = (id: string, x: number, y: number): WorldProp => ({
    id,
    kind: 'tree',
    x,
    y,
    width: 48,
    height: 96,
    solid: true,
    hitbox: { x: 18, y: 68, width: 12, height: 24 },
  });
  const props: WorldProp[] = [
    tree('northwest-tree', 32, 24),
    tree('northeast-tree', 1456, 24),
    tree('southwest-tree', 32, worldHeight - 120),
    tree('southeast-tree', 1456, worldHeight - 120),
  ];

  areas.forEach((area) => {
    props.push(
      tree(`tree-top-left-${area.key}`, area.bounds.x + 18, area.bounds.y + 78),
      tree(`tree-top-right-${area.key}`, area.bounds.x + area.bounds.width - 66, area.bounds.y + 78),
      tree(
        `tree-bottom-left-${area.key}`,
        area.bounds.x + 18,
        area.bounds.y + area.bounds.height - 120,
      ),
      tree(
        `tree-bottom-right-${area.key}`,
        area.bounds.x + area.bounds.width - 66,
        area.bounds.y + area.bounds.height - 120,
      ),
    );
  });
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
      tileIndex: KENNEY_TINY_TOWN_THEME.tiles.path,
      radius: 24,
    })),
  ];
  const bounds: Rect = { x: 0, y: 0, width: WORLD_WIDTH, height: layout.height };
  const portalColliders: Rect[] = portals.map((portal) => ({
    x: portal.x - 64,
    y: portal.y - 124,
    width: 128,
    height: 96,
  }));

  return {
    name: snapshot.server.displayName,
    environment: 'exterior',
    theme: KENNEY_TINY_TOWN_THEME,
    bounds,
    spawn: { x: CENTRAL_PATH_X + CENTRAL_PATH_WIDTH / 2, y: 64 },
    areas,
    paths: layout.paths,
    tileLayers,
    portals,
    props,
    colliders: [
      ...props.filter((prop) => prop.solid).map((prop) => ({
        x: prop.x + (prop.hitbox?.x ?? 0),
        y: prop.y + (prop.hitbox?.y ?? 0),
        width: prop.hitbox?.width ?? prop.width,
        height: prop.hitbox?.height ?? prop.height,
      })),
      ...portalColliders,
    ],
  };
}
