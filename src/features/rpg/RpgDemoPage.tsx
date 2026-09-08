import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { VirtualJoystick } from '../world/VirtualJoystick';
import { RPG_APPEARANCES } from './character';
import { RpgIcon, type RpgIconName } from './RpgIcon';
import { RpgPanels, type RpgPanel } from './RpgPanels';
import { getRpgSample } from './sample-worlds';
import type { RpgDialogue, RpgThemeId, RpgUiState } from './types';
import { useRpgGame } from './use-rpg-game';
import './rpg.css';

const actions: Array<{ panel: RpgPanel; icon: RpgIconName; label: string }> = [
  { panel: 'map', icon: 'map', label: 'Map' },
  { panel: 'guide', icon: 'guide', label: 'Guide' },
  { panel: 'appearance', icon: 'person', label: 'Look' },
  { panel: 'menu', icon: 'menu', label: 'Menu' },
];

export function RpgDemoPage() {
  const [theme, setTheme] = useState<RpgThemeId>(() =>
    new URLSearchParams(location.search).get('theme') === 'dungeon' ? 'dungeon' : 'village',
  );
  const [appearance, setAppearance] = useState('rowan');
  const [panel, setPanel] = useState<RpgPanel | null>(null);
  const [speech, setSpeech] = useState<RpgDialogue | null>(null);
  const [line, setLine] = useState(0);
  const advanceRef = useRef<HTMLButtonElement>(null);
  const [ui, setUi] = useState<RpgUiState>(() => ({
    theme,
    place: getRpgSample(theme).name,
    nearby: null,
    position: getRpgSample(theme).spawn,
    zoom: 2,
  }));
  const sample = getRpgSample(theme);
  const traveler =
    RPG_APPEARANCES.find((option) => option.id === appearance) ?? RPG_APPEARANCES[0]!;
  const speaker = RPG_APPEARANCES.find((option) => option.id === speech?.appearance);
  const travel = useCallback((next: RpgThemeId) => {
    setTheme(next);
    setSpeech(null);
    setPanel(null);
    const url = new URL(location.href);
    if (next === 'village') url.searchParams.delete('theme');
    else url.searchParams.set('theme', next);
    history.replaceState(history.state, '', url);
  }, []);
  const talk = useCallback((dialogue: RpgDialogue) => {
    setLine(0);
    setSpeech(dialogue);
  }, []);
  const { hostRef, canvasRef, runtimeRef, attempt, status, retry } = useRpgGame({
    theme,
    appearance,
    blocked: panel !== null || speech !== null,
    onUi: setUi,
    onDialogue: talk,
    onTravel: travel,
  });
  const advance = useCallback(() => {
    if (speech && line < speech.lines.length - 1) setLine((value) => value + 1);
    else setSpeech(null);
  }, [speech, line]);
  useEffect(() => {
    document.title = `${sample.name} — Dmap`;
  }, [sample.name]);
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
      <div ref={hostRef} className="rpg-stage">
        <canvas
          key={attempt}
          ref={canvasRef}
          className="rpg-canvas"
          tabIndex={0}
          aria-label={`${sample.name}. Move with WASD or arrow keys; press E near a character or landmark.`}
        />
      </div>
      <div className="rpg-hud">
        <button
          className="rpg-identity rpg-frame"
          onClick={() => setPanel('appearance')}
          aria-label={`Change appearance, currently ${traveler.name}`}
        >
          <img src={traveler.portraitUrl} width="56" height="56" alt="" />
          <span>
            <strong>{traveler.name}</strong>
            <small>Traveler · You</small>
          </span>
        </button>
        <header className="rpg-location rpg-frame">
          <span className="rpg-kicker">Local preview</span>
          <h1>{sample.name}</h1>
          <p>{ui.theme === theme ? ui.place : sample.subtitle}</p>
        </header>
        {status === 'ready' && ui.nearby && !panel && !speech && (
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
          <span aria-label={`Zoom ${ui.zoom} times`}>{ui.zoom}×</span>
          <button
            aria-label="Zoom out"
            disabled={status !== 'ready' || ui.zoom <= 1}
            onClick={() => runtimeRef.current?.zoomBy(0.5)}
          >
            <RpgIcon name="minus" />
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
          <kbd>W A S D</kbd> to walk <span>·</span> <kbd>Shift</kbd> to run
        </p>
        {status === 'ready' && !panel && !speech && (
          <VirtualJoystick
            onChange={(x, y, sprint) => runtimeRef.current?.setVirtualAxis(x, y, sprint)}
          />
        )}
      </div>
      {status !== 'ready' && (
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
                <a href="/map/demo?renderer=2d">Open the original 2D demo</a>
              </div>
            )}
          </div>
        </div>
      )}
      <RpgPanels
        panel={panel}
        theme={theme}
        appearance={appearance}
        ui={ui}
        onClose={() => setPanel(null)}
        onTheme={travel}
        onAppearance={setAppearance}
      />
      <Dialog
        open={speech !== null}
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
