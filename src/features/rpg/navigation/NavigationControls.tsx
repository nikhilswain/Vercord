import { useState } from 'react';
import { AtlasIcon } from '../atlas/AtlasIcon';
import type { Point } from '../../../domain/world/content/v1/types';
import {
  NAVIGATION_UNREACHABLE,
  type NavigationActions,
  type NavigationState,
  type NavigationTarget,
} from './types';
import './navigation.css';

export function DestinationActions({
  target,
  navigation,
  onNavigate,
  onStopNavigation,
  onLook,
  onEdit,
  heading = true,
}: NavigationActions & {
  target: NavigationTarget;
  onLook?(): void;
  onEdit?(): void;
  heading?: boolean;
}) {
  const [error, setError] = useState('');
  const active =
    navigation?.target.id === target.id &&
    (target.kind === 'region' ||
      (navigation.target.kind !== 'region' && navigation.target.scene === target.scene));
  return (
    <section className="rpg-destination-actions" aria-label={`${target.name} destination`}>
      {heading && (
        <div className="rpg-destination-heading">
          <AtlasIcon name="location" />
          <div>
            <small>
              {target.kind === 'pin'
                ? 'Your pin'
                : target.kind === 'region'
                  ? 'Region'
                  : 'Destination'}
            </small>
            <h3>
              <bdi>{target.name}</bdi>
            </h3>
          </div>
        </div>
      )}
      <div className="rpg-destination-buttons">
        {onNavigate && (
          <button
            className="rpg-button"
            onClick={() => {
              if (active && onStopNavigation) {
                onStopNavigation();
                setError('');
                return;
              }
              const result = onNavigate(target);
              setError(result.ok ? '' : result.message);
            }}
          >
            {active ? 'Stop navigation' : 'Navigate to'}
          </button>
        )}
        {onLook && (
          <button className="rpg-button rpg-button--quiet" onClick={onLook}>
            Look here
          </button>
        )}
        {onEdit && (
          <button className="rpg-button rpg-button--quiet" onClick={onEdit}>
            Edit pin
          </button>
        )}
      </div>
      {error && (
        <p className="rpg-navigation-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function NavigationHud({
  state,
  onStop,
  onRetry,
}: {
  state: NavigationState;
  onStop(): void;
  onRetry(): void;
}) {
  return (
    <section className="rpg-navigation-hud" aria-label="Navigation">
      <AtlasIcon name="location" />
      <div>
        <span className="rpg-navigation-caption">
          {state.status === 'blocked'
            ? 'Trail interrupted'
            : state.status === 'portal'
              ? 'At the crossing'
              : 'Following the trail'}
        </span>
        <strong title={state.target.name}>
          <bdi>{state.target.name}</bdi>
        </strong>
        {state.portal && (
          <small>
            Follow trail to {state.portal} <kbd>E</kbd>
          </small>
        )}
        {state.status === 'blocked' && <p>{NAVIGATION_UNREACHABLE}</p>}
      </div>
      {state.status === 'blocked' && (
        <button className="rpg-button rpg-button--quiet" onClick={onRetry}>
          Retry
        </button>
      )}
      <button aria-label="Stop navigation" title="Stop navigation" onClick={onStop}>
        <AtlasIcon name="close" />
      </button>
    </section>
  );
}

export function NavigationMapRoute({
  state,
  position,
  scene,
}: {
  state?: NavigationState | null;
  position: Point;
  scene: string;
}) {
  if (!state || state.scene !== scene || state.status !== 'guiding' || state.path.length < 2)
    return null;
  return (
    <path
      className="rpg-navigation-map-route"
      d={`M${position.x},${position.y} ${state.path
        .slice(1)
        .map((p) => `L${p.x},${p.y}`)
        .join(' ')}`}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}
