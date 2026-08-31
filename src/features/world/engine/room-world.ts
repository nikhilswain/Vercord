import type { MapRoomType } from '../../../domain/map/snapshot';
import type { Rect, WorldDefinition, WorldPortal, WorldProp, WorldTheme } from './types';

const ROOM_WIDTH = 896;
const ROOM_HEIGHT = 640;
const WALL_DEPTH = 48;
const DOOR_LEFT = 400;
const DOOR_RIGHT = 496;

function prop(
  id: string,
  kind: WorldProp['kind'],
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    solid?: boolean;
    layer?: WorldProp['layer'];
    hitbox?: Rect;
    tint?: string;
  } = {},
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

function roomProps(type: MapRoomType, accent: string): WorldProp[] {
  const common = [
    prop('bookshelf', 'bookshelf', 72, 72, 96, 144),
    prop('plant', 'planter', 776, 88, 48, 48, {
      hitbox: { x: 12, y: 24, width: 24, height: 24 },
    }),
  ];
  const rug = (id: string, x = 328, y = 196): WorldProp =>
    prop(id, 'rug', x, y, 240, 240, { solid: false, layer: 'floor', tint: accent });

  switch (type) {
    case 'voice':
      return [
        rug('voice-rug'),
        ...common,
        prop('sofa-left', 'sofa', 156, 260, 144, 96),
        prop('sofa-right', 'sofa', 596, 260, 144, 96),
        prop('coffee-table', 'table', 376, 272, 144, 96),
      ];
    case 'stage':
      return [
        rug('stage-rug', 328, 210),
        ...common,
        prop('stage-screen', 'screen', 384, 68, 128, 128),
        prop('front-row', 'sofa', 196, 340, 144, 96),
        prop('back-row', 'sofa', 556, 340, 144, 96),
      ];
    case 'forum':
      return [
        rug('forum-rug', 328, 188),
        ...common,
        prop('forum-table', 'table', 376, 256, 144, 96),
        prop('chair-left', 'chair', 304, 256, 48, 96),
        prop('chair-right', 'chair', 544, 256, 48, 96),
        prop('reference-shelf', 'bookshelf', 728, 360, 96, 144),
      ];
    case 'media':
      return [
        rug('media-rug', 328, 216),
        ...common,
        prop('media-screen', 'screen', 384, 68, 128, 128),
        prop('editing-desk-left', 'desk', 176, 280, 144, 96),
        prop('editing-chair-left', 'chair', 328, 280, 48, 96),
        prop('editing-desk-right', 'desk', 576, 280, 144, 96),
        prop('editing-chair-right', 'chair', 520, 280, 48, 96),
      ];
    case 'announcement':
      return [
        rug('announcement-rug', 328, 210),
        ...common,
        prop('announcement-screen', 'screen', 384, 68, 128, 128),
        prop('speaker-desk', 'desk', 376, 284, 144, 96),
      ];
    case 'unsupported':
      return [
        rug('oddments-rug', 328, 188),
        ...common,
        prop('oddments-table', 'table', 376, 252, 144, 96),
        prop('oddments-chair', 'chair', 544, 252, 48, 96),
        prop('oddments-sofa', 'sofa', 160, 404, 144, 96),
      ];
    default:
      return [
        rug('text-rug', 328, 208),
        ...common,
        prop('desk-left', 'desk', 176, 272, 144, 96),
        prop('chair-left', 'chair', 328, 272, 48, 96),
        prop('desk-right', 'desk', 576, 272, 144, 96),
        prop('chair-right', 'chair', 520, 272, 48, 96),
        prop('lounge', 'sofa', 640, 420, 144, 96),
      ];
  }
}

export function createRoomWorld(portal: WorldPortal, theme: WorldTheme): WorldDefinition {
  const props = roomProps(portal.room.type, portal.accent);
  const wallColliders: Rect[] = [
    { x: 0, y: 0, width: ROOM_WIDTH, height: WALL_DEPTH },
    { x: 0, y: 0, width: WALL_DEPTH, height: ROOM_HEIGHT },
    { x: ROOM_WIDTH - WALL_DEPTH, y: 0, width: WALL_DEPTH, height: ROOM_HEIGHT },
    { x: 0, y: ROOM_HEIGHT - WALL_DEPTH, width: DOOR_LEFT, height: WALL_DEPTH },
    {
      x: DOOR_RIGHT,
      y: ROOM_HEIGHT - WALL_DEPTH,
      width: ROOM_WIDTH - DOOR_RIGHT,
      height: WALL_DEPTH,
    },
  ];
  const exit: WorldPortal = {
    x: ROOM_WIDTH / 2,
    y: ROOM_HEIGHT - 76,
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
    bounds: { x: 0, y: 0, width: ROOM_WIDTH, height: ROOM_HEIGHT },
    spawn: { x: ROOM_WIDTH / 2, y: ROOM_HEIGHT - 126 },
    areas: [
      {
        key: portal.areaKey,
        label: `#${portal.room.label}`,
        accent: portal.accent,
        bounds: {
          x: WALL_DEPTH,
          y: WALL_DEPTH,
          width: ROOM_WIDTH - WALL_DEPTH * 2,
          height: ROOM_HEIGHT - WALL_DEPTH * 2,
        },
        roomCount: 1,
      },
    ],
    paths: [],
    tileLayers: [],
    portals: [exit],
    props,
    colliders: [
      ...wallColliders,
      ...props.filter((item) => item.solid).map((item) => ({
        x: item.x + (item.hitbox?.x ?? 0),
        y: item.y + (item.hitbox?.y ?? 0),
        width: item.hitbox?.width ?? item.width,
        height: item.hitbox?.height ?? item.height,
      })),
    ],
  };
}
