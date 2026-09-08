import type { WorldTown } from '../../domain/world/protocol';
import { RpgSceneMap } from './RpgSceneMap';
import { activeTownStreet } from './town-presentation';
import type { RpgSample, RpgThemeId, RpgUiState } from './types';

interface Props {
  town: WorldTown;
  displayName: string;
  theme: RpgThemeId;
  sample: RpgSample;
  ui: RpgUiState;
  onStreet(street: string): void;
}

export function RpgTownMap({ town, displayName, theme, sample, ui, onStreet }: Props) {
  const active = activeTownStreet(town);
  const inDungeon = theme === 'dungeon';
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
