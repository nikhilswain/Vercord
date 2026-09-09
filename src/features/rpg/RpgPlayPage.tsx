import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SavedWorldResponse, WorldTown } from '../../domain/world/protocol';
import { Dialog } from '../../components/Dialog';
import { VirtualJoystick } from '../world/VirtualJoystick';
import { RPG_APPEARANCES } from './character';
import { RpgIcon, type RpgIconName } from './RpgIcon';
import { RpgPanels, type RpgPanel } from './RpgPanels';
import { RPG_THEMES, type RpgRoute, type RpgWorldId } from './themes';
import type { RpgDestination, RpgDialogue, RpgSample, RpgUiState } from './types';
import { useRpgGame } from './use-rpg-game';
import './rpg.css';

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
  const [appearances, setAppearances] = useState<Record<RpgWorldId, string>>({
    village: RPG_THEMES.village.defaultAppearance,
    norse: RPG_THEMES.norse.defaultAppearance,
  });
  const appearance = appearances[world];
  const [panel, setPanel] = useState<RpgPanel | null>(null);
  const [speech, setSpeech] = useState<RpgDialogue | null>(null);
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
  const { hostRef, canvasRef, runtimeRef, canvasKey, status, retry } = useRpgGame({
    sample,
    samples,
    worldKey,
    appearance,
    blocked: Boolean(pendingState) || panel !== null || speech !== null,
    onUi: setUi,
    onDialogue: talk,
    onTravel: travel,
    onStreet: server ? selectStreet : undefined,
  });
  const suspended = Boolean(pendingState) || status !== 'ready';
  const [overlayOwner, setOverlayOwner] = useState({
    sample,
    navigationKey,
    canvasKey,
    pending: Boolean(pendingState),
  });
  if (
    overlayOwner.sample !== sample ||
    overlayOwner.navigationKey !== navigationKey ||
    overlayOwner.canvasKey !== canvasKey ||
    overlayOwner.pending !== Boolean(pendingState)
  ) {
    // Reset before React commits: Back/refresh must never reopen another street's dialogue.
    setOverlayOwner({ sample, navigationKey, canvasKey, pending: Boolean(pendingState) });
    setPanel(null);
    setSpeech(null);
    setLine(0);
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

  return (
    <main className="rpg-page" data-game-theme={theme}>
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
            {RPG_THEMES[theme].label}
            {server?.town?.continuous ? '' : ` · ${server?.displayName ?? 'Local preview'}`}
          </span>
          <h1 title={sample.name} className={server?.town ? 'rpg-town-location' : undefined}>
            {sample.name}
          </h1>
          <p title={sample.subtitle}>
            {server?.town && theme !== 'dungeon'
              ? sample.subtitle
              : ui.theme === theme
                ? ui.place
                : sample.subtitle}
          </p>
        </header>
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
            aria-label="View whole town"
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
        {status === 'ready' && !panel && !speech && (
          <VirtualJoystick
            onChange={(x, y, sprint) => runtimeRef.current?.setVirtualAxis(x, y, sprint)}
          />
        )}
      </div>
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
      <RpgPanels
        panel={suspended ? null : panel}
        theme={theme}
        world={world}
        appearance={appearance}
        ui={ui}
        sample={sample}
        server={server ? { ...server, onStreet: selectStreet } : undefined}
        onClose={() => setPanel(null)}
        onTheme={travel}
        onAppearance={(id) => setAppearances((current) => ({ ...current, [world]: id }))}
        onFocus={(point) => {
          runtimeRef.current?.focus?.(point);
          setPanel(null);
        }}
      />
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
