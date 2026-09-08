import { Dialog } from '../../components/Dialog';
import type { SavedWorldResponse } from '../../domain/world/protocol';
import { RPG_APPEARANCES } from './character';
import { RpgIcon } from './RpgIcon';
import { RPG_THEMES, RPG_WORLD_IDS, type RpgWorldId } from './themes';
import type { RpgDestination, RpgSample, RpgThemeId, RpgUiState } from './types';

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
  world: RpgWorldId;
  appearance: string;
  ui: RpgUiState;
  sample: RpgSample;
  server?: { guildId: string; bindings: SavedWorldResponse['bindings'] };
  onClose(): void;
  onTheme(destination: RpgDestination): void;
  onAppearance(id: string): void;
}

function SceneMap({
  theme,
  ui,
  sample,
  server,
}: Pick<Props, 'theme' | 'ui' | 'sample' | 'server'>) {
  const { bounds } = sample;
  return (
    <>
      <svg
        className="rpg-map"
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
        role="img"
        aria-label={`${sample.name}, landmarks and your current position`}
      >
        <rect {...bounds} fill={RPG_THEMES[theme].map.ground} />
        {sample.colliders.map((box, index) => (
          <rect key={index} {...box} fill={RPG_THEMES[theme].map.obstacle} />
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
          <li key={landmark.id}>
            {landmark.name}
            {server?.bindings
              .find((binding) => binding.landmarkId === landmark.id)
              ?.rooms.map((room) => (
                <span className="rpg-room-label" key={room.key}>
                  {room.label} <small>{room.type === 'unsupported' ? 'room' : room.type}</small>
                </span>
              ))}
          </li>
        ))}
      </ol>
      {server && (
        <p className="rpg-muted">
          Visit <a href={`/world/${server.guildId}`}>connected rooms</a> for Discord chat and voice.
        </p>
      )}
    </>
  );
}

export function RpgPanels({
  panel,
  theme,
  world,
  appearance,
  ui,
  sample,
  server,
  onClose,
  onTheme,
  onAppearance,
}: Props) {
  const place = RPG_THEMES[theme];
  const home = RPG_THEMES[world];
  const appearances = RPG_APPEARANCES.filter((option) =>
    (home.appearances as readonly string[]).includes(option.id),
  );
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
      {panel === 'map' && <SceneMap theme={theme} ui={ui} sample={sample} server={server} />}
      {panel === 'guide' && (
        <>
          <p>
            Take the paths at your own pace. Approach {place.guide} to hear a little about this
            place.
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
            {place.kind === 'location'
              ? `The return stairs lead back to ${home.name}. Your traveler goes with you.`
              : home.dungeonHint}{' '}
            You can also choose a destination from the menu.
          </p>
        </>
      )}
      {panel === 'appearance' && (
        <>
          <p>Choose your traveler for {home.name}. Your look stays with you in the dungeon.</p>
          <div className="rpg-appearance-list">
            {appearances.map((option) => (
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
          <p className="rpg-muted">
            {server
              ? 'Choose a setting for your server. Each town has a path into the Lantern Vault.'
              : 'Two villages, each with a path into the Lantern Vault.'}
          </p>
          <h3 className="rpg-menu-heading">World themes</h3>
          <div className="rpg-destinations" aria-label="World themes">
            {RPG_WORLD_IDS.map((id) => (
              <button
                className="rpg-destination"
                key={id}
                aria-pressed={theme === id}
                onClick={() => onTheme(id)}
              >
                <span className="rpg-destination-mark" data-world={id} aria-hidden="true">
                  <RpgIcon name="map" />
                </span>
                <span className="rpg-destination-copy">
                  <strong>{RPG_THEMES[id].name}</strong>
                  <span>
                    {RPG_THEMES[id].label} · {RPG_THEMES[id].setting}
                  </span>
                </span>
                <span className="rpg-destination-state">{theme === id ? 'Here' : 'Visit'}</span>
              </button>
            ))}
          </div>
          <h3 className="rpg-menu-heading">Explore a location</h3>
          <button
            className="rpg-destination rpg-destination--location"
            aria-pressed={theme === 'dungeon'}
            onClick={() => onTheme('dungeon')}
          >
            <span className="rpg-destination-mark" data-world="dungeon" aria-hidden="true">
              <RpgIcon name="guide" />
            </span>
            <span className="rpg-destination-copy">
              <strong>{RPG_THEMES.dungeon.name}</strong>
              <span>
                {RPG_THEMES.dungeon.label} · {RPG_THEMES.dungeon.setting}
              </span>
            </span>
            <span className="rpg-destination-state">{theme === 'dungeon' ? 'Here' : 'Enter'}</span>
          </button>
          {place.kind === 'location' && (
            <button className="rpg-button rpg-return" onClick={() => onTheme('return')}>
              Return to {home.name}
            </button>
          )}
          <p className="rpg-muted rpg-destination-note">
            {place.kind === 'location'
              ? `Exploring from ${home.name}. The stairs return you to the same village.`
              : 'Your traveler is remembered for each village as you explore.'}
          </p>
          <nav className="rpg-menu-links" aria-label="Other Dmap views">
            {server && <a href={`/world/${server.guildId}`}>Open connected rooms</a>}
            {server && <a href="/dashboard">Choose another server</a>}
            <a href="/map/demo?renderer=3d">Explore the 3D demo</a>
            <a href="/map/demo?renderer=2d">Open the original 2D demo</a>
            <a href="/">Return to Dmap</a>
          </nav>
          <details className="rpg-credits">
            <summary>Art &amp; font credits</summary>
            <p>
              LPC Revised and Expanded, with full contributor credits below. Selected artwork uses
              OGA-BY 3.0. Frosthavn buildings and ground artwork are original to Dmap. Pixelify Sans
              uses the SIL Open Font License.
            </p>
            <a href="/game-assets/lpc-characters/CREDITS.txt" target="_blank" rel="noreferrer">
              Character credits
            </a>
            {' · '}
            <a href="/game-assets/lpc-world/CREDITS.md" target="_blank" rel="noreferrer">
              Scenery credits
            </a>
            {' · '}
            <a href="/game-assets/norse/README.md" target="_blank" rel="noreferrer">
              Frosthavn artwork
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
