import { useMemo, useState } from 'react';
import {
  FOREST_LINKS,
  FOREST_REGIONS,
  FOREST_REGION_IDS,
  forestNeighbors,
  forestAreaName,
  isTempleAreaId,
  type ForestRegionId,
} from '../../../domain/world/forest/catalog';
import { RpgDialog } from '../ui/RpgDialog';
import type { RpgSample, RpgUiState } from '../types';
import type { Point } from '../../world/engine/types';
import RpgAtlasDialog from '../atlas/RpgAtlasDialog';
import { DestinationActions } from '../navigation/NavigationControls';
import { regionDestination, regionRoute } from '../navigation/destinations';
import type { NavigationActions } from '../navigation/types';
import './forest.css';
import { JourneyMapNote, type JourneyMapProps } from '../journal/JourneyMapNote';

const chartPoint = (id: ForestRegionId) => {
  const [x, y] = FOREST_REGIONS[id].grid;
  return { x: 78 + x * 142, y: 66 + y * 124 };
};

export function ForestMap({
  sample,
  ui,
  onClose,
  onFocus,
  scope,
  navigation,
  onNavigate,
  onStopNavigation,
  onJourney,
  objective,
  focusAt,
}: NavigationActions &
  JourneyMapProps & {
    scope: string;
    sample: RpgSample;
    ui: RpgUiState;
    onClose(): void;
    onFocus?(point: Point): void;
    focusAt?: Point | null;
  }) {
  const currentArea = sample.temple ?? sample.forest?.region ?? 'town';
  const current = sample.temple ? 'rootbound-reach' : currentArea;
  const objectiveRegion = objective?.target.area;
  const [selected, setSelected] = useState<ForestRegionId>(
    objectiveRegion && objectiveRegion !== 'town'
      ? isTempleAreaId(objectiveRegion)
        ? 'rootbound-reach'
        : objectiveRegion
      : current === 'town'
        ? 'verge'
        : isTempleAreaId(current)
          ? 'rootbound-reach'
          : current,
  );
  const [local, setLocal] = useState(
    Boolean(
      (sample.temple && (!objective || objectiveRegion === currentArea)) ||
      (sample.forest && (focusAt || (objective && objectiveRegion === currentArea))),
    ),
  );
  const visited = new Set(ui.exploration?.visited ?? (current === 'town' ? [] : [current]));
  const discoveredKey = (ui.exploration?.discovered ?? []).join(',');
  const localSample = useMemo(() => {
    const discovered = new Set(discoveredKey.split(','));
    const sites = new Set(sample.forest?.sites.map((site) => site.id) ?? []);
    return {
      ...sample,
      landmarks: sample.landmarks.filter(
        (place) => !sites.has(place.id) || discovered.has(place.id),
      ),
    };
  }, [sample, discoveredKey]);
  const selectedRegion = FOREST_REGIONS[selected];
  if (local)
    return (
      <RpgAtlasDialog
        sample={localSample}
        name={sample.name}
        scope={scope}
        position={ui.position}
        onClose={onClose}
        onBack={() => setLocal(false)}
        onFocus={onFocus}
        navigation={navigation}
        onNavigate={onNavigate}
        onStopNavigation={onStopNavigation}
        onJourney={onJourney}
        objective={objective}
        focusAt={focusAt}
      />
    );
  return (
    <RpgDialog
      open
      title="Mosswild Forest"
      className="rpg-forest-map"
      onClose={onClose}
      footer={
        <p
          className="rpg-muted"
          role={ui.exploration?.saveAvailable === false ? 'alert' : undefined}
        >
          {ui.exploration?.saveAvailable === false
            ? 'This browser could not save your journey. Keep this tab open to preserve this visit.'
            : 'Your discoveries are saved in this browser. Trails connect neighboring regions.'}
        </p>
      }
    >
      <JourneyMapNote onJourney={onJourney} objective={objective} />
      <div className="forest-map-toolbar" role="group" aria-label="Map view">
        <button className="rpg-button" aria-pressed={!local} onClick={() => setLocal(false)}>
          The forest
        </button>
        <button
          className="rpg-button"
          aria-pressed={local}
          disabled={!sample.forest && !sample.temple}
          onClick={() => setLocal(true)}
        >
          This area
        </button>
        <span>{visited.size} / 12 regions visited</span>
      </div>
      <div className="forest-map-layout">
        <div className="forest-chart">
          <svg viewBox="0 0 582 384" aria-hidden="true">
            <rect width="582" height="384" className="forest-chart-ground" />
            {FOREST_LINKS.map(([a, b]) => {
              const p = chartPoint(a),
                q = chartPoint(b);
              return (
                <path
                  key={`${a}:${b}`}
                  d={`M${p.x},${p.y} Q${(p.x + q.x) / 2 + 12},${(p.y + q.y) / 2 + 10} ${q.x},${q.y}`}
                  className="forest-chart-link"
                />
              );
            })}
            {FOREST_REGION_IDS.map((id, i) => {
              const p = chartPoint(id);
              return (
                <g key={id} transform={`translate(${p.x},${p.y})`}>
                  <path
                    d="M-52-31L-36-45 4-43 47-31 57 0 43 39 3 46-44 31-58 3Z"
                    className={`forest-chart-region${visited.has(id) ? ' is-visited' : ''}${selected === id ? ' is-selected' : ''}`}
                  />
                  <path
                    d={
                      i % 3 === 0
                        ? 'M-38 16Q-10-22 24 17T42 7'
                        : 'M-35-19l10-11 9 11m-3 40 13-15 12 15'
                    }
                    className="forest-chart-detail"
                  />
                </g>
              );
            })}
            <path d="M78 355v19m-7-7 7 7 7-7" className="forest-chart-link" />
          </svg>
          {FOREST_REGION_IDS.map((id) => {
            const p = chartPoint(id);
            return (
              <button
                key={id}
                style={{ left: `${(p.x / 582) * 100}%`, top: `${(p.y / 384) * 100}%` }}
                className="forest-region-label"
                aria-pressed={selected === id}
                aria-label={`${FOREST_REGIONS[id].name}${current === id ? ', you are here' : visited.has(id) ? ', visited' : ', unexplored'}`}
                onClick={() => setSelected(id)}
              >
                {FOREST_REGIONS[id].name}
                <small>
                  {current === id ? 'You are here' : visited.has(id) ? 'Visited' : 'Unexplored'}
                </small>
              </button>
            );
          })}
        </div>
        <aside className="forest-map-notes" aria-live="polite">
          <small>
            {visited.has(selected) ? 'A path you have walked' : 'Beyond the familiar trails'}
          </small>
          <h2>{selectedRegion.name}</h2>
          {selected === 'rootbound-reach' && (
            <section className="forest-homeward" aria-label="Rootbound Temple">
              <strong>Rootbound Temple · The Hollow Choir</strong>
              <p>Enter the arch at the outer approach. Mira waits in the courtyard.</p>
              {sample.temple ? (
                <button className="rpg-button" onClick={() => setLocal(true)}>
                  View this temple area
                </button>
              ) : (
                <DestinationActions
                  heading={false}
                  target={regionDestination('temple')}
                  navigation={navigation}
                  onNavigate={onNavigate}
                  onStopNavigation={onStopNavigation}
                />
              )}
            </section>
          )}
          {selected !== current &&
            !(selected === 'rootbound-reach' && isTempleAreaId(objectiveRegion)) && (
              <DestinationActions
                heading={false}
                key={selected}
                target={regionDestination(selected)}
                navigation={navigation}
                onNavigate={onNavigate}
                onStopNavigation={onStopNavigation}
              />
            )}
          {selected === current && (
            <button className="rpg-button" onClick={() => setLocal(true)}>
              Choose a local destination
            </button>
          )}
          <p>{selectedRegion.subtitle}.</p>
          <p>
            Paths lead to{' '}
            {forestNeighbors(selected)
              .map((id) => FOREST_REGIONS[id].name)
              .join(', ')}
            {selected === 'verge' ? ', and town' : ''}.
          </p>
          <div className="forest-homeward">
            <strong>Your way home</strong>
            <p>{regionRoute(currentArea, 'verge').map(forestAreaName).join(' → ')} → Town</p>
            <DestinationActions
              heading={false}
              target={regionDestination('town')}
              navigation={navigation}
              onNavigate={onNavigate}
              onStopNavigation={onStopNavigation}
            />
          </div>
        </aside>
      </div>
    </RpgDialog>
  );
}
