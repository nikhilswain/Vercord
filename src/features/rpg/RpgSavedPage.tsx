import { useCallback, useEffect, useMemo, useState } from 'react';
import { RpgPlayPage } from './RpgPlayPage';
import { readRpgRoute, resolveRpgTravel, RPG_THEMES, writeRpgRoute } from './themes';
import type { RpgDestination, RpgSample } from './types';
import { presentTownScene, ROOM_TYPE_LABELS } from './town-presentation';
import { useSavedRpgWorld, type SavedRpgStatus } from './use-saved-rpg-world';
import { useRpgPresence } from './use-rpg-presence';
import { useRpgVoice } from './use-rpg-voice';
import { sampleSceneId, type HouseSceneId } from '../../domain/world/catalog/scenes';
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
  onOutside,
}: {
  status: SavedRpgStatus;
  themeName: string;
  onRetry(): void;
  onSquare?: () => void;
  onOutside?: () => void;
}) {
  const failure = status !== 'loading' && status !== 'ready' ? failures[status] : null;
  return (
    <div className="rpg-state" role={failure ? 'alert' : 'status'}>
      <div className="rpg-frame">
        <span className="rpg-kicker">Dmap</span>
        <h1>
          {onOutside && status !== 'signed-out'
            ? failure
              ? 'This house could not open'
              : 'Opening the house…'
            : onSquare && failure && status !== 'signed-out'
              ? 'This street could not open'
              : (failure?.title ?? 'Opening your town…')}
        </h1>
        <p>
          {onOutside && failure && status !== 'signed-out'
            ? 'The house may be unavailable or your access may have changed. You can return outside.'
            : onSquare && failure && status !== 'signed-out'
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
          {onOutside && status !== 'signed-out' && (
            <button className="rpg-button" onClick={onOutside}>
              Return outside
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
  const { data, status, retry } = useSavedRpgWorld(
    guildId,
    route.world,
    revision,
    route.street,
    route.house,
  );
  const voice = useRpgVoice(guildId, status === 'ready');
  const connection = useRpgPresence({
    guildId,
    data,
    scene: route.house ?? sampleSceneId({ id: route.theme }),
    active: status === 'ready',
    voice,
    onRefresh: retry,
  });
  useEffect(() => {
    if (status !== 'ready') document.title = 'Your server town — Dmap';
  }, [status]);
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
      const next = { world: navigation.route.world, theme: navigation.route.world, street };
      const url = writeRpgRoute(new URL(location.href), next);
      if (url.href !== location.href) history.pushState(history.state, '', url);
      setNavigation({ route: next, revision: navigation.revision + 1 });
    },
    [navigation],
  );
  const enterHouse = useCallback(
    (house: HouseSceneId) => {
      if (!connection.ready || !data?.bindings.some((binding) => binding.landmarkId === house))
        return;
      const next = { ...navigation.route, theme: navigation.route.world, house };
      const url = writeRpgRoute(new URL(location.href), next);
      if (url.href !== location.href) history.pushState(history.state, '', url);
      setNavigation({ route: next, revision: navigation.revision });
    },
    [connection.ready, data, navigation],
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
  const samples = useMemo((): RpgSample[] => {
    if (!data) return [];
    const scenes: RpgSample[] = Object.values(data.document.scenes).map((scene) =>
      data.town ? presentTownScene(scene, data.server.displayName, data.town) : scene,
    );
    const room = data.bindings.find((binding) => binding.landmarkId === data.interior?.landmarkId)
      ?.rooms[0];
    if (data.interior && room)
      scenes.push({
        ...data.interior.scene,
        sceneId: data.interior.landmarkId,
        name: room.label,
        subtitle: `${ROOM_TYPE_LABELS[room.type]} channel · ${data.server.displayName}`,
      });
    return scenes;
  }, [data]);
  const gate =
    status === 'ready' ? undefined : (
      <SavedWorldGate
        status={status}
        themeName={RPG_THEMES[route.theme].name}
        onRetry={retry}
        onOutside={route.house ? () => travel('return') : undefined}
        onSquare={
          route.street && route.street !== 'square' ? () => selectStreet('square') : undefined
        }
      />
    );
  if (!data || status !== 'ready')
    return (
      <main className="rpg-page" data-game-theme={route.theme}>
        {gate}
      </main>
    );
  const sample =
    samples.find((scene) =>
      route.house
        ? scene.sceneId === route.house
        : scene.id === route.theme && scene.sceneId === undefined,
    ) ?? samples[0]!;
  return (
    <RpgPlayPage
      route={route}
      sample={sample}
      samples={samples}
      worldKey={`${data.document.worldId}/${data.town?.continuous ? 'town' : (data.town?.activeStreetId ?? 'square')}/${route.house ?? 'outdoors'}`}
      navigationKey={`${guildId}/${route.theme}/${route.street ?? ''}/${route.house ?? ''}/${revision}`}
      onTravel={travel}
      server={{
        guildId,
        displayName: data.server.displayName,
        playerName: data.player.displayName,
        bindings: data.bindings,
        town: data.town,
        onStreet: selectStreet,
        onEnterHouse: enterHouse,
        connection,
        voice,
        onReconnect: retry,
      }}
      pendingState={gate}
    />
  );
}
