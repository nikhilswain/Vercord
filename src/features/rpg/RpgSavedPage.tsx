import { useCallback, useEffect, useMemo, useState } from 'react';
import { RpgPlayPage } from './RpgPlayPage';
import { readRpgRoute, resolveRpgTravel, RPG_THEMES, writeRpgRoute } from './themes';
import type { RpgDestination } from './types';
import { useSavedRpgWorld, type SavedRpgStatus } from './use-saved-rpg-world';
import './rpg.css';

const failures: Record<
  Exclude<SavedRpgStatus, 'loading' | 'ready'>,
  { title: string; message: string }
> = {
  'signed-out': {
    title: 'Your town is waiting',
    message: 'Sign in with Discord to explore this server’s town.',
  },
  forbidden: {
    title: 'This town is for server members',
    message: 'Your Discord account does not currently have access to this server.',
  },
  missing: {
    title: 'This server’s town is not ready',
    message: 'A server manager needs to connect Dmap and sync this server first.',
  },
  invalid: {
    title: 'This town could not open',
    message:
      'The saved town needs attention. Its map has been kept. Try again later or choose another server.',
  },
  unavailable: {
    title: 'The path could not open',
    message: 'Dmap could not reach this server’s town. Try again in a moment.',
  },
};

function SavedWorldGate({
  status,
  themeName,
  onRetry,
}: {
  status: SavedRpgStatus;
  themeName: string;
  onRetry(): void;
}) {
  const failure = status !== 'loading' && status !== 'ready' ? failures[status] : null;
  return (
    <div className="rpg-state" role={failure ? 'alert' : 'status'}>
      <div className="rpg-frame">
        <span className="rpg-kicker">Dmap</span>
        <h1>{failure?.title ?? 'Opening your town…'}</h1>
        <p>{failure?.message ?? `Getting ${themeName} ready for you.`}</p>
        <div className="rpg-state-actions">
          {status === 'signed-out' ? (
            <a
              className="rpg-button"
              href={`/api/auth/discord/start?return_to=${encodeURIComponent(location.pathname + location.search)}`}
            >
              Continue with Discord
            </a>
          ) : (
            failure &&
            status !== 'forbidden' &&
            status !== 'missing' && (
              <button className="rpg-button" onClick={onRetry}>
                Try again
              </button>
            )
          )}
          <a href="/dashboard">Choose another server</a>
        </div>
      </div>
    </div>
  );
}

export function RpgSavedPage({ guildId }: { guildId: string }) {
  const [navigation, setNavigation] = useState(() => ({
    route: readRpgRoute(location.search),
    revision: 0,
  }));
  const { route, revision } = navigation;
  const { data, status, retry } = useSavedRpgWorld(guildId, route.world, revision);
  useEffect(() => {
    if (!data) document.title = 'Your server town — Dmap';
  }, [data]);
  const travel = useCallback((destination: RpgDestination) => {
    setNavigation((current) => {
      const next = resolveRpgTravel(current.route, destination);
      return {
        route: next,
        revision: current.revision + (current.route.world === next.world ? 0 : 1),
      };
    });
  }, []);
  useEffect(() => {
    history.replaceState(history.state, '', writeRpgRoute(new URL(location.href), route));
  }, [route]);
  useEffect(() => {
    const restore = () =>
      setNavigation((current) => ({
        route: readRpgRoute(location.search),
        revision: current.revision + 1,
      }));
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const samples = useMemo(() => (data ? Object.values(data.document.scenes) : []), [data]);
  const gate =
    status === 'ready' ? undefined : (
      <SavedWorldGate status={status} themeName={RPG_THEMES[route.theme].name} onRetry={retry} />
    );
  if (!data)
    return (
      <main className="rpg-page" data-game-theme={route.theme}>
        {gate}
      </main>
    );
  const sample =
    route.theme === 'dungeon' ? data.document.scenes.dungeon : data.document.scenes.overworld;
  return (
    <RpgPlayPage
      route={route}
      sample={sample}
      samples={samples}
      worldKey={data.document.worldId}
      onTravel={travel}
      server={{
        guildId,
        displayName: data.server.displayName,
        playerName: data.player.displayName,
        bindings: data.bindings,
      }}
      pendingState={gate}
    />
  );
}
