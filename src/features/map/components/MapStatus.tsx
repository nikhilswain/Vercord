import type { MapSource, MapViewState } from '../map-view-state';

export function SourceStatus({ source, stale }: { source: MapSource; stale: boolean }) {
  if (source === 'fixture') return <>Demo data</>;
  return <>{stale ? 'Published map · Update delayed' : 'Published map'}</>;
}

export function MapStatus({ state }: { state: Exclude<MapViewState, { status: 'ready' }> }) {
  if (state.status === 'loading') {
    return (
      <p className="map-state" role="status">
        Charting the atlas
      </p>
    );
  }
  if (state.status === 'empty') {
    return (
      <section className="map-state">
        <h2>No published rooms</h2>
        <p>This map has no published areas yet.</p>
      </section>
    );
  }
  if (state.status === 'invalid') {
    return (
      <section className="map-state" role="alert">
        <h2>Map unavailable</h2>
        <p>The supplied map data could not be drawn safely.</p>
      </section>
    );
  }
  return (
    <section className="map-state" role="alert">
      <h2>Atlas unavailable</h2>
      <p>The map cannot be reached right now.</p>
    </section>
  );
}
