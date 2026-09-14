import { useCallback, useEffect, useRef, useState } from 'react';
import { RpgPlayPage } from './RpgPlayPage';
import { getRpgSample, RPG_SAMPLES } from './sample-worlds';
import { readRpgRoute, resolveRpgTravel, writeRpgRoute } from './themes';
import type { RpgDestination } from './types';
import { buildComparisonVillage, buildJungleDemo } from './demo/scenes';
import { buildFernHollow, buildTempleDemo } from './demo/forest-expansion';
import { DEMO_AREA_NAMES, readDemoArea, type DemoArea } from './demo/types';

const village = buildComparisonVillage();
const jungle = buildJungleDemo();
const areas = { village, jungle, 'fern-hollow': buildFernHollow(), temple: buildTempleDemo() };
const samples = [...Object.values(areas), RPG_SAMPLES.norse, RPG_SAMPLES.dungeon];

export function RpgDemoPage() {
  const [area, setArea] = useState<DemoArea>(() =>
    readDemoArea(new URLSearchParams(location.search).get('area')),
  );
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
    return readRpgRoute(params.toString());
  });
  const travel = useCallback((destination: RpgDestination) => {
    setArea('village');
    setRoute((current) => resolveRpgTravel(current, destination));
  }, []);
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
    if (area !== 'village' && route.theme === 'village') url.searchParams.set('area', area);
    else url.searchParams.delete('area');
    history.replaceState(history.state, '', url);
  }, [route, area]);
  return (
    <>
      <RpgPlayPage
        route={route}
        sample={route.theme === 'village' ? areas[area] : getRpgSample(route.theme)}
        samples={samples}
        worldKey={`demo/${route.world}`}
        onTravel={travel}
        onDemoTravel={travelDemo}
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
