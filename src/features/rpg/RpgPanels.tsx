import { Dialog } from '../../components/Dialog';
import { RPG_APPEARANCES } from './character';
import { RpgIcon } from './RpgIcon';
import { getRpgSample } from './sample-worlds';
import type { RpgThemeId, RpgUiState } from './types';

export type RpgPanel = 'map' | 'guide' | 'appearance' | 'menu';
const titles: Record<RpgPanel, string> = {
  map: 'A little sense of direction',
  guide: 'A traveler’s guide',
  appearance: 'Choose your traveler',
  menu: 'By the wayside',
};

interface Props {
  panel: RpgPanel | null;
  theme: RpgThemeId;
  appearance: string;
  ui: RpgUiState;
  onClose(): void;
  onTheme(theme: RpgThemeId): void;
  onAppearance(id: string): void;
}

function SampleMap({ theme, ui }: Pick<Props, 'theme' | 'ui'>) {
  const sample = getRpgSample(theme);
  const { bounds } = sample;
  return (
    <>
      <svg
        className="rpg-map"
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        role="img"
        aria-label={`${sample.name}, landmarks and your current position`}
      >
        <rect
          width={bounds.width}
          height={bounds.height}
          fill={theme === 'village' ? '#7c995a' : '#65717b'}
        />
        {sample.colliders.map((box, index) => (
          <rect key={index} {...box} fill={theme === 'village' ? '#405736' : '#222b36'} />
        ))}
        {sample.landmarks.map((landmark, index) => (
          <g key={landmark.id} transform={`translate(${landmark.x},${landmark.y})`}>
            <circle r="27" fill="#efe3be" stroke="#392d23" strokeWidth="5" />
            <text textAnchor="middle" dy="11" fontSize="32" fontWeight="700" fill="#30291f">
              {index + 1}
            </text>
          </g>
        ))}
        <circle
          className="rpg-map-player"
          cx={ui.position.x}
          cy={ui.position.y}
          r="15"
          fill="#ffd278"
          stroke="#30291f"
          strokeWidth="6"
        />
      </svg>
      <p className="rpg-muted">The gold dot is you. Landmarks are numbered below.</p>
      <ol className="rpg-landmarks">
        {sample.landmarks.map((landmark) => (
          <li key={landmark.id}>{landmark.name}</li>
        ))}
      </ol>
    </>
  );
}

export function RpgPanels({ panel, theme, appearance, ui, onClose, onTheme, onAppearance }: Props) {
  return (
    <Dialog
      open={panel !== null}
      title={panel ? titles[panel] : ''}
      className="rpg-dialog"
      onClose={onClose}
      footer={
        <button className="rpg-button" onClick={onClose}>
          Back to exploring
        </button>
      }
    >
      <button
        className="rpg-icon-button rpg-panel-close"
        aria-label="Close panel"
        onClick={onClose}
      >
        <RpgIcon name="close" />
      </button>
      {panel === 'map' && <SampleMap theme={theme} ui={ui} />}
      {panel === 'guide' && (
        <>
          <p>
            Take the paths at your own pace. Approach{' '}
            {theme === 'village' ? 'Mira by the crossroads' : 'Oren in the arrival chamber'} to hear
            a little about this place.
          </p>
          <dl className="rpg-controls-list">
            <div>
              <dt>Walk</dt>
              <dd>
                <kbd>W A S D</kbd> or arrow keys
              </dd>
            </div>
            <div>
              <dt>Run</dt>
              <dd>
                Hold <kbd>Shift</kbd> while moving
              </dd>
            </div>
            <div>
              <dt>Auto-run to a place</dt>
              <dd>Double-click or double-tap the ground</dd>
            </div>
            <div>
              <dt>Talk / explore</dt>
              <dd>
                <kbd>E</kbd> or the nearby action button
              </dd>
            </div>
            <div>
              <dt>Touch movement</dt>
              <dd>Drag the thumbstick; drag further to run</dd>
            </div>
            <div>
              <dt>Zoom</dt>
              <dd>Scroll, or use the + and − controls</dd>
            </div>
          </dl>
          <p className="rpg-muted">
            Look for the steps between Willowmere and the Lantern Vault. You can also choose a
            destination from the menu.
          </p>
        </>
      )}
      {panel === 'appearance' && (
        <>
          <p>Two travelers, the same open road.</p>
          <div className="rpg-appearance-list">
            {RPG_APPEARANCES.map((option) => (
              <button
                key={option.id}
                className="rpg-appearance"
                aria-pressed={appearance === option.id}
                onClick={() => onAppearance(option.id)}
              >
                <img src={option.portraitUrl} alt="" width="80" height="80" />
                <strong>{option.name}</strong>
                <span>{appearance === option.id ? 'Your traveler' : 'Choose traveler'}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {panel === 'menu' && (
        <>
          <p className="rpg-muted">Local preview · two places to explore</p>
          <div className="rpg-destinations">
            {(['village', 'dungeon'] as const).map((id) => (
              <button
                className="rpg-button"
                key={id}
                aria-pressed={theme === id}
                onClick={() => onTheme(id)}
              >
                {getRpgSample(id).name}
              </button>
            ))}
          </div>
          <p>These sample places keep their layout each time you visit.</p>
          <nav className="rpg-menu-links" aria-label="Other Dmap views">
            <a href="/map/demo?renderer=3d">Explore the 3D demo</a>
            <a href="/map/demo?renderer=2d">Open the original 2D demo</a>
            <a href="/">Return to Dmap</a>
          </nav>
          <details className="rpg-credits">
            <summary>Art &amp; font credits</summary>
            <p>
              LPC Revised by Eliza Wyatt, with Stephen Challener, Lanea Zimmerman, Hyptosis and
              BlueCarrot16. Selected artwork uses OGA-BY 3.0. Pixelify Sans uses the SIL Open Font
              License.
            </p>
            <a href="/game-assets/lpc-characters/CREDITS.txt" target="_blank" rel="noreferrer">
              Character credits
            </a>
            {' · '}
            <a href="/game-assets/lpc-world/CREDITS.md" target="_blank" rel="noreferrer">
              Scenery credits
            </a>
            {' · '}
            <a href="/game-assets/rpg-ui/OFL.txt" target="_blank" rel="noreferrer">
              Font license
            </a>
          </details>
        </>
      )}
    </Dialog>
  );
}
