import { useEffect, useState } from 'react';

import { AppHeader } from '../../components/AppHeader';
import { mapSnapshotSchema, type MapSnapshot } from '../../domain/map/snapshot';
import { WorldCanvas } from '../world/WorldCanvas';
import '../world/world.css';

interface DiscordMapPageProps {
  slug: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; snapshot: MapSnapshot }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

export function DiscordMapPage({ slug }: DiscordMapPageProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });

    void fetch(`/api/maps/${encodeURIComponent(slug)}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) return { kind: 'not-found' } as const;
        if (!response.ok) return { kind: 'unavailable' } as const;

        const parsed = mapSnapshotSchema.safeParse(await response.json());
        return parsed.success
          ? ({ kind: 'ready', snapshot: parsed.data } as const)
          : ({ kind: 'unavailable' } as const);
      })
      .then((result) => {
        if (!controller.signal.aborted) setState(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'unavailable' });
      });

    return () => controller.abort();
  }, [slug]);

  useEffect(() => {
    if (state.kind === 'ready') {
      document.title = `${state.snapshot.server.displayName} — Dmap`;
    }
  }, [state]);

  if (state.kind === 'loading') {
    return (
      <div className="world-page">
        <div className="world-loading" role="status">
          <span className="world-loading-mark" aria-hidden="true" />
          <p>Loading Discord world…</p>
        </div>
      </div>
    );
  }

  if (state.kind !== 'ready') {
    return (
      <main className="world-demo-error" role="alert">
        <h1>{state.kind === 'not-found' ? 'World not published' : 'World unavailable'}</h1>
        <p>
          {state.kind === 'not-found'
            ? 'This Discord world has not been synced or has no public map yet.'
            : 'The published Discord map could not be loaded right now.'}
        </p>
        <a href="/">Back to Dmap</a>
      </main>
    );
  }

  return (
    <div className="world-page">
      <AppHeader
        context={state.snapshot.server.displayName}
        status={<span>Published Discord world</span>}
      />
      <main className="world-main">
        <WorldCanvas snapshot={state.snapshot} />
      </main>
    </div>
  );
}
