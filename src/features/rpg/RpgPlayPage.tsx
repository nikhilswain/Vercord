import { SupplyCacheDialog } from './provisions/SupplyCacheDialog';
import { StationDialog } from './provisions/StationDialog';
import { ProvisionHud } from './provisions/ProvisionHud';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { worldInputBlocked } from '../world/engine/input';
import { RpgStatePanel } from './ui/RpgStatePanel';
import type { SavedWorldResponse, WorldTown } from '../../domain/world/protocol';
import { rpgAppearanceSchema, type RpgPresencePlayer } from '../../domain/presence/rpg-protocol';
import { isHouseSceneId, type HouseSceneId } from '../../domain/world/catalog/scenes';
import type { MapRoom } from '../../domain/map/snapshot';
import { Dialog } from '../../components/Dialog';
import { VirtualJoystick } from '../world/VirtualJoystick';
import { RPG_APPEARANCES } from './character';
import { RpgIcon } from './RpgIcon';
import { RpgPanels, type RpgPanel } from './RpgPanels';
import { RPG_THEMES, RPG_WORLD_IDS, type RpgRoute, type RpgWorldId } from './themes';
import type { RpgDestination, RpgDialogue, RpgSample, RpgUiState } from './types';
import { useRpgGame } from './use-rpg-game';
import type { RpgConnection } from './use-rpg-presence';
import type { RpgVoiceController } from './use-rpg-voice';
import { RpgChannelPanel, RpgVoiceStatus } from './RpgChannelPanel';
import { RpgHouseRoster } from './RpgHouseRoster';
import { AdventureHud } from './demo/AdventureHud';
import type { DemoArea } from './demo/types';
import type { ForestDestination } from '../../domain/world/forest/catalog';
import type { AdventureJourney } from './adventure/journey';
import { useGameMusic } from '../audio/use-game-music';
import { PlayerHud } from './ui/PlayerHud';
import { JourneyTracker } from './journal/JourneyDialog';
import type { JournalObjective } from './journal/model';
import { useMapShortcut } from './atlas/use-map-shortcut';
import { DialoguePanel } from './ui/DialoguePanel';
import { useGameChat } from './chat/use-game-chat';
import { GameChatPanel, GameChatToggle } from './chat/GameChatPanel';
import { PartyIndicator, PartyInvitation, PlayersButton, SocialPanel } from './chat/SocialPanel';
import { CHAT_GUIDE_ID, CHAT_GUIDE, DemoChatTransport } from './chat/demo';
import { NavigationHud } from './navigation/NavigationControls';
import './rpg.css';
import './rpg-house.css';
import { TownHallBoard } from './town-hall/TownHallBoard';
import type { HallBoardId } from '../../domain/world/content/town-hall-v1/scene';
import './demo/demo.css';
import './ui/ornate-ui.css';

function houseTravelers(
  house: HouseSceneId | undefined,
  self: RpgPresencePlayer | null | undefined,
  players: readonly RpgPresencePlayer[] = [],
): RpgPresencePlayer[] {
  if (!house) return [];
  const peers = [...players].sort((a, b) => a.displayName.localeCompare(b.displayName));
  return [
    ...new Map(
      [...(self ? [self] : []), ...peers]
        .filter((player) => player.scene === house)
        .map((player) => [player.id, player]),
    ).values(),
  ];
}

const actions: Array<{ panel: RpgPanel; label: string }> = [
  { panel: 'map', label: 'Map' },
  { panel: 'guide', label: 'Guide' },
  { panel: 'appearance', label: 'Look' },
  { panel: 'menu', label: 'Menu' },
];

interface Props {
  route: RpgRoute;
  sample: RpgSample;
  samples: readonly RpgSample[];
  worldKey: string;
  navigationKey?: string;
  onTravel(destination: RpgDestination): void;
  onDemoTravel?(area: DemoArea): void;
  onForestTravel?(area: ForestDestination): void;
  journey?: AdventureJourney;
  demoTransition?: boolean;
  server?: {
    guildId: string;
    displayName: string;
    playerName: string;
    worldId?: string;
    memberKey?: string;
    bindings: SavedWorldResponse['bindings'];
    town?: WorldTown;
    onStreet(street: string): void;
    onEnterHouse?(landmarkId: HouseSceneId): void;
    connection?: RpgConnection;
    voice?: RpgVoiceController;
    onReconnect?(): void;
  };
  pendingState?: ReactNode;
}

