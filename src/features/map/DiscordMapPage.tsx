import { useEffect, useState } from 'react';

import { AppHeader } from '../../components/AppHeader';
import { mapSnapshotSchema, type MapSnapshot } from '../../domain/map/snapshot';
import { WorldCanvas } from '../world/WorldCanvas';
import '../world/world.css';

interface DiscordMapPageProps {
  slug: string;
  mode?: 'public' | 'local-preview' | 'member';
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; snapshot: MapSnapshot }
  | { kind: 'signed-out' }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

export function DiscordMapPage({ slug, mode = 'public' }: DiscordMapPageProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const isLocalPreview = mode === 'local-preview';
  const isMemberWorld = mode === 'member';

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });

    const endpoint = isMemberWorld
      ? `/api/auth/guilds/${encodeURIComponent(slug)}/map`
      : `${isLocalPreview ? '/api/preview/maps/' : '/api/maps/'}${encodeURIComponent(slug)}`;
    void fetch(endpoint, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) return { kind: 'signed-out' } as const;
        if (response.status === 403) return { kind: 'forbidden' } as const;
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
  }, [isLocalPreview, isMemberWorld, slug]);

  useEffect(() => {
    if (state.kind === 'ready') {
      document.title = `${state.snapshot.server.displayName} — Dmap`;
    } else if (state.kind === 'signed-out') {
      document.title = 'Sign in to enter — Dmap';
    } else if (state.kind === 'forbidden') {
      document.title = 'World access denied — Dmap';
    } else if (state.kind === 'not-found') {
      document.title = 'Discord world not found — Dmap';
    } else if (state.kind === 'unavailable') {
      document.title = 'Discord world unavailable — Dmap';
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
    const returnTo = `/world/${slug}`;
    const title =
      state.kind === 'signed-out'
        ? 'Sign in to enter this world'
        : state.kind === 'forbidden'
          ? 'This Discord world is private'
          : state.kind === 'not-found'
            ? isLocalPreview
              ? 'Preview not synced'
              : isMemberWorld
                ? 'World not created'
                : 'World not published'
            : 'World unavailable';
    const message =
      state.kind === 'signed-out'
        ? 'Use a Discord account that belongs to this server.'
        : state.kind === 'forbidden'
          ? 'This Discord account is not a member of the server.'
          : state.kind === 'not-found'
            ? isLocalPreview
              ? 'Sync this server from the dashboard, then refresh this page.'
              : isMemberWorld
                ? 'A server manager needs to create and sync this world first.'
                : 'This Discord world has not been synced or has no public map yet.'
            : 'The Discord world could not be loaded right now.';

    return (
      <main className="world-demo-error" role="alert">
        <h1>{title}</h1>
        <p>{message}</p>
        <a
          href={
            state.kind === 'signed-out'
              ? `/api/auth/discord/start?return_to=${encodeURIComponent(returnTo)}`
              : state.kind === 'unavailable'
                ? window.location.pathname
                : isMemberWorld
                  ? '/dashboard'
                  : '/'
          }
        >
          {state.kind === 'signed-out'
            ? 'Continue with Discord'
            : state.kind === 'unavailable'
              ? 'Try again'
              : isMemberWorld
                ? 'Back to your worlds'
                : 'Back to Dmap'}
        </a>
      </main>
    );
  }

  return (
    <div className="world-page">
      <AppHeader
        context={state.snapshot.server.displayName}
        status={
          <span>
            {isLocalPreview
              ? 'Private local preview'
              : isMemberWorld
                ? 'Private Discord world'
                : 'Published Discord world'}
          </span>
        }
      />
      <main className="world-main">
        <WorldCanvas snapshot={state.snapshot} presenceGuildId={isMemberWorld ? slug : undefined} />
      </main>
    </div>
  );
}
