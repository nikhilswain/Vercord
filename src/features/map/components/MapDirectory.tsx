import { orderedMapAreas, orderedMapRooms } from '../../../domain/map/order';
import type { MapSnapshot } from '../../../domain/map/snapshot';
import type { RoomExplorerController } from '../use-room-explorer';
import { RoomTypeIcon } from './RoomTypeIcon';

export interface MapDirectoryProps {
  snapshot: MapSnapshot;
  explorer: RoomExplorerController;
}

export function MapDirectory({ snapshot, explorer }: MapDirectoryProps) {
  return (
    <nav className="map-directory" aria-label="Room directory">
      <h2>Room directory</h2>
      {orderedMapAreas(snapshot).map((area) => {
        const rooms = orderedMapRooms(area);
        return (
          <section className="map-directory-area" key={area.key}>
            <div className="map-directory-heading">
              <h3>{area.label}</h3>
              <span>{rooms.length + (rooms.length === 1 ? ' room' : ' rooms')}</span>
            </div>
            <ul>
              {rooms.map((room) => {
                const selected = explorer.selectedRoomKey === room.key;
                const muted =
                  explorer.matchingRoomKeys !== null && !explorer.matchingRoomKeys.has(room.key);
                return (
                  <li key={room.key}>
                    <button
                      className={
                        'map-directory-room' +
                        (selected ? ' is-selected' : '') +
                        (muted ? ' is-muted' : '')
                      }
                      type="button"
                      aria-pressed={selected}
                      onClick={(event) => explorer.selectRoom(room.key, event.currentTarget)}
                    >
                      <RoomTypeIcon type={room.type} />
                      <span className="map-directory-label">{room.label}</span>
                      <span className="map-directory-type">{room.type}</span>
                      {selected ? <span className="map-directory-selected">✓ Selected</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
