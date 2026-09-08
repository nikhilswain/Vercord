import type { SavedWorldResponse } from '../../domain/world/protocol';
import { RoomTypeIcon } from '../map/components/RoomTypeIcon';
import { ROOM_TYPE_LABELS } from './town-presentation';
import { RPG_THEMES } from './themes';
import type { RpgSample, RpgThemeId, RpgUiState } from './types';

interface Props {
  theme: RpgThemeId;
  ui: RpgUiState;
  sample: RpgSample;
  bindings?: SavedWorldResponse['bindings'];
}

export function RpgSceneMap({ theme, ui, sample, bindings }: Props) {
  const { bounds } = sample;
  return (
    <>
      <svg
        className="rpg-map"
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
        role="img"
        aria-label={`${sample.name}, landmarks and your current position`}
      >
        <rect {...bounds} fill={RPG_THEMES[theme].map.ground} />
        {sample.colliders.map((box, index) => (
          <rect key={index} {...box} fill={RPG_THEMES[theme].map.obstacle} />
        ))}
        {sample.landmarks.map((landmark, index) => (
          <g key={landmark.id} transform={`translate(${landmark.x},${landmark.y})`}>
            <title>{landmark.name}</title>
            <circle r="27" fill="#efe3be" stroke="#392d23" strokeWidth="5" />
            <text textAnchor="middle" dy="11" fontSize="32" fontWeight="700" fill="#30291f">
              {index + 1}
            </text>
          </g>
        ))}
        <circle
          className="rpg-map-player"
          cx={ui.position.x}
          cy={ui.position.y}
          r="15"
          fill="#ffd278"
          stroke="#30291f"
          strokeWidth="6"
        />
      </svg>
      <p className="rpg-muted">The gold dot is you. Places are numbered below.</p>
      <ol className={`rpg-landmarks${bindings ? ' rpg-landmarks--town' : ''}`}>
        {sample.landmarks.map((landmark) => {
          const rooms =
            bindings?.find((binding) => binding.landmarkId === landmark.id)?.rooms ?? [];
          return (
            <li key={landmark.id}>
              {rooms.length ? (
                rooms.map((room) => (
                  <span className="rpg-house-entry" key={room.key}>
                    <svg className="rpg-room-symbol" viewBox="0 0 20 20" aria-hidden="true">
                      <RoomTypeIcon type={room.type} />
                    </svg>
                    <span>
                      <bdi>{room.label}</bdi>
                      <small>{ROOM_TYPE_LABELS[room.type]} channel</small>
                    </span>
                  </span>
                ))
              ) : (
                <bdi>{landmark.name}</bdi>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
