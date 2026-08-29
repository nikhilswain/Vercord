import { AppHeader } from '../../components/AppHeader';
import { SourceStatus } from './components/MapStatus';
import { demoMapFixtureResult } from './fixtures/demo-map';
import { createMapViewState } from './map-view-state';
import { MapPageView } from './MapPageView';
import './map.css';

export function DemoMapPage() {
  const state = createMapViewState(
    demoMapFixtureResult.ok ? demoMapFixtureResult.snapshot : null,
    'fixture',
  );
  return (
    <div className="atlas-page">
      <AppHeader
        context="Demo atlas"
        status={
          <span className="map-status">
            <SourceStatus source="fixture" stale={false} />
          </span>
        }
      />
      <main>
        <div className="atlas-intro">
          <h1>Explore Northstar Commons</h1>
          <p className="route-note">Invented community fixture</p>
          <p>Read the districts and rooms of a sanitized demonstration map.</p>
        </div>
        <MapPageView state={state} />
      </main>
    </div>
  );
}
