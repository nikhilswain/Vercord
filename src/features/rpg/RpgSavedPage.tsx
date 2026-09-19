import { useCallback, useEffect, useMemo, useState } from 'react';
import { RpgPlayPage } from './RpgPlayPage';
import { presentHouse } from './house/presentation';
import { readRpgRoute, resolveRpgTravel, RPG_THEMES, writeRpgRoute } from './themes';
import type { RpgDestination, RpgSample } from './types';
import { presentTownScene, ROOM_TYPE_LABELS } from './town-presentation';
import { useSavedRpgWorld, type SavedRpgStatus } from './use-saved-rpg-world';
import { useRpgPresence } from './use-rpg-presence';
import { useRpgVoice } from './use-rpg-voice';
import { sampleSceneId, type HouseSceneId } from '../../domain/world/catalog/scenes';
import './rpg.css';
import {
  forestSceneId,
  forestAreaName,
  type ForestDestination,
} from '../../domain/world/forest/catalog';
import { presentForest, withForestTrail } from './forest/presentation';
import { createForestJourney } from './forest/journey-storage';
import { templeSamples } from './forest/temple-presentation';
import { presentTownHall, presentHallCellar } from './town-hall/presentation';
import { RpgStatePanel } from './ui/RpgStatePanel';
import './ui/ornate-ui.css';

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
  forest,
  hall,
}: {
  status: SavedRpgStatus;
  themeName: string;
  onRetry(): void;
  onSquare?: () => void;
  onOutside?: () => void;
  forest?: boolean;
  hall?: boolean;
}) {
  const failure = status !== 'loading' && status !== 'ready' ? failures[status] : null;
  return (
    <RpgStatePanel
      heading="h1"
      error={Boolean(failure)}
      title={
        onOutside && status !== 'signed-out'
          ? failure
            ? forest
              ? 'This trail could not open'
              : hall
                ? 'Town Hall could not open'
                : 'This house could not open'
            : forest
              ? 'Following the forest trail…'
              : hall
                ? 'Opening Town Hall…'
                : 'Opening the house…'
          : onSquare && failure && status !== 'signed-out'
            ? 'This street could not open'
            : (failure?.title ?? 'Opening your town…')
      }
      actions={
        <>
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
              {forest ? 'Return to town' : 'Return outside'}
            </button>
          )}
          <a className="rpg-button rpg-button--quiet" href="/dashboard">
            Choose another server
          </a>
        </>
      }
    >
      {onOutside && failure && status !== 'signed-out'
        ? forest
          ? 'The trail may be unavailable or your access may have changed. You can return to town.'
          : hall
            ? 'Town Hall is unavailable right now. Try again, or return to the square.'
            : 'The house may be unavailable or your access may have changed. You can return outside.'
        : onSquare && failure && status !== 'signed-out'
          ? 'The street may be unavailable or your access may have changed. You can return to the town square.'
          : (failure?.message ?? `Getting ${themeName} ready for you.`)}
    </RpgStatePanel>
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
    route.forest,
  );
  // A scene fetch must not reset the guild's active call or release an in-flight move lock.
  const voice = useRpgVoice(guildId, status !== 'signed-out' && status !== 'forbidden');
  const connection = useRpgPresence({
    guildId,
    data,
    scene:
      route.theme === 'dungeon'
        ? 'dungeon'
        : route.hall
          ? 'town-hall'
          : route.forest
            ? forestSceneId(route.forest)
            : (route.house ?? sampleSceneId({ id: route.theme })),
    active: status === 'ready',
    voice,
    onRefresh: retry,
  });
  const houseRoom = data?.bindings.find((binding) => binding.landmarkId === route.house)?.rooms[0];
  const voiceRoomKey =
    houseRoom?.type === 'voice' || houseRoom?.type === 'stage' ? houseRoom.key : null;
  const followVoiceRoom = voice.followRoom;
  useEffect(() => {
    followVoiceRoom(route.house ?? null, voiceRoomKey, status === 'ready' && connection.ready);
  }, [followVoiceRoom, route.house, voiceRoomKey, status, connection.ready]);
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
  const travelForest = useCallback((destination: ForestDestination) => {
    setNavigation((current) => {
      const next = {
        theme: current.route.world,
        world: current.route.world,
        ...(current.route.street ? { street: current.route.street } : {}),
        ...(destination !== 'town' ? { forest: destination } : {}),
      };
      history.pushState(history.state, '', writeRpgRoute(new URL(location.href), next));
      return { route: next, revision: current.revision };
    });
  }, []);
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
      sampleSceneId(scene) === 'overworld'
        ? withForestTrail(
            data.town ? presentTownScene(scene, data.server.displayName, data.town) : scene,
          )
        : { ...(route.hall ? presentHallCellar(scene) : scene), adventure: { id: 'camp' } },
    );
    if (data.document.scenes.overworld.landmarks.some((l) => l.id === 'town-hall'))
      scenes.push(presentTownHall(data.document.themeId));
    const room = data.bindings.find((binding) => binding.landmarkId === data.interior?.landmarkId)
      ?.rooms[0];
    if (data.interior && room)
      scenes.push({
        ...presentHouse(data.interior),
        sceneId: data.interior.landmarkId,
        name: room.label,
        subtitle: `${ROOM_TYPE_LABELS[room.type]} channel · ${data.server.displayName}`,
      });
    // Keep objective coordinates available from town without preloading both chapters' art.
    scenes.push(
      ...templeSamples.map((sample) =>
        sample.temple === data.forest?.region
          ? sample
          : { ...sample, textures: [], stamps: [], animatedScenery: [] },
      ),
    );
    if (data.forest && !scenes.some((s) => s.sceneId === forestSceneId(data.forest!.region)))
      scenes.push(presentForest(data.forest));
    return scenes;
  }, [data, route.hall]);
  const worldId = data?.document.worldId,
    memberKey = data?.player.memberKey;
  const journey = useMemo(
    () => (worldId && memberKey ? createForestJourney(`${memberKey}:${worldId}`) : undefined),
    [worldId, memberKey],
  );
  const templeBlocked =
    route.forest === 'temple-interior' &&
    journey !== undefined &&
    journey.blockedEntry(templeSamples[1]!.adventure!.definition) !== null;
  useEffect(() => {
    // A bookmark/back navigation cannot strand a new traveler inside a locked chapter.
    // Quest admission is local until adventure progress moves to the backend adapter.
    if (!templeBlocked) return;
    const url = writeRpgRoute(new URL(location.href), { ...route, forest: 'temple' });
    history.replaceState(history.state, '', url);
    // Reuse the page's history subscription, including its request cancellation.
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [templeBlocked, route]);
  useEffect(() => {
    if (!journey) return;
    const save = () => journey.checkpoint(true);
    window.addEventListener('pagehide', save);
    return () => {
      save();
      window.removeEventListener('pagehide', save);
    };
  }, [journey]);
  const gate =
    status === 'ready' ? undefined : (
      <SavedWorldGate
        status={status}
        themeName={
          route.hall && route.theme !== 'dungeon'
            ? 'Town Hall'
            : route.forest
              ? forestAreaName(route.forest)
              : RPG_THEMES[route.theme].name
        }
        onRetry={retry}
        forest={route.forest !== undefined}
        hall={route.hall}
        onOutside={route.house || route.forest || route.hall ? () => travel('return') : undefined}
        onSquare={
          route.street && route.street !== 'square' ? () => selectStreet('square') : undefined
        }
      />
    );
  if (!data || status !== 'ready' || templeBlocked)
    return (
      <main className="rpg-page" data-game-theme={route.theme} data-ui="ornate">
        {gate}
      </main>
    );
  const sample =
    samples.find((scene) =>
      route.theme === 'dungeon'
        ? scene.id === 'dungeon'
        : route.hall
          ? scene.sceneId === 'town-hall'
          : route.forest
            ? scene.sceneId === forestSceneId(route.forest)
            : route.house
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
      onForestTravel={travelForest}
      journey={journey}
      server={{
        guildId,
        displayName: data.server.displayName,
        playerName: data.player.displayName,
        worldId: data.document.worldId,
        memberKey: data.player.memberKey,
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
