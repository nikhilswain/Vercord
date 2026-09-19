import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RpgPlayPage } from './RpgPlayPage';
import { getRpgSample, RPG_SAMPLES } from './sample-worlds';
import { readRpgRoute, resolveRpgTravel, writeRpgRoute } from './themes';
import type { RpgDestination } from './types';
import { buildComparisonVillage, buildJungleDemo } from './demo/scenes';
import { buildFernHollow, buildTempleDemo } from './demo/forest-expansion';
import { buildTempleInterior } from './demo/temple-interior';
import { DEMO_AREA_NAMES, readDemoArea, type DemoArea } from './demo/types';
import { AdventureJourney } from './adventure/journey';
import { FOREST_VERSION, type ForestDestination } from '../../domain/world/forest/catalog';
import { presentForest, withForestTrail, PREVIEW_FOREST_SEED } from './forest/presentation';
import { createForestJourney } from './forest/journey-storage';
import { templeSamples } from './forest/temple-presentation';
import { presentTownHall, presentHallCellar } from './town-hall/presentation';

const village = buildComparisonVillage();
const jungle = buildJungleDemo();
const areas = {
  village,
  jungle,
  'fern-hollow': buildFernHollow(),
  temple: buildTempleDemo(),
  'temple-interior': buildTempleInterior(),
};
const samples = [...Object.values(areas), RPG_SAMPLES.norse, RPG_SAMPLES.dungeon];

export function RpgDemoPage() {
  const [forestJourney] = useState(() => createForestJourney('preview'));
  const [forestPreview] = useState(
    () =>
      readRpgRoute(location.search).forest !== undefined ||
      new URLSearchParams(location.search).get('expedition') === 'mosswild',
  );
  const [area, setArea] = useState<DemoArea>(() => {
    const requested = readDemoArea(new URLSearchParams(location.search).get('area'));
    const content = areas[requested].demo!;
    return new AdventureJourney().blockedEntry(content.jungle)
      ? (content.entryFallback ?? 'village')
      : requested;
  });
  const [crossing, setCrossing] = useState<DemoArea | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    },
    [],
  );
  const [route, setRoute] = useState(() => {
    const params = new URLSearchParams(location.search);
    // Channel houses belong to an admitted server town, never the local sample.
    params.delete('house');
    const requested = readRpgRoute(params.toString());
    if (
      requested.forest === 'temple-interior' &&
      forestJourney.blockedEntry(templeSamples[1]!.adventure!.definition)
    )
      requested.forest = 'temple';
    return requested;
  });
  const travel = useCallback((destination: RpgDestination) => {
    setArea('village');
    setRoute((current) => resolveRpgTravel(current, destination));
  }, []);
  const travelForest = useCallback((destination: ForestDestination) => {
    setRoute((current) => ({
      world: current.world,
      theme: current.world,
      ...(destination !== 'town' ? { forest: destination } : {}),
    }));
    setArea('village');
  }, []);
  useEffect(() => {
    const save = () => forestJourney.checkpoint(true);
    window.addEventListener('pagehide', save);
    return () => {
      save();
      window.removeEventListener('pagehide', save);
    };
  }, [forestJourney]);
  const travelDemo = useCallback((next: DemoArea) => {
    if (transitionTimer.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setArea(next);
      return;
    }
    setCrossing(next);
    transitionTimer.current = setTimeout(() => {
      setArea(next);
      transitionTimer.current = setTimeout(() => {
        setCrossing(null);
        transitionTimer.current = null;
      }, 350);
    }, 350);
  }, []);
  useEffect(() => {
    const url = writeRpgRoute(new URL(location.href), route);
    if (forestPreview) url.searchParams.set('expedition', 'mosswild');
    if (area !== 'village' && route.theme === 'village') url.searchParams.set('area', area);
    else url.searchParams.delete('area');
    history.replaceState(history.state, '', url);
  }, [route, area, forestPreview]);
  const forest = useMemo(
    () =>
      route.forest
        ? presentForest({
            contentVersion: FOREST_VERSION,
            worldId: PREVIEW_FOREST_SEED,
            seed: PREVIEW_FOREST_SEED,
            region: route.forest,
          })
        : undefined,
    [route.forest],
  );
  const previewTown = useMemo(
    () =>
      forestPreview && route.theme !== 'dungeon'
        ? withForestTrail(getRpgSample(route.theme))
        : undefined,
    [forestPreview, route.theme],
  );
  const hall = useMemo(() => presentTownHall(route.world), [route.world]);
  const cellar = useMemo(
    () =>
      route.hall && route.theme === 'dungeon' ? presentHallCellar(RPG_SAMPLES.dungeon) : undefined,
    [route.hall, route.theme],
  );
  return (
    <>
      <RpgPlayPage
        route={route}
        sample={
          cellar ??
          (route.hall && route.theme !== 'dungeon' ? hall : undefined) ??
          forest ??
          previewTown ??
          (route.theme === 'village' ? areas[area] : getRpgSample(route.theme))
        }
        samples={[
          ...samples,
          hall,
          ...(forestPreview ? templeSamples : []),
          ...(forest ? [forest] : []),
          ...(previewTown ? [previewTown] : []),
        ]}
        worldKey={`demo/${route.world}/${forestPreview ? 'forest' : 'sample'}`}
        onTravel={travel}
        onDemoTravel={travelDemo}
        onForestTravel={travelForest}
        journey={forestPreview ? forestJourney : undefined}
        demoTransition={crossing !== null}
      />
      {crossing && (
        <div className="rpg-demo-transition" role="status">
          <small>Following the trail</small>
          <span>{DEMO_AREA_NAMES[crossing]}</span>
        </div>
      )}
    </>
  );
}
