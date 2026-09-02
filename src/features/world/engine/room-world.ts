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
const ROOM_WIDTH = 32 * TILE;
const ROOM_HEIGHT = 22 * TILE;
const ROOM_INSET = TILE;
const BACK_WALL_BOTTOM = 4 * TILE;
const BOTTOM_WALL_TOP = 21 * TILE;
const DOOR_LEFT = 14 * TILE;
const DOOR_RIGHT = 18 * TILE;

const BRICK_WALL: Rect = { x: 32, y: 16, width: 16, height: 16 };
const CARVED_WALL: Rect = { x: 64, y: 32, width: 16, height: 16 };
const HEARTH_FLOOR: Rect = { x: 16, y: 64, width: 16, height: 16 };
const SANDSTONE_FLOOR: Rect = { x: 80, y: 64, width: 16, height: 16 };
const DARK_FLOOR: Rect = { x: 0, y: 0, width: 16, height: 16 };

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
      return { x: 4, y: height / 2, width: width - 8, height: height / 2 - 2 };
    case 'bookshelf':
      return { x: 2, y: height / 2, width: width - 4, height: height / 2 - 2 };
    case 'chair':
      return { x: 5, y: height / 2, width: width - 10, height: height / 2 - 2 };
    case 'planter':
      return { x: 5, y: height / 2, width: width - 10, height: height / 2 - 2 };
    case 'sofa':
      return { x: 2, y: height / 2, width: width - 4, height: height / 2 - 2 };
    case 'desk':
    case 'table':
      return { x: 2, y: height / 3, width: width - 4, height: (height * 2) / 3 - 2 };
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
  const renderScale = theme.interiorAtlas?.renderScale ?? 1;
  const width = (source?.width ?? 16) * renderScale;
  const height = (source?.height ?? 16) * renderScale;
  return prop(id, kind, x, y, width, height, {
    ...options,
    hitbox: options.hitbox ?? defaultHitbox(kind, width, height),
  });
}

function screen(id: string, x: number, y: number, accent: string): WorldProp {
  return prop(id, 'screen', x, y, 96, 48, { solid: false, tint: accent });
}

function redRug(_theme: WorldTheme, id: string, x: number, y: number): WorldProp {
  return prop(id, 'rug', x, y, 96, 64, {
    solid: false,
    layer: 'floor',
    tint: '#d6a15f',
  });
}

function blueRug(_theme: WorldTheme, id: string, x: number, y: number): WorldProp {
  return prop(id, 'blueRug', x, y, 96, 64, {
    solid: false,
    layer: 'floor',
    tint: '#8bd4d2',
  });
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
    redRug(theme, 'conversation-rug', 208, 144),
    wallProp(theme, 'conversation-window', 'window', 240, 32),
    wallProp(theme, 'conversation-torch-left', 'curtain', 144, 32),
    wallProp(theme, 'conversation-torch-right', 'curtain', 336, 32),
    atlasProp(theme, 'conversation-books-left', 'bookshelf', 48, 88),
    atlasProp(theme, 'conversation-books-right', 'bookshelf', 432, 88),
    atlasProp(theme, 'conversation-plant', 'planter', 448, 96),
    atlasProp(theme, 'conversation-table-left', 'table', 224, 160),
    atlasProp(theme, 'conversation-table-right', 'table', 256, 160),
    atlasProp(theme, 'conversation-chair-north', 'armchair', 240, 112),
    atlasProp(theme, 'conversation-chair-south', 'armchair', 240, 224),
    atlasProp(theme, 'conversation-chair-west', 'armchair', 160, 160),
    atlasProp(theme, 'conversation-chair-east', 'armchair', 336, 160),
  ];
}

function textRoom(theme: WorldTheme): WorldProp[] {
  return [
    redRug(theme, 'text-rug', 208, 160),
    wallProp(theme, 'text-window', 'window', 240, 32),
    wallProp(theme, 'text-art', 'art', 352, 32),
    atlasProp(theme, 'text-books', 'bookshelf', 48, 88),
    atlasProp(theme, 'text-books-right', 'bookshelf', 432, 88),
    atlasProp(theme, 'text-plant', 'planter', 448, 96),
    atlasProp(theme, 'text-desk-left', 'desk', 144, 144),
    atlasProp(theme, 'text-chair-left', 'chair', 144, 192),
    atlasProp(theme, 'text-desk-right', 'desk', 336, 144),
    atlasProp(theme, 'text-chair-right', 'chair', 336, 192),
    atlasProp(theme, 'text-bench', 'sofa', 240, 96),
  ];
}

