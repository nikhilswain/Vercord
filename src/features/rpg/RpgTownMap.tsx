import type { WorldTown } from '../../domain/world/protocol';
import type { Point } from '../world/engine/types';
import { RoomTypeIcon } from '../map/components/RoomTypeIcon';
import { RpgSceneMap } from './RpgSceneMap';
import { activeTownStreet, ROOM_TYPE_LABELS } from './town-presentation';
import type { RpgSample, RpgThemeId, RpgUiState } from './types';

interface Props {
  town: WorldTown;
  displayName: string;
  theme: RpgThemeId;
  sample: RpgSample;
  ui: RpgUiState;
  onStreet(street: string): void;
  onFocus?(point: Point): void;
}

export function RpgTownMap({ town, displayName, theme, sample, ui, onStreet, onFocus }: Props) {
  const active = activeTownStreet(town);
  const inDungeon = theme === 'dungeon';
  if (town.continuous) {
    const places = new Map(sample.landmarks.map((landmark) => [landmark.id, landmark]));
    return (
      <div className="rpg-town-map">
        <p className="rpg-town-name">
          <bdi>{displayName}</bdi>
        </p>
        <p className="rpg-muted">
          {inDungeon
            ? 'Return to the town to find a channel house.'
            : 'One town, connected by paths. Find a neighborhood or show a channel house on the map.'}
        </p>
        <RpgSceneMap theme={theme} ui={ui} sample={sample} showDirectory={false} />
        <nav className="rpg-town-directory" aria-label="Town neighborhoods and channel houses">
          <button
            className="rpg-street-link"
            onClick={() =>
              inDungeon ? onStreet('square') : onFocus?.(places.get('town-square') ?? sample.spawn)
            }
          >
            <strong>Town square</strong>
            <span>{inDungeon ? 'Return to town' : 'Show'}</span>
          </button>
          {town.districts.map((district) => {
            const rooms = district.streets.flatMap((street) => street.rooms);
            const houses = rooms.flatMap((room) => {
              const house = places.get(room.landmarkId);
              return house ? [house] : [];
            });
            const center =
              district.anchors?.[0] ??
              (houses.length
                ? {
                    x:
                      (Math.min(...houses.map((house) => house.x)) +
                        Math.max(...houses.map((house) => house.x))) /
                      2,
                    y:
                      (Math.min(...houses.map((house) => house.y)) +
                        Math.max(...houses.map((house) => house.y))) /
                      2,
                  }
                : null);
            return (
              <details key={district.key} className="rpg-neighborhood">
                <summary>
                  <bdi>{district.label}</bdi>
                  <span>
                    {rooms.length} {rooms.length === 1 ? 'house' : 'houses'}
                  </span>
                </summary>
                <div className="rpg-streets">
                  {center && onFocus && !inDungeon && (
                    <button className="rpg-street-link" onClick={() => onFocus(center)}>
                      <strong>Show neighborhood</strong>
                      <span>Show</span>
                    </button>
                  )}
                  {rooms.map((room) => {
                    const house = places.get(room.landmarkId);
                    const content = (
                      <>
                        <span className="rpg-house-entry">
                          <svg className="rpg-room-symbol" viewBox="0 0 20 20" aria-hidden="true">
                            <RoomTypeIcon type={room.type} />
                          </svg>
                          <span>
                            <bdi>{room.label}</bdi>
                            <small>{ROOM_TYPE_LABELS[room.type]} channel</small>
                          </span>
                        </span>
                      </>
                    );
                    return house && onFocus && !inDungeon ? (
                      <button
                        key={room.key}
                        className="rpg-street-link rpg-house-link"
                        onClick={() => onFocus(house)}
                        aria-label={`Show ${room.label} on the map`}
                      >
                        {content}
                        <span>Show</span>
                      </button>
                    ) : (
                      <div key={room.key} className="rpg-house-list-entry">
                        {content}
                      </div>
                    );
                  })}
                  {rooms.length === 0 && (
                    <p className="rpg-muted">
                      No channel houses are visible to you in this neighborhood.
                    </p>
                  )}
                </div>
              </details>
            );
          })}
        </nav>
        {town.districts.length === 0 && (
          <p className="rpg-town-empty">
            No channel houses are visible to you yet. You can still explore the town square and the
            Lantern Vault.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="rpg-town-map">
      <p className="rpg-town-name">
        <bdi>{displayName}</bdi>
      </p>
      <p className="rpg-muted">
        Choose a neighborhood, then a street. Each named house marks a channel.
      </p>
      <nav className="rpg-town-directory" aria-label="Town neighborhoods">
        <button
          className="rpg-street-link"
          aria-current={!active && !inDungeon ? 'location' : undefined}
          onClick={() => onStreet('square')}
        >
          <strong>Town square</strong>
          <span>{!active && !inDungeon ? 'Here' : 'Visit'}</span>
        </button>
        {town.districts.map((district) => (
          <details
            key={district.key}
            className="rpg-neighborhood"
            open={district.key === active?.district.key}
          >
            <summary>
              <bdi>{district.label}</bdi>
              <span>
                {district.streets.length === 1 ? '1 street' : `${district.streets.length} streets`}
              </span>
            </summary>
            <div className="rpg-streets">
              {district.streets.map((street) => {
                const here = street.id === town.activeStreetId && !inDungeon;
                return (
                  <button
                    key={street.id}
                    className="rpg-street-link"
                    aria-current={here ? 'location' : undefined}
                    onClick={() => onStreet(street.id)}
                  >
                    <strong>Street {street.number}</strong>
                    <span>{here ? 'Here' : 'Visit'}</span>
                  </button>
                );
              })}
            </div>
          </details>
        ))}
      </nav>
      {town.districts.length === 0 && (
        <p className="rpg-town-empty">
          No channel houses are visible to you yet. You can still explore the town square and the
          Lantern Vault.
        </p>
      )}
      <h3 className="rpg-town-current">
        <bdi>{sample.name}</bdi>
        {active && !inDungeon && <span>Street {active.street.number} · Channel houses</span>}
        {inDungeon && <span>Choose a street above to return to the town.</span>}
      </h3>
      {active && !inDungeon && active.street.rooms.length === 0 && (
        <p className="rpg-muted">
          No channel houses are visible on this street. Choose another street or visit the town
          square.
        </p>
      )}
      <RpgSceneMap
        theme={theme}
        ui={ui}
        sample={sample}
        bindings={
          active && !inDungeon
            ? active.street.rooms.map((room) => ({ landmarkId: room.landmarkId, rooms: [room] }))
            : undefined
        }
      />
    </div>
  );
}
