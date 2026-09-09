import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SavedWorldResponse, WorldTown } from '../../domain/world/protocol';
import { rpgAppearanceSchema, type RpgPresencePlayer } from '../../domain/presence/rpg-protocol';
import { isHouseSceneId, type HouseSceneId } from '../../domain/world/catalog/scenes';
import type { MapRoom } from '../../domain/map/snapshot';
import { Dialog } from '../../components/Dialog';
import { VirtualJoystick } from '../world/VirtualJoystick';
import { RPG_APPEARANCES } from './character';
import { RpgIcon, type RpgIconName } from './RpgIcon';
import { RpgPanels, type RpgPanel } from './RpgPanels';
import { RPG_THEMES, RPG_WORLD_IDS, type RpgRoute, type RpgWorldId } from './themes';
import type { RpgDestination, RpgDialogue, RpgSample, RpgUiState } from './types';
import { useRpgGame } from './use-rpg-game';
import type { RpgConnection } from './use-rpg-presence';
import type { RpgVoiceController } from './use-rpg-voice';
import { RpgChannelPanel, RpgVoiceStatus } from './RpgChannelPanel';
import { RpgHouseRoster } from './RpgHouseRoster';
import './rpg.css';
import './rpg-house.css';

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

const actions: Array<{ panel: RpgPanel; icon: RpgIconName; label: string }> = [
  { panel: 'map', icon: 'map', label: 'Map' },
  { panel: 'guide', icon: 'guide', label: 'Guide' },
  { panel: 'appearance', icon: 'person', label: 'Look' },
  { panel: 'menu', icon: 'menu', label: 'Menu' },
];

