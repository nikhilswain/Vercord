import type { SafeRoomDetails } from '../use-room-explorer';

export interface RoomDetailsProps {
  details: SafeRoomDetails | null;
  onClose: () => void;
}

export function RoomDetails({ details, onClose }: RoomDetailsProps) {
  return (
    <section className="room-details" role="region" aria-label="Room details">
      {details ? (
        <>
          <div className="room-details-heading">
            <div>
              <p>Selected room</p>
              <h2>{details.roomLabel}</h2>
            </div>
            <button
              type="button"
              className="room-details-close"
              aria-label="Close room details"
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <dl>
            <div>
              <dt>Type</dt>
              <dd>{details.roomType}</dd>
            </div>
            <div>
              <dt>Area</dt>
              <dd>{details.areaLabel}</dd>
            </div>
            <div>
              <dt>World point</dt>
              <dd>{'(' + details.coordinate.x + ', ' + details.coordinate.y + ')'}</dd>
            </div>
          </dl>
        </>
      ) : (
        <>
          <h2>Room details</h2>
          <p>Select a room from the map, search, or directory to inspect its safe atlas facts.</p>
        </>
      )}
    </section>
  );
}