function workshopRoom(theme: WorldTheme): WorldProp[] {
  return [
    wallProp(theme, 'workshop-window-left', 'window', 144, 32),
    wallProp(theme, 'workshop-window-right', 'window', 336, 32),
    wallProp(theme, 'workshop-art', 'art', 248, 32),
    atlasProp(theme, 'workshop-books-left', 'bookshelf', 48, 88),
    atlasProp(theme, 'workshop-books-right', 'bookshelf', 432, 88),
    atlasProp(theme, 'workshop-table-left', 'table', 144, 144),
    atlasProp(theme, 'workshop-chair-left', 'chair', 144, 192),
    atlasProp(theme, 'workshop-table-right', 'table', 336, 144),
    atlasProp(theme, 'workshop-chair-right', 'chair', 336, 192),
    atlasProp(theme, 'workshop-plant', 'planter', 248, 96),
    atlasProp(theme, 'workshop-crate-left', 'desk', 224, 240),
    atlasProp(theme, 'workshop-crate-right', 'desk', 256, 240),
  ];
}

function stageRoom(theme: WorldTheme, accent: string): WorldProp[] {
  return [
    redRug(theme, 'stage-rug', 208, 144),
    wallProp(theme, 'stage-curtain-left', 'curtain', 144, 32),
    wallProp(theme, 'stage-curtain-right', 'curtain', 336, 32),
    screen('stage-screen', 208, 16, accent),
    atlasProp(theme, 'stage-books', 'bookshelf', 48, 88),
    atlasProp(theme, 'stage-plant', 'planter', 448, 96),
    atlasProp(theme, 'stage-podium', 'desk', 240, 112),
    atlasProp(theme, 'stage-bench-one', 'sofa', 96, 224),
    atlasProp(theme, 'stage-bench-two', 'sofa', 160, 224),
    atlasProp(theme, 'stage-bench-three', 'sofa', 320, 224),
    atlasProp(theme, 'stage-bench-four', 'sofa', 384, 224),
  ];
}

function mediaRoom(theme: WorldTheme, accent: string): WorldProp[] {
  return [
    blueRug(theme, 'media-rug', 208, 160),
    wallProp(theme, 'media-curtain-left', 'curtain', 144, 32),
    wallProp(theme, 'media-curtain-right', 'curtain', 336, 32),
    screen('media-screen', 208, 16, accent),
    atlasProp(theme, 'media-books', 'bookshelf', 48, 88),
    atlasProp(theme, 'media-plant', 'planter', 448, 96),
    atlasProp(theme, 'media-desk-left', 'desk', 144, 160),
    atlasProp(theme, 'media-chair-left', 'chair', 144, 208),
    atlasProp(theme, 'media-desk-right', 'desk', 336, 160),
    atlasProp(theme, 'media-chair-right', 'chair', 336, 208),
    atlasProp(theme, 'media-console-left', 'table', 224, 112),
    atlasProp(theme, 'media-console-right', 'table', 256, 112),
  ];
}

function oddmentsRoom(theme: WorldTheme): WorldProp[] {
  return [
    redRug(theme, 'oddments-rug', 208, 160),
    wallProp(theme, 'oddments-window', 'window', 288, 32),
    wallProp(theme, 'oddments-art-left', 'art', 192, 32),
    wallProp(theme, 'oddments-art-right', 'art', 344, 32),
    atlasProp(theme, 'oddments-books-left', 'bookshelf', 48, 88),
    atlasProp(theme, 'oddments-books-right', 'bookshelf', 416, 216),
    atlasProp(theme, 'oddments-table', 'table', 112, 144),
    atlasProp(theme, 'oddments-chair', 'chair', 160, 160),
    atlasProp(theme, 'oddments-armchair', 'armchair', 320, 128),
    atlasProp(theme, 'oddments-bench', 'sofa', 352, 240),
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
  const shell = { tileScale: 2, borderSize: 16, wallHeight: 48 } as const;
  switch (type) {
    case 'voice':
    case 'text':
      return { ...shell, wallPanel: BRICK_WALL, floorTile: HEARTH_FLOOR };
    case 'forum':
    case 'announcement':
    case 'stage':
      return { ...shell, wallPanel: CARVED_WALL, floorTile: SANDSTONE_FLOOR };
    case 'media':
    case 'unsupported':
      return { ...shell, wallPanel: CARVED_WALL, floorTile: DARK_FLOOR };
    default:
      return { ...shell, wallPanel: BRICK_WALL, floorTile: HEARTH_FLOOR };
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
    colliders: [...wallColliders, ...props.filter((item) => item.solid).map(propCollider)],
  };
}
