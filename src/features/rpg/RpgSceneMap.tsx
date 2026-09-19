import { useEffect, useRef, useState } from 'react';
import type { SavedWorldResponse } from '../../domain/world/protocol';
import { RoomTypeIcon } from '../map/components/RoomTypeIcon';
import { ROOM_TYPE_LABELS } from './town-presentation';
import { RPG_THEMES } from './themes';
import type { RpgSample, RpgThemeId, RpgUiState } from './types';
import { DestinationActions, NavigationMapRoute } from './navigation/NavigationControls';
import { navigationScene, pointDestination } from './navigation/destinations';
import type { NavigationActions } from './navigation/types';

interface Props extends NavigationActions {
  theme: RpgThemeId;
  ui: RpgUiState;
  sample: RpgSample;
  bindings?: SavedWorldResponse['bindings'];
  showDirectory?: boolean;
}

export function RpgSceneMap({
  theme,
  ui,
  sample,
  bindings,
  showDirectory = true,
  navigation,
  onNavigate,
  onStopNavigation,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const selected = sample.landmarks.find((p) => p.id === selectedId);
  useEffect(() => {
    if (selectedId) actionsRef.current?.querySelector('button')?.focus();
  }, [selectedId]);
  const { bounds } = sample;
  const numbered = showDirectory && sample.landmarks.length <= 80;
  const playerRadius = Math.max(15, Math.max(bounds.width, bounds.height) / 100);
  return (
    <>
      <svg
        className="rpg-map"
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
        role="group"
        aria-label={`${sample.name}, landmarks and your current position`}
      >
        <rect {...bounds} fill={RPG_THEMES[theme].map.ground} />
        {sample.terrain?.roads.map((road, index) => (
          <rect
            key={`road:${index}`}
            {...road}
            fill={RPG_THEMES[theme].map.obstacle}
            opacity="0.4"
          />
        ))}
        {sample.colliders.map((box, index) => (
          <rect key={index} {...box} fill={RPG_THEMES[theme].map.obstacle} />
        ))}
        {sample.landmarks.map((landmark, index) => (
          <g
            key={landmark.id}
            transform={`translate(${landmark.x},${landmark.y})`}
            role="button"
            tabIndex={0}
            aria-label={`Select ${landmark.name}`}
            onClick={() => setSelectedId(landmark.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSelectedId(landmark.id);
              }
            }}
          >
            <title>{landmark.name}</title>
            <circle r={numbered ? 27 : 14} fill="#efe3be" stroke="#392d23" strokeWidth="5" />
            {numbered && (
              <text textAnchor="middle" dy="11" fontSize="32" fontWeight="700" fill="#30291f">
                {index + 1}
              </text>
            )}
          </g>
        ))}
        <NavigationMapRoute
          state={navigation}
          position={ui.position}
          scene={navigationScene(sample)}
        />
        <circle
          className="rpg-map-player"
          cx={ui.position.x}
          cy={ui.position.y}
          r={playerRadius}
          fill="#ffd278"
          stroke="#30291f"
          strokeWidth={playerRadius * 0.4}
        />
      </svg>
      <p className="rpg-muted">
        The gold dot is you.
        {numbered ? ' Places are numbered below.' : ' Pale dots mark houses and places.'}
      </p>
      {selected && (
        <div ref={actionsRef}>
          <DestinationActions
            key={selected.id}
            target={pointDestination(sample, selected)}
            navigation={navigation}
            onNavigate={onNavigate}
            onStopNavigation={onStopNavigation}
          />
        </div>
      )}
      {showDirectory && (
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
                {onNavigate && (
                  <button
                    className="rpg-button rpg-button--quiet"
                    onClick={() => setSelectedId(landmark.id)}
                  >
                    Select destination
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
