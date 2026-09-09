import { useCallback, useEffect, useState } from 'react';
import { RpgPlayPage } from './RpgPlayPage';
import { getRpgSample, RPG_SAMPLES } from './sample-worlds';
import { readRpgRoute, resolveRpgTravel, writeRpgRoute } from './themes';
import type { RpgDestination } from './types';

const samples = Object.values(RPG_SAMPLES);

export function RpgDemoPage() {
  const [route, setRoute] = useState(() => {
    const params = new URLSearchParams(location.search);
    // Channel houses belong to an admitted server town, never the local sample.
    params.delete('house');
    return readRpgRoute(params.toString());
  });
  const travel = useCallback((destination: RpgDestination) => {
    setRoute((current) => resolveRpgTravel(current, destination));
  }, []);
  useEffect(() => {
    history.replaceState(history.state, '', writeRpgRoute(new URL(location.href), route));
  }, [route]);
  return (
    <RpgPlayPage
      route={route}
      sample={getRpgSample(route.theme)}
      samples={samples}
      worldKey={`demo/${route.world}`}
      onTravel={travel}
    />
  );
}