interface Props {
  route: RpgRoute;
  sample: RpgSample;
  samples: readonly RpgSample[];
  worldKey: string;
  navigationKey?: string;
  onTravel(destination: RpgDestination): void;
  server?: {
    guildId: string;
    displayName: string;
    playerName: string;
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
  const [panel, setPanel] = useState<RpgPanel | null>(null);
  const [speech, setSpeech] = useState<RpgDialogue | null>(null);
  const [channelOpen, setChannelOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
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
  const speaker = RPG_APPEARANCES.find((option) => option.id === speech?.appearance);
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
      Boolean(pendingState) ||
      networkPending ||
      panel !== null ||
      speech !== null ||
      channelOpen ||
      rosterOpen,
    onUi: setUi,
    onDialogue: talk,
    onTravel: travel,
    onStreet: server ? selectStreet : undefined,
    onHouse: server?.connection ? openHouse : undefined,
    onMove: server?.connection?.updateLocation,
    players: server?.connection?.players,
    playerPosition: server?.connection?.position,
  });
  const suspended = Boolean(pendingState) || networkPending || status !== 'ready';
  const [overlayOwner, setOverlayOwner] = useState({
    sample,
    navigationKey,
    canvasKey,
    pending: Boolean(pendingState),
    networkPending,
    house: route.house,
  });
  if (
    overlayOwner.sample !== sample ||
    overlayOwner.navigationKey !== navigationKey ||
    overlayOwner.canvasKey !== canvasKey ||
    overlayOwner.pending !== Boolean(pendingState) ||
    overlayOwner.networkPending !== networkPending ||
    overlayOwner.house !== route.house
  ) {
    // Reset before React commits: Back/refresh must never reopen another street's dialogue.
    setOverlayOwner({
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
    <main className={`rpg-page${route.house ? ' rpg-page--house' : ''}`} data-game-theme={theme}>
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
          aria-label={`${sample.name}. Move with WASD or arrow keys; drag to look around; double-click to walk to a place. Press E near a character or landmark.`}
        />
      </div>
      <div
        className="rpg-hud"
        style={pendingState ? { visibility: 'hidden' } : undefined}
        inert={suspended}
      >
        <button
          className="rpg-identity rpg-frame"
          onClick={() => setPanel('appearance')}
          aria-label={`Change appearance${server ? ` for ${server.playerName}` : ''}, currently ${traveler.name}`}
        >
          <img src={traveler.portraitUrl} width="56" height="56" alt="" />
          <span>
            <strong>{server?.playerName ?? traveler.name}</strong>
            <small>{server ? `${traveler.name} · You` : 'Traveler · You'}</small>
          </span>
        </button>
        <header className="rpg-location rpg-frame">
          <span
            className={server ? 'rpg-kicker rpg-kicker--server' : 'rpg-kicker'}
            title={server?.displayName}
          >
            {route.house ? 'Inside a channel house' : RPG_THEMES[theme].label}
            {server?.town?.continuous ? '' : ` · ${server?.displayName ?? 'Local preview'}`}
          </span>
          <h1 title={sample.name} className={server?.town ? 'rpg-town-location' : undefined}>
            {sample.name}
          </h1>
          <p title={sample.subtitle}>
            {route.house || (server?.town && theme !== 'dungeon')
              ? sample.subtitle
              : ui.theme === theme
                ? ui.place
                : sample.subtitle}
          </p>
        </header>
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
        {status === 'ready' && ui.nearby && ui.following !== false && !panel && !speech && (
          <button
            className="rpg-interact rpg-button"
            onClick={() => runtimeRef.current?.interact()}
          >
            <kbd>E</kbd>
            <span>
              {ui.nearby.action === 'Talk' ? 'Talk to' : ui.nearby.action}{' '}
              <strong>{ui.nearby.label}</strong>
            </span>
          </button>
        )}
        <nav className="rpg-action-bar rpg-frame" aria-label="Exploration tools">
          {actions.map((action) => (
            <button
              key={action.panel}
              aria-label={action.panel === 'appearance' ? 'Choose appearance' : action.label}
              onClick={() => setPanel(action.panel)}
            >
              <RpgIcon name={action.icon} />
              <span>{action.label}</span>
            </button>
          ))}
        </nav>
        <div className="rpg-camera rpg-frame" aria-label="Camera controls">
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
            aria-label={route.house ? 'View whole room' : 'View whole town'}
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
        <p className="rpg-movement-hint">
          <kbd>W A S D</kbd> to walk <span>·</span> <kbd>Shift</kbd> to run <span>·</span> Drag to
          look around
        </p>
        {status === 'ready' && !suspended && !panel && !speech && !channelOpen && !rosterOpen && (
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
      {server?.connection && !suspended && !route.house && (
        <span className="rpg-town-presence" role="status">
          {server.connection.onlineCount}{' '}
          {server.connection.onlineCount === 1 ? 'traveler' : 'travelers'} here
        </span>
      )}
      {pendingState ??
        (status !== 'ready' && (
          <div className="rpg-state" role={status === 'error' ? 'alert' : 'status'}>
            <div className="rpg-frame">
              <span className="rpg-kicker">Dmap</span>
              <h2>
                {status === 'error' ? 'The path could not open' : 'A little world is waking up…'}
              </h2>
              <p>
                {status === 'error'
                  ? 'The game artwork or graphics could not load. Try opening the path again.'
                  : `Getting ${sample.name} ready for you.`}
              </p>
              {status === 'error' && (
                <div className="rpg-state-actions">
                  <button className="rpg-button" onClick={retry}>
                    Try again
                  </button>
                  <a href={server ? '/dashboard' : '/map/demo?renderer=2d'}>
                    {server ? 'Choose another server' : 'Open the original 2D demo'}
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
      {!pendingState && status === 'ready' && networkPending && (
        <div className="rpg-state" role="status">
          <div className="rpg-frame">
            <span className="rpg-kicker">{server?.displayName}</span>
            <h2>
              {server?.connection?.connection === 'offline'
                ? 'Reconnecting to town…'
                : 'Joining your town…'}
            </h2>
            <p>Waiting for your traveler and the other members to arrive.</p>
            <div className="rpg-state-actions">
              <button className="rpg-button" onClick={server?.onReconnect}>
                Try again
              </button>
              <a href="/dashboard">Choose another server</a>
            </div>
          </div>
        </div>
      )}
      <RpgPanels
        panel={suspended ? null : panel}
        theme={theme}
        world={world}
        appearance={appearance}
        ui={ui}
        sample={sample}
        house={route.house}
        server={server ? { ...server, onStreet: selectStreet } : undefined}
        onClose={() => setPanel(null)}
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
      <Dialog
        open={!suspended && speech !== null}
        title={speech?.name ?? ''}
        className="rpg-dialog rpg-dialog--speech"
        onClose={() => setSpeech(null)}
        footer={
          <>
            <span className="rpg-dialog-count">
              {line + 1} / {speech?.lines.length ?? 1}
            </span>
            <button className="rpg-button rpg-button--quiet" onClick={() => setSpeech(null)}>
              Leave
            </button>
            <button ref={advanceRef} className="rpg-button" onClick={advance}>
              {speech && line < speech.lines.length - 1 ? 'Continue' : 'Until next time'}{' '}
              <kbd>↵</kbd>
            </button>
          </>
        }
      >
        <p className="rpg-speaker-role">{speech?.role}</p>
        <div className="rpg-speech-content">
          {speaker && <img src={speaker.portraitUrl} width="80" height="80" alt="" />}
          <p aria-live="polite">{speech?.lines[line]}</p>
        </div>
      </Dialog>
    </main>
  );
}
