import type { MapRoomType } from '../../../domain/map/snapshot';
import type {
  Rect,
  WorldDefinition,
  WorldInteriorStyle,
  WorldPortal,
  WorldProp,
  WorldPropKind,
  WorldTheme,
} from './types';

const TILE = 48;
const SOURCE_SCALE = 3;
const ROOM_WIDTH = 20 * TILE;
const ROOM_HEIGHT = 15 * TILE;
const ROOM_INSET = TILE;
const BACK_WALL_BOTTOM = 4 * TILE;
const BOTTOM_WALL_TOP = 14 * TILE;
const DOOR_LEFT = 9 * TILE;
const DOOR_RIGHT = 11 * TILE;

const BLUE_WALL: Rect = { x: 0, y: 0, width: 48, height: 48 };
const STONE_WALL: Rect = { x: 48, y: 0, width: 48, height: 48 };
const STONE_FLOOR: Rect = { x: 96, y: 32, width: 16, height: 16 };
const WOOD_FLOOR: Rect = { x: 112, y: 32, width: 16, height: 16 };

interface PropOptions {
  solid?: boolean;
  layer?: WorldProp['layer'];
  hitbox?: Rect;
  tint?: string;
}

function prop(
  id: string,
  kind: WorldPropKind,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PropOptions = {},
): WorldProp {
  return {
    id,
    kind,
    x,
    y,
    width,
    height,
    solid: options.solid ?? true,
    layer: options.layer,
    hitbox: options.hitbox,
    tint: options.tint,
  };
}

function defaultHitbox(kind: WorldPropKind, width: number, height: number): Rect | undefined {
  switch (kind) {
    case 'armchair':
      return { x: 8, y: 24, width: width - 16, height: height - 30 };
    case 'chair':
      return { x: 8, y: 30, width: width - 16, height: height - 36 };
    case 'planter':
      return { x: 12, y: height - 34, width: width - 24, height: 30 };
    case 'sofa':
      return { x: 4, y: 30, width: width - 8, height: height - 36 };
    case 'desk':
    case 'table':
      return { x: 4, y: 12, width: width - 8, height: height - 22 };
    default:
      return undefined;
  }
}

function atlasProp(
  theme: WorldTheme,
  id: string,
  kind: WorldPropKind,
  x: number,
  y: number,
  options: PropOptions = {},
): WorldProp {
  const source = theme.interiorAtlas?.sprites[kind];
  const width = (source?.width ?? 16) * SOURCE_SCALE;
  const height = (source?.height ?? 16) * SOURCE_SCALE;
  return prop(id, kind, x, y, width, height, {
    ...options,
    hitbox: options.hitbox ?? defaultHitbox(kind, width, height),
  });
}

function screen(id: string, x: number, y: number, accent: string): WorldProp {
  return prop(id, 'screen', x, y, 192, 96, { solid: false, tint: accent });
}

function redRug(theme: WorldTheme, id: string, x: number, y: number): WorldProp {
  return atlasProp(theme, id, 'rug', x, y, { solid: false, layer: 'floor' });
}

function blueRug(theme: WorldTheme, id: string, x: number, y: number): WorldProp {
  return atlasProp(theme, id, 'blueRug', x, y, { solid: false, layer: 'floor' });
}

function wallProp(
  theme: WorldTheme,
  id: string,
  kind: 'art' | 'curtain' | 'window',
  x: number,
  y: number,
): WorldProp {
  return atlasProp(theme, id, kind, x, y, { solid: false });
}

function socialRoom(theme: WorldTheme): WorldProp[] {
  return [
    redRug(theme, 'conversation-rug', 408, 324),
    wallProp(theme, 'conversation-window', 'window', 456, 104),
    wallProp(theme, 'conversation-art', 'art', 720, 112),
    atlasProp(theme, 'conversation-books', 'bookshelf', 72, 216),
    atlasProp(theme, 'conversation-plant', 'planter', 840, 216),
    atlasProp(theme, 'conversation-sofa-left', 'sofa', 192, 288),
    atlasProp(theme, 'conversation-sofa-right', 'sofa', 624, 288),
    atlasProp(theme, 'conversation-table', 'table', 408, 372),
    atlasProp(theme, 'conversation-chair-left', 'armchair', 288, 468),
    atlasProp(theme, 'conversation-chair-right', 'armchair', 576, 468),
  ];
}

