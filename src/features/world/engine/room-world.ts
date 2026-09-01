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

const TILE = 16;
const FURNITURE_SCALE = 1;
const ROOM_WIDTH = 32 * TILE;
const ROOM_HEIGHT = 22 * TILE;
const ROOM_INSET = TILE;
const BACK_WALL_BOTTOM = 4 * TILE;
const BOTTOM_WALL_TOP = 21 * TILE;
const DOOR_LEFT = 14 * TILE;
const DOOR_RIGHT = 18 * TILE;

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
      return { x: 4, y: 16, width: width - 8, height: height - 18 };
    case 'bookshelf':
      return { x: 2, y: 28, width: width - 4, height: height - 30 };
    case 'chair':
      return { x: 4, y: 18, width: width - 8, height: height - 20 };
    case 'planter':
      return { x: 4, y: 20, width: width - 8, height: height - 22 };
    case 'sofa':
      return { x: 2, y: 16, width: width - 4, height: height - 18 };
    case 'desk':
    case 'table':
      return { x: 2, y: 10, width: width - 4, height: height - 12 };
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
  const width = (source?.width ?? 16) * FURNITURE_SCALE;
  const height = (source?.height ?? 16) * FURNITURE_SCALE;
  return prop(id, kind, x, y, width, height, {
    ...options,
    hitbox: options.hitbox ?? defaultHitbox(kind, width, height),
  });
}

function screen(id: string, x: number, y: number, accent: string): WorldProp {
  return prop(id, 'screen', x, y, 96, 48, { solid: false, tint: accent });
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
    redRug(theme, 'conversation-rug', 232, 152),
    wallProp(theme, 'conversation-window', 'window', 248, 32),
    wallProp(theme, 'conversation-art', 'art', 392, 32),
    atlasProp(theme, 'conversation-books', 'bookshelf', 48, 88),
    atlasProp(theme, 'conversation-plant', 'planter', 448, 96),
    atlasProp(theme, 'conversation-sofa-left', 'sofa', 128, 136),
    atlasProp(theme, 'conversation-sofa-right', 'sofa', 336, 136),
    atlasProp(theme, 'conversation-table', 'table', 232, 176),
    atlasProp(theme, 'conversation-chair-left', 'armchair', 176, 232),
    atlasProp(theme, 'conversation-chair-right', 'armchair', 304, 232),
  ];
}

function textRoom(theme: WorldTheme): WorldProp[] {
  return [
    redRug(theme, 'text-rug', 232, 168),
    wallProp(theme, 'text-window', 'window', 248, 32),
    wallProp(theme, 'text-art', 'art', 392, 32),
    atlasProp(theme, 'text-books', 'bookshelf', 48, 88),
    atlasProp(theme, 'text-plant', 'planter', 448, 96),
    atlasProp(theme, 'text-desk-left', 'desk', 128, 152),
    atlasProp(theme, 'text-chair-left', 'chair', 144, 192),
    atlasProp(theme, 'text-desk-right', 'desk', 336, 152),
    atlasProp(theme, 'text-chair-right', 'chair', 352, 192),
    atlasProp(theme, 'text-sofa', 'sofa', 232, 96),
  ];
}

function workshopRoom(theme: WorldTheme): WorldProp[] {
  return [
    wallProp(theme, 'workshop-window-left', 'window', 160, 32),
    wallProp(theme, 'workshop-window-right', 'window', 336, 32),
    wallProp(theme, 'workshop-art', 'art', 248, 32),
    atlasProp(theme, 'workshop-books-left', 'bookshelf', 48, 88),
    atlasProp(theme, 'workshop-books-right', 'bookshelf', 432, 88),
    atlasProp(theme, 'workshop-table-left', 'table', 128, 152),
    atlasProp(theme, 'workshop-chair-left', 'chair', 144, 192),
    atlasProp(theme, 'workshop-table-right', 'table', 336, 152),
    atlasProp(theme, 'workshop-chair-right', 'chair', 352, 192),
    atlasProp(theme, 'workshop-plant', 'planter', 248, 96),
  ];
}

function stageRoom(theme: WorldTheme, accent: string): WorldProp[] {
  return [
    redRug(theme, 'stage-rug', 232, 160),
    wallProp(theme, 'stage-curtain-left', 'curtain', 144, 32),
    wallProp(theme, 'stage-curtain-right', 'curtain', 336, 32),
    screen('stage-screen', 208, 16, accent),
    atlasProp(theme, 'stage-books', 'bookshelf', 48, 88),
    atlasProp(theme, 'stage-plant', 'planter', 448, 96),
    atlasProp(theme, 'stage-podium', 'desk', 232, 104),
    atlasProp(theme, 'stage-sofa-left', 'sofa', 96, 224),
    atlasProp(theme, 'stage-sofa-right', 'sofa', 368, 224),
    atlasProp(theme, 'stage-chair-left', 'armchair', 176, 224),
    atlasProp(theme, 'stage-chair-right', 'armchair', 304, 224),
  ];
}

function mediaRoom(theme: WorldTheme, accent: string): WorldProp[] {
  return [
    blueRug(theme, 'media-rug', 240, 168),
    wallProp(theme, 'media-curtain-left', 'curtain', 144, 32),
    wallProp(theme, 'media-curtain-right', 'curtain', 336, 32),
    screen('media-screen', 208, 16, accent),
    atlasProp(theme, 'media-books', 'bookshelf', 48, 88),
    atlasProp(theme, 'media-plant', 'planter', 448, 96),
    atlasProp(theme, 'media-desk-left', 'desk', 128, 168),
    atlasProp(theme, 'media-chair-left', 'chair', 144, 208),
    atlasProp(theme, 'media-desk-right', 'desk', 336, 168),
    atlasProp(theme, 'media-chair-right', 'chair', 352, 208),
    atlasProp(theme, 'media-console', 'table', 232, 104),
  ];
}

function oddmentsRoom(theme: WorldTheme): WorldProp[] {
  return [
    redRug(theme, 'oddments-rug', 232, 168),
    wallProp(theme, 'oddments-window', 'window', 288, 32),
    wallProp(theme, 'oddments-art-left', 'art', 192, 32),
    wallProp(theme, 'oddments-art-right', 'art', 344, 32),
    atlasProp(theme, 'oddments-books-left', 'bookshelf', 48, 88),
    atlasProp(theme, 'oddments-books-right', 'bookshelf', 416, 216),
    atlasProp(theme, 'oddments-table', 'table', 112, 152),
    atlasProp(theme, 'oddments-chair', 'chair', 168, 168),
    atlasProp(theme, 'oddments-armchair', 'armchair', 304, 120),
    atlasProp(theme, 'oddments-sofa', 'sofa', 336, 232),
    atlasProp(theme, 'oddments-plant', 'planter', 448, 96),
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
    spawn: { x: ROOM_WIDTH / 2, y: BOTTOM_WALL_TOP - 56 },
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