export function RpgPlayPage({
  route,
  sample,
  samples,
  worldKey,
  navigationKey,
  onTravel,
  onDemoTravel,
  onForestTravel,
  journey,
  demoTransition = false,
  server,
  pendingState,
}: Props) {
  const { theme, world } = route;
  const [appearances, setAppearances] = useState<Record<RpgWorldId, string>>(
    () =>
      Object.fromEntries(
        RPG_WORLD_IDS.map((id) => [id, RPG_THEMES[id].defaultAppearance]),
      ) as Record<RpgWorldId, string>,
  );
  const appearance = server?.connection?.self?.appearance ?? appearances[world];
  const [panel, setPanel] = useState<RpgPanel | 'hall-board' | null>(null);
  const [hallBoard, setHallBoard] = useState<HallBoardId>('hall:expeditions');
  const openHallBoard = useCallback((id: HallBoardId) => {
    setHallBoard(id);
    setPanel('hall-board');
  }, []);
  const [mapObjective, setMapObjective] = useState<JournalObjective | null>(null);
  const [mapFocus, setMapFocus] = useState<RpgUiState['position'] | null>(null);
  const [speech, setSpeech] = useState<RpgDialogue | null>(null);
  const [channelOpen, setChannelOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [gameChatOpen, setGameChatOpen] = useState(false);
  const [socialPanel, setSocialPanel] = useState<'players' | null>(null);
  const [socialFocused, setSocialFocused] = useState(false);
  const chat = useGameChat(server?.guildId);
  useEffect(() => {
    const update = () => chat.client.presence(sample.name, document.visibilityState === 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [chat, sample.name]);
  const houseRoom = server?.bindings.find((binding) => binding.landmarkId === route.house)
    ?.rooms[0];
  const channelRoom: MapRoom | null = houseRoom ? { ...houseRoom, order: 0 } : null;
  const occupants = houseTravelers(
    route.house,
    server?.connection?.self,
    server?.connection?.players,
  );
  const roomAction =
    channelRoom?.type === 'voice' || channelRoom?.type === 'stage'
      ? 'Voice'
      : channelRoom?.type === 'forum' || channelRoom?.type === 'media'
        ? 'Posts'
        : 'Chat';
  const networkPending = Boolean(server?.connection && !server.connection.ready);
  const [line, setLine] = useState(0);
  const advanceRef = useRef<HTMLButtonElement>(null);
  const [ui, setUi] = useState<RpgUiState>(() => ({
    theme,
    place: sample.name,
    nearby: null,
    position: sample.spawn,
    zoom: 2,
  }));
  const traveler =
    RPG_APPEARANCES.find((option) => option.id === appearance) ?? RPG_APPEARANCES[0]!;
  const travel = useCallback(
    (destination: RpgDestination) => {
      onTravel(destination);
      setSpeech(null);
      setPanel(null);
    },
    [onTravel],
  );
  const talk = useCallback((dialogue: RpgDialogue) => {
    setLine(0);
    setSpeech(dialogue);
  }, []);
  const selectStreet = useCallback(
    (street: string) => {
      server?.onStreet(street);
      setSpeech(null);
      setPanel(null);
    },
    [server],
  );
  const openHouse = useCallback(
    (landmarkId: string) => {
      if (
        !server?.connection?.ready ||
        !isHouseSceneId(landmarkId) ||
        !server.bindings.some((binding) => binding.landmarkId === landmarkId)
      )
        return;
      server.onEnterHouse?.(landmarkId);
      setPanel(null);
      setSpeech(null);
    },
    [server],
  );
  const { hostRef, canvasRef, runtimeRef, canvasKey, status, retry } = useRpgGame({
    sample,
    samples,
    worldKey,
    appearance,
    blocked:
      demoTransition ||
      Boolean(pendingState) ||
      networkPending ||
      panel !== null ||
      speech !== null ||
      channelOpen ||
      (socialFocused && !gameChatOpen) ||
      rosterOpen,
    onUi: setUi,
    onDialogue: talk,
    onTravel: travel,
    onDemoTravel,
    onForestTravel,
    journey,
    onStreet: server ? selectStreet : undefined,
    onHouse: server?.connection ? openHouse : undefined,
    onHallBoard: openHallBoard,
    onMove: server?.connection?.updateLocation,
    players: server?.connection?.players,
    playerPosition: server?.connection?.position,
  });
  const suspended =
    Boolean(ui.defeated) ||
    Boolean(pendingState) ||
    networkPending ||
    status !== 'ready' ||
    demoTransition;
  const music = useGameMusic(!server, status === 'ready' && !pendingState && !networkPending);
  const hasAdventure = Boolean(ui.adventure);
  const inAdventure = Boolean(sample.adventure?.definition ?? sample.demo?.jungle);
  const openMapShortcut = useCallback(
    (detail: boolean) => {
      setMapObjective(null);
      setMapFocus(detail ? { ...ui.position } : null);
      setPanel('map');
    },
    [ui.position],
  );
  useMapShortcut({
    blocked:
      suspended ||
      Boolean(speech) ||
      channelOpen ||
      rosterOpen ||
      socialFocused ||
      socialPanel !== null,
    mapOpen: panel === 'map',
    otherPanelOpen: panel !== null && panel !== 'map',
    onOpen: openMapShortcut,
  });
  const openGameChat = useCallback(() => {
    setSocialPanel(null);
    setGameChatOpen(true);
  }, []);
  const closeGameChat = useCallback(() => {
    setGameChatOpen(false);
    requestAnimationFrame(() => canvasRef.current?.focus({ preventScroll: true }));
  }, [canvasRef]);
  const openPlayers = useCallback(() => {
    setGameChatOpen(false);
    setSocialPanel('players');
  }, []);
  const closeSocial = useCallback(() => setSocialPanel(null), []);
  useEffect(() => {
    if (suspended) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      // Native modal dialogs own Escape and their focus restoration. Never open Menu behind one.
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      if (speech) setSpeech(null);
      else if (gameChatOpen) setGameChatOpen(false);
      else if (socialPanel) setSocialPanel(null);
      else if (panel) setPanel(null);
      else if (channelOpen || rosterOpen) {
        setChannelOpen(false);
        setRosterOpen(false);
      } else if (!worldInputBlocked(event.target)) setPanel('menu');
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [suspended, speech, gameChatOpen, socialPanel, panel, channelOpen, rosterOpen]);
  const messagePlayer = useCallback(
    (peerId: string) => {
      setSocialPanel(null);
      setGameChatOpen(true);
      chat.client.direct(peerId);
    },
    [chat],
  );
  const openPartyChat = useCallback(
    (roomId: string) => {
      setSocialPanel(null);
      setGameChatOpen(true);
      chat.client.select(roomId);
    },
    [chat],
  );
  useEffect(() => {
    if (suspended || panel || speech || channelOpen || rosterOpen || gameChatOpen) return;
    const openChat = (event: KeyboardEvent) => {
      if (
        event.code !== 'KeyT' ||
        event.repeat ||
        event.isComposing ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        worldInputBlocked(event.target)
      )
        return;
      event.preventDefault();
      openGameChat();
    };
    window.addEventListener('keydown', openChat);
    return () => window.removeEventListener('keydown', openChat);
  }, [suspended, panel, speech, channelOpen, rosterOpen, gameChatOpen, openGameChat]);
  useEffect(() => {
    if (suspended || !hasAdventure || panel || speech || channelOpen || rosterOpen) return;
    const openEquipment = (event: KeyboardEvent) => {
      if (
        event.code !== 'KeyI' ||
        event.repeat ||
        event.isComposing ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        worldInputBlocked(event.target)
      )
        return;
      event.preventDefault();
      setPanel('equipment');
    };
    window.addEventListener('keydown', openEquipment);
    return () => window.removeEventListener('keydown', openEquipment);
  }, [suspended, hasAdventure, panel, speech, channelOpen, rosterOpen]);
  const [overlayOwner, setOverlayOwner] = useState({
    defeated: Boolean(ui.defeated),
    sample,
    navigationKey,
    canvasKey,
    pending: Boolean(pendingState),
    networkPending,
    house: route.house,
  });
  if (
    overlayOwner.defeated !== Boolean(ui.defeated) ||
    overlayOwner.sample !== sample ||
    overlayOwner.navigationKey !== navigationKey ||
    overlayOwner.canvasKey !== canvasKey ||
    overlayOwner.pending !== Boolean(pendingState) ||
    overlayOwner.networkPending !== networkPending ||
    overlayOwner.house !== route.house
  ) {
    // Reset before React commits: Back/refresh must never reopen another street's dialogue.
    setOverlayOwner({
      defeated: Boolean(ui.defeated),
      sample,
      navigationKey,
      canvasKey,
      pending: Boolean(pendingState),
      networkPending,
      house: route.house,
    });
    setPanel(null);
    setSpeech(null);
    setLine(0);
    setChannelOpen(false);
    setRosterOpen(false);
    setGameChatOpen(false);
    setSocialPanel(null);
    setSocialFocused(false);
  }
  const advance = useCallback(() => {
    if (speech && line < speech.lines.length - 1) setLine((value) => value + 1);
    else setSpeech(null);
  }, [speech, line]);
  useEffect(() => {
    document.title = `${server ? `${server.displayName} · ` : ''}${sample.name} — Dmap`;
  }, [sample.name, server]);
  useEffect(() => {
    if (speech) advanceRef.current?.focus();
  }, [speech]);
  useEffect(() => {
    if (!speech) return;
    const handle = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing) return;
      if (speech.npcId === CHAT_GUIDE_ID) return;
      if (
        event.code === 'Enter' &&
        event.target instanceof HTMLElement &&
        event.target.closest('button, a, input, textarea, select')
      )
        return;
      if (event.code === 'KeyE' || event.code === 'Enter') {
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [speech, advance]);

  const connectedKey = server?.voice?.state.voiceState?.channelKey;
  const connectedBinding = connectedKey
    ? server?.bindings.find((binding) => binding.rooms.some((room) => room.key === connectedKey))
    : undefined;
  const connected = connectedBinding?.rooms.find((room) => room.key === connectedKey);
  const connectedRoom: MapRoom | null = connected ? { ...connected, order: 0 } : null;
  const returnToCall = () => {
    const landmark = sample.landmarks.find((entry) => entry.id === connectedBinding?.landmarkId);
    if (route.house && connectedBinding && isHouseSceneId(connectedBinding.landmarkId)) {
      if (connectedBinding.landmarkId === route.house) setChannelOpen(true);
      else server?.onEnterHouse?.(connectedBinding.landmarkId);
    } else if (landmark) runtimeRef.current?.focus?.(landmark);
  };

  return (
    <main
      className={`rpg-page${route.house ? ' rpg-page--house' : ''}`}
      data-game-theme={theme}
      data-demo-area={sample.demo?.area}
      data-adventure={inAdventure}
      data-forest-region={sample.forest?.region}
      data-temple-area={sample.temple}
      data-ui="ornate"
      data-dialogue={!suspended && speech !== null}
      data-defeated={Boolean(ui.defeated)}
    >
      {ui.defeated && (
        <div className="rpg-defeat" role="status" aria-live="assertive">
          <div className="rpg-defeat-message">
            <span className="rpg-defeat-mark" aria-hidden="true">
              ✦
            </span>
            <h2>You fell</h2>
            <p>Your adventure ends here.</p>
            <span>Returning to town…</span>
          </div>
        </div>
      )}
      <div
        ref={hostRef}
        className="rpg-stage"
        style={pendingState ? { visibility: 'hidden' } : undefined}
        inert={suspended}
      >
        <canvas
          key={canvasKey}
          ref={canvasRef}
          className="rpg-canvas"
          tabIndex={0}
          aria-label={`${sample.name}. Move with WASD or arrow keys; ${hasAdventure ? 'aim and left click or tap to attack; middle-button drag or touch drag to look around; J attacks in your facing direction' : 'drag to look around; double-click to walk to a place'}. Press E near a character or landmark.`}
        />
      </div>
      <div
        className="rpg-hud"
        style={pendingState ? { visibility: 'hidden' } : undefined}
        inert={suspended || speech !== null}
      >
        <div className="rpg-player-corner">
          <PlayerHud
            name={server?.playerName ?? traveler.name}
            appearance={traveler.id}
            status={ui.adventure}
            onAppearance={() => setPanel('appearance')}
            onInventory={() => setPanel('equipment')}
          />
          {inAdventure && (
            <ProvisionHud status={ui.adventure} onInventory={() => setPanel('equipment')} />
          )}
          <div className="rpg-player-social">
            <PlayersButton
              client={chat.client}
              onOpen={openPlayers}
              worldOnlineCount={
                server?.connection?.ready ? Math.max(1, server.connection.onlineCount) : undefined
              }
            />
            <PartyIndicator client={chat.client} onOpen={openPartyChat} />
          </div>
          {!suspended && !speech && ui.navigation && (
            <NavigationHud
              state={ui.navigation}
              onStop={() => runtimeRef.current?.stopNavigation?.()}
              onRetry={() => {
                if (ui.navigation) runtimeRef.current?.guideTo?.(ui.navigation.target);
              }}
            />
          )}
          {!suspended && !speech && !ui.navigation && ui.feedback?.startsWith('Arrived at ') && (
            <p className="rpg-navigation-arrival">{ui.feedback}</p>
          )}
          {!suspended && !speech && ui.feedback && !ui.feedback.startsWith('Arrived at ') && (
            <p className="rpg-house-feedback">{ui.feedback}</p>
          )}
          {!suspended && !panel && !speech && sample.demo?.area === 'village' && (
            <details className="rpg-demo-hint">
              <summary>Village guide</summary>
              <p>
                Choose your traveler in <strong>Look</strong>. Meet Juniper by the northwest grove,
                then enter the jungle to learn magic.
              </p>
              <button
                onClick={() => {
                  const entrance = sample.landmarks.find(
                    (p) => p.id === sample.demo?.portals[0]?.id,
                  );
                  if (entrance) runtimeRef.current?.focus?.(entrance);
                }}
              >
                Find jungle entrance ↖
              </button>
            </details>
          )}
          {ui.journal?.objective && ui.journal.pinned === ui.journal.objective.id && (
            <JourneyTracker
              objective={ui.journal.objective}
              onOpen={() => setPanel('journey')}
              onUnpin={() => runtimeRef.current?.setJournal?.({ pinned: null })}
            />
          )}
          {!suspended &&
            !panel &&
            !speech &&
            !sample.forest &&
            !sample.temple &&
            sample.forestPortals && (
              <details className="rpg-demo-hint">
                <summary>Beyond the town</summary>
                <p>
                  Follow the Mosswild trail to explore the forest. Its marked paths lead back here.
                </p>
                <button
                  onClick={() => {
                    const entrance = sample.forestPortals?.find(
                      (portal) => portal.target === 'verge',
                    );
                    if (entrance) runtimeRef.current?.focus?.(entrance);
                  }}
                >
                  Find the forest trail
                </button>
              </details>
            )}
        </div>
        <header key={sample.name} className="rpg-location rpg-frame">
          {server && (
            <span className="rpg-kicker rpg-kicker--server" title={server.displayName}>
              {server.displayName}
            </span>
          )}
          <h1 title={sample.name} className={server?.town ? 'rpg-town-location' : undefined}>
            {sample.name}
          </h1>
          <p title={sample.subtitle}>
            {inAdventure || route.house || route.hall || (server?.town && theme !== 'dungeon')
              ? sample.subtitle
              : ui.theme === theme
                ? ui.place
                : sample.subtitle}
          </p>
        </header>
        {!suspended && !panel && !speech && inAdventure && ui.adventure && (
          <AdventureHud
            status={ui.adventure}
            onAttack={() => runtimeRef.current?.attack?.()}
            onHeal={() => runtimeRef.current?.heal?.()}
            onBuff={() =>
              runtimeRef.current?.useInventoryItem?.(
                ui.adventure?.provisions?.quickBuff ?? 'battle-bottle',
              )
            }
            onSpell={(spell) => runtimeRef.current?.selectSpell?.(spell)}
            onMelee={() => runtimeRef.current?.selectMelee?.()}
          />
        )}
        {channelRoom && (
          <nav className="rpg-house-tools" aria-label="House tools">
            <button className="rpg-button" onClick={() => setChannelOpen(true)}>
              {roomAction}
            </button>
            <button className="rpg-button" onClick={() => setRosterOpen(true)}>
              In this room · {occupants.length}
            </button>
            <button className="rpg-button" onClick={() => travel('return')}>
              Leave house
            </button>
          </nav>
        )}
        {status === 'ready' &&
          (ui.pickup || ui.nearby) &&
          ui.following !== false &&
          !panel &&
          !speech && (
            <button
              className="rpg-interact rpg-button"
              onClick={() =>
                ui.pickup ? runtimeRef.current?.pickupLoot?.() : runtimeRef.current?.interact()
              }
            >
              <span className="rpg-context-star" aria-hidden="true">
                ✦
              </span>
              <span>
                {ui.pickup
                  ? 'Pick up'
                  : ui.nearby?.action === 'Talk'
                    ? 'Talk to'
                    : ui.nearby?.action}{' '}
                <strong>{ui.pickup?.label ?? ui.nearby?.label}</strong>
              </span>
              <kbd>{ui.pickup ? 'F' : 'E'}</kbd>
            </button>
          )}
        <span className="rpg-feedback-accessible" role="status">
          {ui.feedback}
        </span>
        <nav className="rpg-action-bar rpg-frame" aria-label="Exploration tools">
          {actions.map((action) => (
            <button
              key={action.panel}
              aria-label={action.panel === 'appearance' ? 'Choose appearance' : action.label}
              aria-pressed={panel === action.panel}
              onClick={() => {
                setMapObjective(null);
                setMapFocus(null);
                setPanel(action.panel);
              }}
            >
              <span>{action.label}</span>
            </button>
          ))}
        </nav>
        <details className="rpg-camera" aria-label="Camera controls">
          <summary>
            <RpgIcon name="center" />
            <span>View</span>
          </summary>
          <div className="rpg-camera-tools">
            <button
              aria-label="Zoom in"
              disabled={
                status !== 'ready' ||
                ui.zoom >= (typeof window !== 'undefined' && window.innerWidth < 700 ? 3 : 4)
              }
              onClick={() => runtimeRef.current?.zoomBy(2)}
            >
              <RpgIcon name="plus" />
            </button>
            <span aria-label={`Zoom ${Math.round(ui.zoom * 100)} percent`}>
              {Number(ui.zoom.toFixed(2))}×
            </span>
            <button
              aria-label="Zoom out"
              disabled={status !== 'ready' || ui.zoom <= (ui.minZoom ?? 0.25) + 0.001}
              onClick={() => runtimeRef.current?.zoomBy(0.5)}
            >
              <RpgIcon name="minus" />
            </button>
            <button
              aria-label={
                sample.sceneId === 'town-hall'
                  ? 'View whole hall'
                  : route.house
                    ? 'View whole room'
                    : 'View whole town'
              }
              disabled={status !== 'ready'}
              onClick={() => runtimeRef.current?.overview?.()}
            >
              <RpgIcon name="map" />
            </button>
            <button
              aria-label="Center on traveler"
              disabled={status !== 'ready'}
              onClick={() => runtimeRef.current?.center()}
            >
              <RpgIcon name="center" />
            </button>
          </div>
        </details>
        {!suspended && !speech && !gameChatOpen && !socialPanel && (
          <GameChatToggle client={chat.client} onOpen={openGameChat} />
        )}
        {status === 'ready' &&
          !suspended &&
          !panel &&
          !speech &&
          !channelOpen &&
          !rosterOpen &&
          !socialFocused && (
            <VirtualJoystick
              onChange={(x, y, sprint) => runtimeRef.current?.setVirtualAxis(x, y, sprint)}
            />
          )}
      </div>
      {server?.voice && !suspended && !channelOpen && !rosterOpen && (
        <RpgVoiceStatus
          className="rpg-call-status"
          guildId={server.guildId}
          currentRoom={null}
          connectedRoom={connectedRoom}
          voice={server.voice}
          onReturn={returnToCall}
        />
      )}
      {pendingState ??
        (status !== 'ready' && (
          <RpgStatePanel
            error={status === 'error'}
            title={status === 'error' ? 'The path could not open' : 'A little world is waking up…'}
            actions={
              status === 'error' && (
                <>
                  <button className="rpg-button" onClick={retry}>
                    Try again
                  </button>
                  <a
                    className="rpg-button rpg-button--quiet"
                    href={server ? '/dashboard' : '/map/demo?renderer=2d'}
                  >
                    {server ? 'Choose another server' : 'Open the original 2D demo'}
                  </a>
                </>
              )
            }
          >
            {status === 'error'
              ? 'The game artwork or graphics could not load. Try opening the path again.'
              : `Getting ${sample.name} ready for you.`}
          </RpgStatePanel>
        ))}
      {!pendingState && status === 'ready' && networkPending && (
        <RpgStatePanel
          kicker={server?.displayName}
          title={
            server?.connection?.connection === 'offline'
              ? 'Reconnecting to town…'
              : 'Joining your town…'
          }
          actions={
            <>
              <button className="rpg-button" onClick={server?.onReconnect}>
                Try again
              </button>
              <a className="rpg-button rpg-button--quiet" href="/dashboard">
                Choose another server
              </a>
            </>
          }
        >
          Waiting for your traveler and the other members to arrive.
        </RpgStatePanel>
      )}
      {ui.supplyCache && ui.adventure && (
        <SupplyCacheDialog
          status={ui.adventure}
          onClose={() => {
            runtimeRef.current?.closeSupplyCache?.();
            requestAnimationFrame(() => canvasRef.current?.focus());
          }}
          onTake={(id) => {
            const result = runtimeRef.current?.takeSupplyCache?.(id) ?? 'Cache unavailable.';
            if (result === 'Collected.') requestAnimationFrame(() => canvasRef.current?.focus());
            return result;
          }}
        />
      )}
      {ui.station && ui.adventure && (
        <StationDialog
          key={ui.station.id}
          station={ui.station}
          status={ui.adventure}
          onCraft={(...args) => runtimeRef.current?.craftInventoryItem?.(...args)}
          onTrack={(id) => runtimeRef.current?.configureProvisions?.({ trackedRecipe: id })}
          onAction={(action) =>
            runtimeRef.current?.stationAction?.(action) ?? 'The station is unavailable.'
          }
          onClose={() => {
            runtimeRef.current?.closeStation?.();
            requestAnimationFrame(() => canvasRef.current?.focus());
          }}
        />
      )}
      {!suspended && panel === 'hall-board' && (
        <TownHallBoard
          board={hallBoard}
          client={chat.client}
          ui={ui}
          playerName={server?.playerName ?? traveler.name}
          onClose={() => {
            setPanel(null);
            requestAnimationFrame(() => canvasRef.current?.focus());
          }}
          onJourney={() => setPanel('journey')}
          onInventory={() => setPanel('equipment')}
          onShowObjective={(objective) => {
            setMapFocus(null);
            setMapObjective(objective);
            setPanel('map');
          }}
          onMessage={(id) => {
            setPanel(null);
            messagePlayer(id);
          }}
          onBoard={openHallBoard}
        />
      )}
      <RpgPanels
        panel={suspended || panel === 'hall-board' ? null : panel}
        theme={theme}
        world={world}
        appearance={appearance}
        ui={ui}
        sample={sample}
        samples={samples}
        mapObjective={mapObjective}
        mapFocus={mapFocus}
        onJourney={() => setPanel('journey')}
        onJournalChange={(preferences) => runtimeRef.current?.setJournal?.(preferences)}
        onShowObjective={(objective) => {
          setMapFocus(null);
          setMapObjective(objective);
          setPanel('map');
        }}
        house={route.house}
        hall={route.hall}
        server={server ? { ...server, onStreet: selectStreet } : undefined}
        music={music}
        onSettings={() => setPanel('settings')}
        onClose={() => {
          setPanel(null);
          requestAnimationFrame(() => canvasRef.current?.focus());
        }}
        onEquip={(id) => runtimeRef.current?.equipWeapon?.(id) ?? false}
        onUseItem={(id) => {
          const result = runtimeRef.current?.useInventoryItem?.(id);
          if (result?.success) {
            setPanel(null);
            requestAnimationFrame(() => canvasRef.current?.focus());
          }
          return result;
        }}
        onConfigureProvisions={(settings) => runtimeRef.current?.configureProvisions?.(settings)}
        onFindSource={(id) => {
          const result = runtimeRef.current?.guideToSupply?.(id);
          if (result?.ok) {
            setPanel(null);
            return 'Trail selected.';
          }
          return (
            (result && !result.ok ? result.message : undefined) ??
            'No source found in this area. Check the recipe for its habitat.'
          );
        }}
        onCraftItem={(id) => runtimeRef.current?.craftInventoryItem?.(id)}
        onReturnToTown={() => {
          setPanel(null);
          runtimeRef.current?.returnToTown?.();
        }}
        onApplyEnemyLevel={(level) => runtimeRef.current?.setEnemyLevel?.(level)}
        onTheme={travel}
        onAppearance={(id) => {
          const parsed = rpgAppearanceSchema.safeParse(id);
          if (server?.connection && parsed.success) server.connection.setAppearance(parsed.data);
          else setAppearances((current) => ({ ...current, [world]: id }));
        }}
        onFocus={(point) => {
          runtimeRef.current?.focus?.(point);
          setPanel(null);
        }}
        onNavigate={(target) => {
          const result = runtimeRef.current?.guideTo?.(target) ?? {
            ok: false as const,
            message: 'The world is still loading. Try again in a moment.',
          };
          if (result.ok) {
            setPanel(null);
            requestAnimationFrame(() => canvasRef.current?.focus());
          }
          return result;
        }}
        onStopNavigation={() => runtimeRef.current?.stopNavigation?.()}
      />
      <Dialog
        open={!suspended && channelOpen && channelRoom !== null}
        title={channelRoom ? `# ${channelRoom.label}` : ''}
        className="rpg-dialog rpg-dialog--channel"
        onClose={() => setChannelOpen(false)}
        footer={
          <button className="rpg-button" onClick={() => setChannelOpen(false)}>
            Back to room <kbd>Esc</kbd>
          </button>
        }
      >
        {!suspended && channelOpen && channelRoom && server?.connection && server.voice && (
          <RpgChannelPanel
            key={channelRoom.key}
            guildId={server.guildId}
            room={channelRoom}
            connection={server.connection.connection}
            liveMessage={server.connection.liveMessage}
            readMessages={server.connection.readMessages}
            sendMessage={server.connection.sendMessage}
            voice={server.voice}
            connectedRoom={connectedRoom}
            onReturnToCall={returnToCall}
          />
        )}
      </Dialog>
      {route.house && !suspended && rosterOpen && (
        <RpgHouseRoster
          key={route.house}
          open
          house={route.house}
          roomName={channelRoom?.label ?? sample.name}
          players={occupants}
          selfId={server?.connection?.self?.id}
          onClose={() => setRosterOpen(false)}
        />
      )}
      <DialoguePanel
        open={!suspended && speech !== null}
        dialogue={speech}
        line={line}
        advanceRef={advanceRef}
        onAdvance={advance}
        onClose={() => setSpeech(null)}
        choices={
          !server && speech?.npcId === CHAT_GUIDE_ID
            ? [
                {
                  id: 'join-party',
                  label: 'Join Wren’s trail party',
                  onSelect: () => {
                    if (chat.transport instanceof DemoChatTransport) chat.transport.inviteParty();
                    setSpeech(null);
                  },
                },
                {
                  id: 'direct-chat',
                  label: 'Send Wren a direct message',
                  onSelect: () => {
                    setSpeech(null);
                    setGameChatOpen(true);
                    chat.client.direct(CHAT_GUIDE.id);
                  },
                },
              ]
            : []
        }
      />
      <GameChatPanel
        key={server?.guildId ?? 'demo'}
        client={chat.client}
        open={!suspended && !panel && !speech && !channelOpen && !rosterOpen && gameChatOpen}
        onClose={closeGameChat}
        onPlayers={openPlayers}
        onFocusChange={setSocialFocused}
      />
      <SocialPanel
        key={`${server?.guildId ?? 'demo'}:${socialPanel ?? 'closed'}`}
        client={chat.client}
        open={
          !suspended && !panel && !speech && !channelOpen && !rosterOpen && socialPanel !== null
        }
        onClose={closeSocial}
        onMessage={messagePlayer}
        onFocusChange={setSocialFocused}
      />
      <PartyInvitation
        client={chat.client}
        visible={!suspended && !panel && !speech && !channelOpen && !rosterOpen}
        onFocusChange={setSocialFocused}
      />
    </main>
  );
}