function textRoom(theme: WorldTheme): WorldProp[] {
  return [
    redRug(theme, 'text-rug', 408, 324),
    wallProp(theme, 'text-window', 'window', 456, 104),
    wallProp(theme, 'text-art', 'art', 744, 112),
    atlasProp(theme, 'text-books', 'bookshelf', 72, 216),
    atlasProp(theme, 'text-plant', 'planter', 840, 216),
    atlasProp(theme, 'text-desk-left', 'desk', 192, 300),
    atlasProp(theme, 'text-chair-left', 'chair', 240, 408),
    atlasProp(theme, 'text-desk-right', 'desk', 624, 300),
    atlasProp(theme, 'text-chair-right', 'chair', 672, 408),
    atlasProp(theme, 'text-sofa', 'sofa', 408, 228),
  ];
}

function workshopRoom(theme: WorldTheme): WorldProp[] {
  return [
    blueRug(theme, 'workshop-rug-left', 216, 300),
    blueRug(theme, 'workshop-rug-right', 648, 300),
    wallProp(theme, 'workshop-window-left', 'window', 312, 104),
    wallProp(theme, 'workshop-window-right', 'window', 600, 104),
    wallProp(theme, 'workshop-art', 'art', 456, 112),
    atlasProp(theme, 'workshop-books-left', 'bookshelf', 72, 216),
    atlasProp(theme, 'workshop-books-right', 'bookshelf', 792, 216),
    atlasProp(theme, 'workshop-table-left', 'table', 192, 306),
    atlasProp(theme, 'workshop-chair-left', 'chair', 240, 414),
    atlasProp(theme, 'workshop-table-right', 'table', 624, 306),
    atlasProp(theme, 'workshop-chair-right', 'chair', 672, 414),
    atlasProp(theme, 'workshop-plant', 'planter', 456, 216),
  ];
}

function stageRoom(theme: WorldTheme, accent: string): WorldProp[] {
  return [
    redRug(theme, 'stage-rug', 408, 228),
    wallProp(theme, 'stage-curtain-left', 'curtain', 264, 88),
    wallProp(theme, 'stage-curtain-right', 'curtain', 600, 88),
    screen('stage-screen', 384, 80, accent),
    atlasProp(theme, 'stage-books', 'bookshelf', 72, 216),
    atlasProp(theme, 'stage-plant', 'planter', 840, 216),
    atlasProp(theme, 'stage-podium', 'desk', 408, 294),
    atlasProp(theme, 'stage-sofa-left', 'sofa', 144, 438),
    atlasProp(theme, 'stage-sofa-right', 'sofa', 672, 438),
    atlasProp(theme, 'stage-chair-left', 'armchair', 312, 438),
    atlasProp(theme, 'stage-chair-right', 'armchair', 552, 438),
  ];
}

function mediaRoom(theme: WorldTheme, accent: string): WorldProp[] {
  return [
    blueRug(theme, 'media-rug', 432, 318),
    wallProp(theme, 'media-curtain-left', 'curtain', 264, 88),
    wallProp(theme, 'media-curtain-right', 'curtain', 600, 88),
    screen('media-screen', 384, 80, accent),
    atlasProp(theme, 'media-books', 'bookshelf', 72, 216),
    atlasProp(theme, 'media-plant', 'planter', 840, 216),
    atlasProp(theme, 'media-desk-left', 'desk', 192, 312),
    atlasProp(theme, 'media-chair-left', 'chair', 240, 420),
    atlasProp(theme, 'media-desk-right', 'desk', 624, 312),
    atlasProp(theme, 'media-chair-right', 'chair', 672, 420),
    atlasProp(theme, 'media-console', 'table', 408, 258),
  ];
}

