import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { AppHeader } from '../../components/AppHeader';
import { RequestRetry } from '../../components/RequestRetry';
import type { ChannelMutationResult, WorldSync, WorldView } from '../../domain/channels/protocol';
import { mapSnapshotSchema, type MapSnapshot } from '../../domain/map/snapshot';
import { fetchChannelState, fetchWorldAdmission } from '../world/channel-api';
import { WorldCanvas } from '../world/WorldCanvas';
import { WorldStateStore, type WorldClientState } from '../world/world-state';
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
  return mode === 'member' ? (
    <MemberDiscordMapPage key={slug} slug={slug} />
  ) : (
    <SnapshotMapPage slug={slug} mode={mode} />
  );
}

function MemberDiscordMapPage({ slug }: { slug: string }) {
  const [store] = useState(() => new WorldStateStore((signal) => fetchChannelState(slug, signal)));
  const worldState = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const lifecycleGeneration = useRef(0);
  const [initializing, setInitializing] = useState(true);
  const [onlineResumeNonce, setOnlineResumeNonce] = useState(0);

  useEffect(() => {
    const ownership = lifecycleGeneration;
    const generation = ++ownership.current;
    queueMicrotask(() => {
      if (generation !== ownership.current) return;
      void store.refresh().finally(() => {
        if (generation === ownership.current) setInitializing(false);
      });
    });

    return () => {
      const cleanupGeneration = ++ownership.current;
      queueMicrotask(() => {
        if (cleanupGeneration === ownership.current) store.dispose();
      });
    };
  }, [store]);

  useEffect(() => {
    const resume = () => setOnlineResumeNonce((nonce) => nonce + 1);
    window.addEventListener('online', resume);
    return () => window.removeEventListener('online', resume);
  }, []);

  const onWorldView = useCallback((view: WorldView) => store.accept(view), [store]);
  const onWorldSync = useCallback((sync: WorldSync) => store.status(sync), [store]);
  const onChannelMutation = useCallback(
    (result: ChannelMutationResult) => store.mutation(result),
    [store],
  );
  const refresh = useCallback(() => store.refresh(), [store]);
  const confirmReconciled = useCallback(() => store.confirmReconciled(), [store]);
  const recoverAdmission = useCallback(
    (signal: AbortSignal) => fetchWorldAdmission(slug, signal),
    [slug],
  );

  useMemberWorldTitle(worldState);

  if (worldState.sync.state === 'denied') {
    return worldState.sync.code === 'UNAUTHENTICATED' ? (
      <WorldError
        title="Sign in to enter this world"
        message="Use a Discord account that belongs to this server."
        href={`/api/auth/discord/start?return_to=${encodeURIComponent(`/world/${slug}`)}`}
        action="Continue with Discord"
      />
    ) : (
      <WorldError
        title="This Discord world is private"
        message="This Discord account is not a member of the server."
        href="/dashboard"
        action="Back to your worlds"
      />
    );
  }

  if (worldState.view !== null) {
    return (
      <WorldShell
        context={worldState.view.snapshot.server.displayName}
        status="Private Discord world"
      >
        <WorldCanvas
          snapshot={worldState.view.snapshot}
          presenceGuildId={slug}
          worldState={worldState}
          onlineResumeNonce={onlineResumeNonce}
          onWorldView={onWorldView}
          onWorldSync={onWorldSync}
          onChannelMutation={onChannelMutation}
          onRefreshChannels={refresh}
          onConfirmReconciled={confirmReconciled}
          recoverAdmission={recoverAdmission}
        />
      </WorldShell>
    );
  }

  if (initializing || worldState.pending) return <WorldLoading />;

  if (worldState.sync.state !== 'ready' && worldState.sync.code === 'WORLD_NOT_FOUND') {
    return (
      <WorldError
        title="World not created"
        message="A server manager needs to create and sync this world first."
        href="/dashboard"
        action="Back to your worlds"
      />
    );
  }

  const rateLimited = worldState.sync.state === 'cooldown';
  return (
    <WorldError
      title={rateLimited ? 'Discord needs a short pause' : 'World unavailable'}
      message={
        rateLimited
          ? 'Discord is temporarily limiting world admission. Wait for the countdown before trying again.'
          : 'The Discord world could not be loaded right now. Please try again shortly.'
      }
      href="/dashboard"
      action="Back to your worlds"
      retry={
        <RequestRetry retryAt={worldState.retryAt} pending={worldState.pending} onRetry={refresh} />
      }
    />
  );
}

