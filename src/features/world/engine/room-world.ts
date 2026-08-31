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
  tint?: string,
): WorldProp {
  return { id, kind, x, y, width, height, solid: true, tint };
}

function roomProps(type: MapRoomType, accent: string): WorldProp[] {
  const common = [
    prop('bookshelf', 'bookshelf', 84, 78, 148, 44),
    prop('plant', 'planter', 762, 82, 48, 48, accent),
  ];

  switch (type) {
    case 'voice':
      return [
        ...common,
        prop('sofa-left', 'sofa', 156, 216, 168, 64, accent),
        prop('sofa-right', 'sofa', 572, 216, 168, 64, accent),
        prop('coffee-table', 'table', 354, 276, 188, 88),
      ];
    case 'stage':
      return [
        ...common,
        prop('stage-screen', 'screen', 286, 82, 324, 72, accent),
        prop('front-row', 'sofa', 208, 300, 208, 56, accent),
        prop('back-row', 'sofa', 480, 300, 208, 56, accent),
      ];
    case 'forum':
      return [
        ...common,
        prop('forum-table', 'table', 250, 202, 396, 132, accent),
        prop('reference-shelf', 'bookshelf', 84, 398, 176, 44),
      ];
    case 'media':
      return [
        ...common,
        prop('media-screen', 'screen', 262, 78, 372, 82, accent),
        prop('editing-desk-left', 'desk', 174, 282, 180, 70),
        prop('editing-desk-right', 'desk', 542, 282, 180, 70),
      ];
    case 'announcement':
      return [
        ...common,
        prop('announcement-screen', 'screen', 258, 78, 380, 84, accent),
        prop('speaker-desk', 'desk', 344, 272, 208, 76, accent),
      ];
    case 'unsupported':
      return [
        ...common,
        prop('oddments-table', 'table', 312, 216, 272, 132, accent),
        prop('oddments-sofa', 'sofa', 324, 400, 248, 60, accent),
      ];
    default:
      return [
        ...common,
        prop('desk-left', 'desk', 172, 224, 184, 72, accent),
        prop('desk-right', 'desk', 540, 224, 184, 72, accent),
        prop('lounge', 'sofa', 324, 398, 248, 60, accent),
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
      ...props.map(({ x, y, width, height }) => ({ x, y, width, height })),
    ],
  };
}
