import { useCallback, useEffect, useRef, useState } from 'react';

import { AppHeader } from '../../components/AppHeader';
import { RequestRetry } from '../../components/RequestRetry';
import { mapSnapshotSchema, type MapSnapshot } from '../../domain/map/snapshot';
import type { ChannelControls } from '../../domain/channels/protocol';
import { ChannelApiError, fetchChannelState } from '../world/channel-api';
import {
  ChannelRefreshController,
  type ChannelRefreshReason,
  type ChannelRefreshResult,
  type ChannelRefreshStatus,
} from '../world/channel-refresh';
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
  const [controls, setControls] = useState<ChannelControls | null>(null);
  const [stale, setStale] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<ChannelRefreshStatus>({
    retryAt: 0,
    pending: false,
  });
  const refreshRef = useRef<() => Promise<boolean>>(async () => false);
  const refresh = useCallback(() => refreshRef.current(), []);
  const invalidateRef = useRef<(reason: ChannelRefreshReason) => void>(() => undefined);
  const invalidate = useCallback(
    (reason: ChannelRefreshReason) => invalidateRef.current(reason),
    [],
  );
  const isLocalPreview = mode === 'local-preview';
  const isMemberWorld = mode === 'member';

  useEffect(() => {
    const controller = new AbortController();

    if (isMemberWorld) {
      const read = async (): Promise<ChannelRefreshResult> => {
        try {
          const result = await fetchChannelState(slug, controller.signal);
          if (controller.signal.aborted) return false;
          setState((previous) => {
            // Timestamps change on revalidation; only rebuild the world for actual content changes.
            const unchanged =
              previous.kind === 'ready' &&
              JSON.stringify([previous.snapshot.server, previous.snapshot.areas]) ===
                JSON.stringify([result.snapshot.server, result.snapshot.areas]);
            return unchanged ? previous : { kind: 'ready', snapshot: result.snapshot };
          });
          setControls(result.controls);
          setStale(false);
          setRateLimited(false);
          return true;
        } catch (error) {
          if (controller.signal.aborted) return false;
          setStale(true);
          const code = error instanceof ChannelApiError ? error.code : '';
          setRateLimited(code === 'CHANNEL_RATE_LIMITED');
          if (['UNAUTHENTICATED', 'GUILD_MEMBERSHIP_REQUIRED', 'WORLD_NOT_FOUND'].includes(code)) {
            setControls(null);
          }
          setState((previous) =>
            code === 'UNAUTHENTICATED'
              ? { kind: 'signed-out' }
              : code === 'GUILD_MEMBERSHIP_REQUIRED'
                ? { kind: 'forbidden' }
                : code === 'WORLD_NOT_FOUND'
                  ? { kind: 'not-found' }
                  : previous.kind === 'ready'
                    ? previous
                    : { kind: 'unavailable' },
          );
          return error instanceof ChannelApiError && error.retryAfterMs > 0
            ? { retryAfterMs: error.retryAfterMs }
            : false;
        }
      };
      const refreshController = new ChannelRefreshController(
        read,
        () => document.visibilityState === 'visible',
        setRefreshStatus,
      );
      const onFocus = () => {
        refreshController.notify('focus');
      };
      refreshRef.current = () => refreshController.refresh();
      invalidateRef.current = (reason) => refreshController.notify(reason);
      void refreshController.refresh();
      window.addEventListener('focus', onFocus);
      window.addEventListener('online', onFocus);
      document.addEventListener('visibilitychange', onFocus);
      return () => {
        refreshController.dispose();
        controller.abort();
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('online', onFocus);
        document.removeEventListener('visibilitychange', onFocus);
        refreshRef.current = async () => false;
        invalidateRef.current = () => undefined;
      };
    }

    const endpoint = `${isLocalPreview ? '/api/preview/maps/' : '/api/maps/'}${encodeURIComponent(slug)}`;
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
      document.title = rateLimited
        ? 'Discord request cooldown — Dmap'
        : 'Discord world unavailable — Dmap';
    }
  }, [state, rateLimited]);

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
    if (isMemberWorld && state.kind === 'unavailable') {
      return (
        <main className="world-demo-error world-request-error">
          <div className="world-request-error__content">
            <h1>{rateLimited ? 'Discord needs a short pause' : 'World unavailable'}</h1>
            <p>
              {rateLimited
                ? 'Discord is temporarily limiting channel requests. This is not a server-permission error.'
                : 'The Discord world could not be loaded right now. Please try again shortly.'}
            </p>
            {rateLimited ? (
              <p>Wait for the countdown, then try again. No page reload needed.</p>
            ) : null}
            <RequestRetry
              retryAt={refreshStatus.retryAt}
              pending={refreshStatus.pending}
              onRetry={refresh}
            />
            <a href="/dashboard">Back to your worlds</a>
          </div>
        </main>
      );
    }
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
        <WorldCanvas
          snapshot={state.snapshot}
          presenceGuildId={isMemberWorld ? slug : undefined}
          channelControls={controls}
          onRefreshChannels={refresh}
          onWorldInvalidated={invalidate}
          channelsStale={isMemberWorld && stale}
          channelsRateLimited={rateLimited}
          channelRefreshStatus={refreshStatus}
        />
      </main>
    </div>
  );
}