function SnapshotMapPage({ slug, mode }: { slug: string; mode: 'public' | 'local-preview' }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const isLocalPreview = mode === 'local-preview';

  useEffect(() => {
    const controller = new AbortController();
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
  }, [isLocalPreview, slug]);

  useSnapshotWorldTitle(state);

  if (state.kind === 'loading') return <WorldLoading />;
  if (state.kind === 'ready') {
    return (
      <WorldShell
        context={state.snapshot.server.displayName}
        status={isLocalPreview ? 'Private local preview' : 'Published Discord world'}
      >
        <WorldCanvas snapshot={state.snapshot} />
      </WorldShell>
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
            : 'This Discord world has not been synced or has no public map yet.'
          : 'The Discord world could not be loaded right now.';

  return (
    <WorldError
      title={title}
      message={message}
      href={
        state.kind === 'signed-out'
          ? `/api/auth/discord/start?return_to=${encodeURIComponent(returnTo)}`
          : state.kind === 'unavailable'
            ? window.location.pathname
            : '/'
      }
      action={
        state.kind === 'signed-out'
          ? 'Continue with Discord'
          : state.kind === 'unavailable'
            ? 'Try again'
            : 'Back to Dmap'
      }
    />
  );
}

function useMemberWorldTitle(state: WorldClientState): void {
  useEffect(() => {
    if (state.sync.state === 'denied') {
      document.title =
        state.sync.code === 'UNAUTHENTICATED'
          ? 'Sign in to enter — Dmap'
          : 'World access denied — Dmap';
    } else if (state.view !== null) {
      document.title = `${state.view.snapshot.server.displayName} — Dmap`;
    } else if (state.sync.state !== 'ready' && state.sync.code === 'WORLD_NOT_FOUND') {
      document.title = 'Discord world not found — Dmap';
    } else if (state.sync.state === 'cooldown') {
      document.title = 'Discord request cooldown — Dmap';
    } else {
      document.title = 'Discord world unavailable — Dmap';
    }
  }, [state]);
}

function useSnapshotWorldTitle(state: LoadState): void {
  useEffect(() => {
    document.title =
      state.kind === 'ready'
        ? `${state.snapshot.server.displayName} — Dmap`
        : state.kind === 'signed-out'
          ? 'Sign in to enter — Dmap'
          : state.kind === 'forbidden'
            ? 'World access denied — Dmap'
            : state.kind === 'not-found'
              ? 'Discord world not found — Dmap'
              : state.kind === 'unavailable'
                ? 'Discord world unavailable — Dmap'
                : document.title;
  }, [state]);
}

function WorldLoading() {
  return (
    <div className="world-page">
      <div className="world-loading" role="status">
        <span className="world-loading-mark" aria-hidden="true" />
        <p>Loading Discord world…</p>
      </div>
    </div>
  );
}

function WorldShell({
  context,
  status,
  children,
}: {
  context: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <div className="world-page">
      <AppHeader context={context} status={<span>{status}</span>} />
      <main className="world-main">{children}</main>
    </div>
  );
}

function WorldError({
  title,
  message,
  href,
  action,
  retry,
}: {
  title: string;
  message: string;
  href: string;
  action: string;
  retry?: ReactNode;
}) {
  return (
    <main className="world-demo-error world-request-error" role="alert">
      <div className="world-request-error__content">
        <h1>{title}</h1>
        <p>{message}</p>
        {retry}
        <a href={href}>{action}</a>
      </div>
    </main>
  );
}