function oddmentsRoom(theme: WorldTheme): WorldProp[] {
  return [
    redRug(theme, 'oddments-rug', 408, 354),
    wallProp(theme, 'oddments-window', 'window', 552, 104),
    wallProp(theme, 'oddments-art-left', 'art', 360, 112),
    wallProp(theme, 'oddments-art-right', 'art', 648, 112),
    atlasProp(theme, 'oddments-books-left', 'bookshelf', 72, 216),
    atlasProp(theme, 'oddments-books-right', 'bookshelf', 792, 360),
    atlasProp(theme, 'oddments-table', 'table', 192, 330),
    atlasProp(theme, 'oddments-chair', 'chair', 348, 342),
    atlasProp(theme, 'oddments-armchair', 'armchair', 552, 258),
    atlasProp(theme, 'oddments-sofa', 'sofa', 624, 480),
    atlasProp(theme, 'oddments-plant', 'planter', 840, 216),
  ];
}

function roomProps(type: MapRoomType, accent: string, theme: WorldTheme): WorldProp[] {
  switch (type) {
    case 'voice':
      return socialRoom(theme);
    case 'stage':
    case 'announcement':
      return stageRoom(theme, accent);
    case 'forum':
      return workshopRoom(theme);
    case 'media':
      return mediaRoom(theme, accent);
    case 'unsupported':
      return oddmentsRoom(theme);
    default:
      return textRoom(theme);
  }
}

function roomStyle(type: MapRoomType): WorldInteriorStyle {
  switch (type) {
    case 'voice':
    case 'text':
      return { wallPanel: BLUE_WALL, floorTile: WOOD_FLOOR };
    case 'forum':
    case 'announcement':
    case 'stage':
      return { wallPanel: STONE_WALL, floorTile: WOOD_FLOOR };
    case 'media':
    case 'unsupported':
      return { wallPanel: STONE_WALL, floorTile: STONE_FLOOR };
    default:
      return { wallPanel: BLUE_WALL, floorTile: WOOD_FLOOR };
  }
}

function propCollider(item: WorldProp): Rect {
  return {
    x: item.x + (item.hitbox?.x ?? 0),
    y: item.y + (item.hitbox?.y ?? 0),
    width: item.hitbox?.width ?? item.width,
    height: item.hitbox?.height ?? item.height,
  };
}

export function createRoomWorld(portal: WorldPortal, theme: WorldTheme): WorldDefinition {
  const props = roomProps(portal.room.type, portal.accent, theme);
  const wallColliders: Rect[] = [
    { x: 0, y: 0, width: ROOM_WIDTH, height: BACK_WALL_BOTTOM },
    { x: 0, y: 0, width: ROOM_INSET, height: ROOM_HEIGHT },
    { x: ROOM_WIDTH - ROOM_INSET, y: 0, width: ROOM_INSET, height: ROOM_HEIGHT },
    { x: 0, y: BOTTOM_WALL_TOP, width: DOOR_LEFT, height: ROOM_HEIGHT - BOTTOM_WALL_TOP },
    {
      x: DOOR_RIGHT,
      y: BOTTOM_WALL_TOP,
      width: ROOM_WIDTH - DOOR_RIGHT,
      height: ROOM_HEIGHT - BOTTOM_WALL_TOP,
    },
  ];
  const exit: WorldPortal = {
    x: ROOM_WIDTH / 2,
    y: BOTTOM_WALL_TOP - 22,
    key: `exit-${portal.key}`,
    areaKey: portal.areaKey,
    areaLabel: portal.areaLabel,
    room: portal.room,
    accent: portal.accent,
    destination: 'world',
  };

  return {
    name: `#${portal.room.label}`,
    environment: 'interior',
    theme,
    interiorStyle: roomStyle(portal.room.type),
    bounds: { x: 0, y: 0, width: ROOM_WIDTH, height: ROOM_HEIGHT },
    spawn: { x: ROOM_WIDTH / 2, y: BOTTOM_WALL_TOP - 94 },
    areas: [
      {
        key: portal.areaKey,
        label: `#${portal.room.label}`,
        accent: portal.accent,
        bounds: {
          x: ROOM_INSET,
          y: BACK_WALL_BOTTOM,
          width: ROOM_WIDTH - ROOM_INSET * 2,
          height: BOTTOM_WALL_TOP - BACK_WALL_BOTTOM,
        },
        roomCount: 1,
      },
    ],
    paths: [],
    tileLayers: [],
    tileStamps: [],
    portals: [exit],
    props,
    colliders: [
      ...wallColliders,
      ...props.filter((item) => item.solid).map(propCollider),
    ],
  };
}
