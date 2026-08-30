import type { AtlasGeometry } from '../../../domain/layout/geometry';
import {
  MAP_AREA_LABEL_LIMIT,
  MAP_ROOM_LABEL_LIMIT,
  truncateMapLabel,
} from '../../../domain/map/labels';
import { orderedMapAreas, orderedMapRooms } from '../../../domain/map/order';
import type { MapSnapshot } from '../../../domain/map/snapshot';
import { RoomTypeIcon } from './RoomTypeIcon';

const AREA_ROOM_COUNT_LANE_WIDTH = 96;

export interface AtlasMapProps {
  snapshot: MapSnapshot;
  geometry: AtlasGeometry;
  selectedRoomKey: string | null;
  matchingRoomKeys: ReadonlySet<string> | null;
  onSelectRoom?: (roomKey: string) => void;
}

export function AtlasMap({
  snapshot,
  geometry,
  selectedRoomKey,
  matchingRoomKeys,
  onSelectRoom,
}: AtlasMapProps) {
  const areas = orderedMapAreas(snapshot);
  return (
    <>
      <defs>
        <pattern id="atlas-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M32 0H0V32" />
        </pattern>
        {geometry.areas.flatMap((area, areaIndex) => [
          <clipPath id={'area-clip-' + areaIndex} key={'area-clip-' + areaIndex}>
            <rect
              x={area.x + 24}
              y={area.y + 18}
              width={area.width - 48 - AREA_ROOM_COUNT_LANE_WIDTH}
              height={32}
            />
          </clipPath>,
          ...area.rooms.map((room, roomIndex) => (
            <clipPath
              id={'room-clip-' + areaIndex + '-' + roomIndex}
              key={'room-clip-' + areaIndex + '-' + roomIndex}
            >
              <rect x={room.x + 38} y={room.y + 8} width={room.width - 48} height={36} />
            </clipPath>
          )),
        ])}
      </defs>
      <rect
        data-layer="grid"
        className="atlas-grid"
        width={geometry.width}
        height={geometry.height}
        fill="url(#atlas-grid)"
        aria-hidden="true"
      />
      <g data-layer="routes" aria-hidden="true">
        {geometry.routes.map((route) => (
          <path
            key={route.key}
            className={'atlas-route atlas-route--' + route.variant}
            d={
              'M ' +
              route.start.x +
              ' ' +
              route.start.y +
              ' C ' +
              route.controlA.x +
              ' ' +
              route.controlA.y +
              ', ' +
              route.controlB.x +
              ' ' +
              route.controlB.y +
              ', ' +
              route.end.x +
              ' ' +
              route.end.y
            }
          />
        ))}
      </g>
      <g data-layer="districts">
        {geometry.areas.map((area, areaIndex) => {
          const sourceArea = areas[areaIndex]!;
          const rooms = orderedMapRooms(sourceArea);
          return (
            <g key={sourceArea.key} className={'atlas-area atlas-area--' + area.variant}>
              <title>{sourceArea.label}</title>
              <rect x={area.x} y={area.y} width={area.width} height={area.height} rx="18" />
              <text x={area.x + 24} y={area.y + 34} clipPath={'url(#area-clip-' + areaIndex + ')'}>
                {truncateMapLabel(sourceArea.label, MAP_AREA_LABEL_LIMIT)}
              </text>
              <text
                className="atlas-room-count"
                x={area.x + area.width - 24}
                y={area.y + 34}
                textAnchor="end"
              >
                {rooms.length + ' ' + (rooms.length === 1 ? 'room' : 'rooms')}
              </text>
              {area.rooms.map((room, roomIndex) => {
                const sourceRoom = rooms[roomIndex]!;
                const selected = sourceRoom.key === selectedRoomKey;
                const muted = matchingRoomKeys !== null && !matchingRoomKeys.has(sourceRoom.key);
                return (
                  <g
                    key={sourceRoom.key}
                    className={
                      'atlas-room' +
                      (onSelectRoom ? ' atlas-room--interactive' : '') +
                      (selected ? ' is-selected' : '') +
                      (muted ? ' is-muted' : '')
                    }
                    onClick={onSelectRoom ? () => onSelectRoom(sourceRoom.key) : undefined}
                  >
                    <title>{sourceRoom.label}</title>
                    <rect x={room.x} y={room.y} width={room.width} height={room.height} rx="12" />
                    <g transform={'translate(' + (room.x + 12) + ' ' + (room.y + 16) + ')'}>
                      <RoomTypeIcon type={sourceRoom.type} />
                    </g>
                    <text
                      x={room.x + 40}
                      y={room.y + 32}
                      clipPath={'url(#room-clip-' + areaIndex + '-' + roomIndex + ')'}
                    >
                      {truncateMapLabel(sourceRoom.label, MAP_ROOM_LABEL_LIMIT)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </g>
    </>
  );
}
