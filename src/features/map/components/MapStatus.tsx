import type { MapSource, MapViewState } from '../map-view-state';

export interface MapStatusProps {
  state: MapViewState;
  compact?: boolean;
  inFlow?: boolean;
}

function formatMapTimestamp(value: string): string {
  return new Date(value).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function statusClass(tone: string, compact: boolean, inFlow: boolean): string {
  return (
    'map-status map-status--' +
    tone +
    (compact ? ' is-compact' : '') +
    (inFlow ? ' is-in-flow' : '')
  );
}

export function SourceStatus({ source, stale }: { source: MapSource; stale: boolean }) {
  if (source === 'fixture') return <p className="map-status">Demo data</p>;
  return <p className="map-status">{stale ? 'Published map · Update delayed' : 'Published map'}</p>;
}

export function MapStatus({ state, compact = false, inFlow = false }: MapStatusProps) {
  if (state.status === 'loading') {
    return (
      <section className={statusClass('loading', compact, inFlow)} role="status" aria-live="polite">
        <span className="map-status-icon" aria-hidden="true">
          ⌁
        </span>
        <p>
          Charting the atlas
          <span className="map-loading-dots" aria-hidden="true">
            <span className="map-loading-dot" />
            <span className="map-loading-dot" />
            <span className="map-loading-dot" />
          </span>
        </p>
      </section>
    );
  }
  if (state.status === 'empty') {
    return (
      <section className={statusClass('empty', compact, inFlow)}>
        <span className="map-status-icon" aria-hidden="true">
          ○
        </span>
        <div>
          <h2>No published rooms</h2>
          <p>This map has no published areas yet.</p>
        </div>
      </section>
    );
  }
  if (state.status === 'invalid') {
    return (
      <section className={statusClass('danger', compact, inFlow)} role="alert">
        <span className="map-status-icon" aria-hidden="true">
          !
        </span>
        <div>
          <h2>Map unavailable</h2>
          <p>The supplied map data could not be drawn safely.</p>
        </div>
      </section>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <section className={statusClass('danger', compact, inFlow)} role="alert">
        <span className="map-status-icon" aria-hidden="true">
          !
        </span>
        <div>
          <h2>Atlas unavailable</h2>
          <p>The map cannot be reached right now.</p>
        </div>
      </section>
    );
  }

  const delayed = state.source === 'public' && state.stale;
  return (
    <section
      className={statusClass(delayed ? 'warning' : 'source', compact, inFlow)}
      role={delayed ? 'status' : undefined}
      aria-live={delayed ? 'polite' : undefined}
    >
      <span className="map-status-icon" aria-hidden="true">
        {delayed ? '!' : '◆'}
      </span>
      <p>
        {state.source === 'fixture'
          ? 'Demo data'
          : delayed
            ? 'Published map · Update delayed'
            : 'Published map'}
      </p>
      {state.source === 'public' ? (
        <time dateTime={state.snapshot.generatedAt}>
          {formatMapTimestamp(state.snapshot.generatedAt)}
        </time>
      ) : null}
    </section>
  );
}
