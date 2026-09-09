import { useCallback, useEffect, useMemo, useState } from 'react';
import { RpgPlayPage } from './RpgPlayPage';
import { readRpgRoute, resolveRpgTravel, RPG_THEMES, writeRpgRoute } from './themes';
import type { RpgDestination } from './types';
import { presentTownScene } from './town-presentation';
import { useSavedRpgWorld, type SavedRpgStatus } from './use-saved-rpg-world';
import { useRpgPresence } from './use-rpg-presence';
import { useRpgVoice } from './use-rpg-voice';
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
  onSquare,
}: {
  status: SavedRpgStatus;
  themeName: string;
  onRetry(): void;
  onSquare?: () => void;
}) {
  const failure = status !== 'loading' && status !== 'ready' ? failures[status] : null;
  return (
    <div className="rpg-state" role={failure ? 'alert' : 'status'}>
      <div className="rpg-frame">
        <span className="rpg-kicker">Dmap</span>
        <h1>
          {onSquare && failure && status !== 'signed-out'
            ? 'This street could not open'
            : (failure?.title ?? 'Opening your town…')}
        </h1>
        <p>
          {onSquare && failure && status !== 'signed-out'
            ? 'The street may be unavailable or your access may have changed. You can return to the town square.'
            : (failure?.message ?? `Getting ${themeName} ready for you.`)}
        </p>
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
          {onSquare && failure && status !== 'signed-out' && (
            <button className="rpg-button" onClick={onSquare}>
              Go to town square
            </button>
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
  const { data, status, retry } = useSavedRpgWorld(guildId, route.world, revision, route.street);
  const voice = useRpgVoice(guildId, status === 'ready');
  const connection = useRpgPresence({
    guildId,
    data,
    scene: route.theme === 'dungeon' ? 'dungeon' : 'overworld',
    active: status === 'ready',
    voice,
    onRefresh: retry,
  });
  useEffect(() => {
    if (!data) document.title = 'Your server town — Dmap';
  }, [data]);
  const travel = useCallback(
    (destination: RpgDestination) => {
      const next = resolveRpgTravel(navigation.route, destination);
      const url = writeRpgRoute(new URL(location.href), next);
      if (url.href !== location.href) history.pushState(history.state, '', url);
      setNavigation({
        route: next,
        revision: navigation.revision + (navigation.route.world === next.world ? 0 : 1),
      });
    },
    [navigation],
  );
  const selectStreet = useCallback(
    (street: string) => {
      const next = { ...navigation.route, theme: navigation.route.world, street };
      const url = writeRpgRoute(new URL(location.href), next);
      if (url.href !== location.href) history.pushState(history.state, '', url);
      setNavigation({ route: next, revision: navigation.revision + 1 });
    },
    [navigation],
  );
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
  const samples = useMemo(
    () =>
      data
        ? Object.values(data.document.scenes).map((scene) =>
            data.town ? presentTownScene(scene, data.server.displayName, data.town) : scene,
          )
        : [],
    [data],
  );
  const gate =
    status === 'ready' ? undefined : (
      <SavedWorldGate
        status={status}
        themeName={RPG_THEMES[route.theme].name}
        onRetry={retry}
        onSquare={
          route.street && route.street !== 'square' ? () => selectStreet('square') : undefined
        }
      />
    );
  if (!data)
    return (
      <main className="rpg-page" data-game-theme={route.theme}>
        {gate}
      </main>
    );
  const sample = samples.find((scene) => scene.id === route.theme) ?? samples[0]!;
  return (
    <RpgPlayPage
      route={route}
      sample={sample}
      samples={samples}
      worldKey={`${data.document.worldId}/${data.town?.continuous ? 'town' : (data.town?.activeStreetId ?? 'square')}`}
      navigationKey={`${guildId}/${route.theme}/${route.street ?? ''}/${revision}`}
      onTravel={travel}
      server={{
        guildId,
        displayName: data.server.displayName,
        playerName: data.player.displayName,
        bindings: data.bindings,
        town: data.town,
        onStreet: selectStreet,
        connection,
        voice,
        onReconnect: retry,
      }}
      pendingState={gate}
    />
  );
}
