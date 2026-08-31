import type { MapSnapshot } from '../../../domain/map/snapshot';
import type { Point, Rect, WorldArea, WorldDefinition, WorldPortal, WorldProp } from './types';

const WORLD_BOUNDS: Rect = { x: 0, y: 0, width: 1536, height: 1024 };

const AREA_SLOTS: Array<{ bounds: Rect; accent: string }> = [
  { bounds: { x: 96, y: 96, width: 512, height: 288 }, accent: '#9284f7' },
  { bounds: { x: 928, y: 96, width: 512, height: 288 }, accent: '#45c5c7' },
  { bounds: { x: 96, y: 640, width: 512, height: 288 }, accent: '#d59645' },
  { bounds: { x: 928, y: 640, width: 512, height: 288 }, accent: '#83a8f5' },
  { bounds: { x: 656, y: 704, width: 224, height: 224 }, accent: '#f17c86' },
];

function roomPositions(bounds: Rect, count: number): Point[] {
  if (count === 0) return [];
  const columns = Math.min(3, Math.max(1, count));
  const rows = Math.ceil(count / columns);
  const horizontalGap = bounds.width / (columns + 1);
  const verticalStart = bounds.y + 130;
  const verticalGap = rows === 1 ? 0 : Math.min(104, (bounds.height - 158) / (rows - 1));

  return Array.from({ length: count }, (_, index) => ({
    x: bounds.x + horizontalGap * ((index % columns) + 1),
    y: verticalStart + verticalGap * Math.floor(index / columns),
  }));
}

function buildAreas(snapshot: MapSnapshot): { areas: WorldArea[]; portals: WorldPortal[] } {
  const fallback = AREA_SLOTS[AREA_SLOTS.length - 1];
  if (!fallback) return { areas: [], portals: [] };
  const areas: WorldArea[] = [];
  const portals: WorldPortal[] = [];

  snapshot.areas.forEach((area, index) => {
    const slot = AREA_SLOTS[index] ?? fallback;
    const worldArea: WorldArea = {
      key: area.key,
      label: area.label,
      accent: slot.accent,
      bounds: slot.bounds,
      roomCount: area.rooms.length,
    };
    areas.push(worldArea);

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
      });
    });
  });

  return { areas, portals };
}

function buildProps(): WorldProp[] {
  const props: WorldProp[] = [];
  const treePositions = [
    [40, 48],
    [1424, 48],
    [40, 880],
    [1424, 880],
    [640, 48],
    [848, 48],
    [640, 896],
    [848, 896],
    [40, 448],
    [1424, 448],
  ];
  treePositions.forEach(([x, y], index) => {
    if (x === undefined || y === undefined) return;
    props.push({ id: `tree-${index}`, kind: 'tree', x, y, width: 64, height: 80, solid: true });
  });

  props.push(
    { id: 'central-fountain', kind: 'fountain', x: 704, y: 416, width: 128, height: 96, solid: true },
    { id: 'arrival-bench', kind: 'bench', x: 256, y: 320, width: 96, height: 32, solid: true },
    { id: 'workshop-bench', kind: 'bench', x: 1136, y: 320, width: 96, height: 32, solid: true },
    { id: 'commons-planter', kind: 'planter', x: 496, y: 816, width: 48, height: 48, solid: true },
    { id: 'quiet-planter', kind: 'planter', x: 992, y: 816, width: 48, height: 48, solid: true },
  );
  return props;
}

export function createUrbanWorld(snapshot: MapSnapshot): WorldDefinition {
  const { areas, portals } = buildAreas(snapshot);
  const props = buildProps();
  const portalColliders: Rect[] = portals.map((portal) => ({
    x: portal.x - 44,
    y: portal.y - 72,
    width: 88,
    height: 48,
  }));

  return {
    name: snapshot.server.displayName,
    bounds: WORLD_BOUNDS,
    spawn: { x: 768, y: 568 },
    areas,
    portals,
    props,
    colliders: [
      ...props.filter((prop) => prop.solid).map(({ x, y, width, height }) => ({ x, y, width, height })),
      ...portalColliders,
    ],
  };
}
