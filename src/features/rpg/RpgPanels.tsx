import { Dialog } from '../../components/Dialog';
import { EquipmentDialog } from './demo/EquipmentDialog';
import type { SavedWorldResponse, WorldTown } from '../../domain/world/protocol';
import type { HouseSceneId } from '../../domain/world/catalog/scenes';
import type { Point } from '../world/engine/types';
import { RPG_APPEARANCES } from './character';
import { RpgPortrait } from './RpgPortrait';
import { RpgIcon } from './RpgIcon';
import { RpgSceneMap } from './RpgSceneMap';
import { RpgTownMap } from './RpgTownMap';
import RpgAtlasDialog from './atlas/RpgAtlasDialog';
import { RPG_THEMES, RPG_WORLD_IDS, type RpgWorldId } from './themes';
import type { RpgDestination, RpgSample, RpgThemeId, RpgUiState } from './types';

export type RpgPanel = 'map' | 'guide' | 'appearance' | 'menu' | 'equipment';
const titles: Record<RpgPanel, string> = {
  map: 'A little sense of direction',
  guide: 'A traveler’s guide',
  appearance: 'Choose your traveler',
  menu: 'By the wayside',
  equipment: 'Equipment',
};

interface Props {
  panel: RpgPanel | null;
  theme: RpgThemeId;
  world: RpgWorldId;
  appearance: string;
  ui: RpgUiState;
  sample: RpgSample;
  house?: HouseSceneId;
  server?: {
    guildId: string;
    worldId?: string;
    memberKey?: string;
    displayName: string;
    bindings: SavedWorldResponse['bindings'];
    town?: WorldTown;
    onStreet(street: string): void;
  };
  onClose(): void;
  onEquip(id: string): void;
  onApplyEnemyLevel(level: number): void;
  onTheme(destination: RpgDestination): void;
  onAppearance(id: string): void;
  onFocus?(point: Point): void;
}

export function RpgPanels({
  panel,
  theme,
  world,
  appearance,
  ui,
  sample,
  house,
  server,
  onClose,
  onEquip,
  onApplyEnemyLevel,
  onTheme,
  onAppearance,
  onFocus,
}: Props) {
  const place = RPG_THEMES[theme];
  if (panel === 'equipment' && ui.adventure)
    return (
      <EquipmentDialog
        open
        status={ui.adventure}
        onClose={onClose}
        onEquip={onEquip}
        onApplyEnemyLevel={onApplyEnemyLevel}
      />
    );
  const home = RPG_THEMES[world];
  const appearances = RPG_APPEARANCES.filter((option) =>
    (home.appearances as readonly string[]).includes(option.id),
  );
  if (panel === 'map' && !house && theme !== 'dungeon' && (!server || server.town?.continuous)) {
    const scope = server
      ? JSON.stringify([server.memberKey, server.guildId, server.worldId, world, theme])
      : JSON.stringify(
          sample.demo?.area === 'jungle'
            ? ['demo', world, theme, 'jungle']
            : ['demo', world, theme],
        );
    return (
      <RpgAtlasDialog
        sample={sample}
        town={server?.town}
        name={server?.displayName ?? sample.name}
        scope={scope}
        position={ui.position}
        onClose={onClose}
        onFocus={onFocus}
      />
    );
  }
  return (
    <Dialog
      open={panel !== null}
      title={
        panel === 'map' && house
          ? 'Inside this house'
          : panel === 'map' && server?.town
            ? 'Your town'
            : panel
              ? titles[panel]
              : ''
      }
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
      {panel === 'map' &&
        (server?.town && !house ? (
          <RpgTownMap
            theme={theme}
            ui={ui}
            sample={sample}
            town={server.town}
            displayName={server.displayName}
            onStreet={server.onStreet}
            onFocus={onFocus}
          />
        ) : (
          <RpgSceneMap theme={theme} ui={ui} sample={sample} bindings={server?.bindings} />
        ))}
      {panel === 'guide' && (
        <>
          {sample.demo && (
            <p>
              <strong>Mosswild Jungle:</strong> follow the northwest village path and press E at the
              jungle sign. I opens equipment: all 24 weapons are available here. Press 3 to use your
              weapon, then Space or J to attack; turn with WASD to aim. Press 1 for Ember, or 2 for
              Tide after reaching level 2. Fire burns; water slows and pushes enemies. Watch their
              preparation poses and sidestep attacks. Higher-level enemies react faster and chain
              attacks. Gather flowers with E and gain experience. H uses a healing herb. The
              southern trail returns to Willowmere. Your progress stays between those two areas;
              reloading or changing world themes starts a new adventure.
            </p>
          )}
          <p>
            {house
              ? 'Walk around and meet the travelers in this house. Use Chat or Voice to open the channel’s controls, or In this room to see everyone here. Leave house returns you to the doorway outside.'
              : server?.town && theme !== 'dungeon'
                ? server.town.continuous
                  ? 'Follow the paths between neighborhoods and channel houses. Open Map to find every house, then approach a doorway and press E to enter. Chat and voice controls are available inside.'
                  : 'The Map lists your town’s neighborhoods and streets. Follow the paths to named channel houses, or read the town-square sign to visit the square.'
                : `Take the paths at your own pace. Approach ${place.guide} to hear a little about this place.`}
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
              <dt>Open / talk / explore</dt>
              <dd>
                <kbd>E</kbd> or the nearby action button
              </dd>
            </div>
            <div>
              <dt>Touch movement</dt>
              <dd>Drag the thumbstick; drag further to run</dd>
            </div>
            <div>
              <dt>Look around</dt>
              <dd>Drag the map. Center returns to your traveler; walking resumes following.</dd>
            </div>
            <div>
              <dt>Zoom</dt>
              <dd>Scroll, or use the + and − controls</dd>
            </div>
          </dl>
          <p className="rpg-muted">
            {house
              ? 'The door leads back outside. Your Discord call stays where it is until you choose to move it.'
              : place.kind === 'location'
                ? `The return stairs lead back to ${home.name}. Your traveler goes with you.`
                : home.dungeonHint}{' '}
            You can also choose a destination from the menu.
          </p>
        </>
      )}
      {panel === 'appearance' && (
        <>
          <p>
            Choose your traveler for {home.name}. Your look stays with you in the dungeon.
            {server ? ' Your look and position are saved for this server.' : ''}
          </p>
          <div className="rpg-appearance-list">
            {appearances.map((option) => (
              <button
                key={option.id}
                className="rpg-appearance"
                aria-pressed={appearance === option.id}
                onClick={() => onAppearance(option.id)}
              >
                <RpgPortrait appearance={option.id} width={72} height={72} />
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
                aria-pressed={theme === id && !house}
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
                <span className="rpg-destination-state">
                  {theme === id && !house ? 'Here' : 'Visit'}
                </span>
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
          {(house || place.kind === 'location') && (
            <button className="rpg-button rpg-return" onClick={() => onTheme('return')}>
              {house ? 'Leave house' : `Return to ${home.name}`}
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
            {!server && world === 'village' && (
              <p>
                Jungle bear and snake: Electric Lemon; slime: rvros (CC0).{' '}
                <a href="/game-assets/jungle-demo/CREDITS.md" target="_blank" rel="noreferrer">
                  Jungle sources &amp; licenses
                </a>
                . Spells, traps and forest guardian: CraftPix.{' '}
                <a href="/game-assets/magic-demo/CREDITS.md" target="_blank" rel="noreferrer">
                  Magic sources &amp; licenses
                </a>
                .
              </p>
            )}
            <p>
              LPC Revised and Expanded, with full contributor credits below. Selected artwork uses
              OGA-BY 3.0; the native masculine casting body uses CC-BY-SA 3.0. Cats and dogs are by
              bluecarrot16, also under OGA-BY 3.0. Frosthavn buildings and ground artwork are
              original to Dmap. Pixelify Sans uses the SIL Open Font License.
            </p>
            {sample.demo && (
              <p>
                Inventory and held weapon art by{' '}
                <a
                  href="https://trulymalicious.itch.io/weapon-set-1-free"
                  target="_blank"
                  rel="noreferrer"
                >
                  Truly Malicious
                </a>{' '}
                (CC BY 4.0). Body and arm attack poses use credited LPC animation layers. Additional
                animated forest enemies are by CraftPix.{' '}
                <a href="/game-assets/weapon-demo/CREDITS.txt" target="_blank" rel="noreferrer">
                  Weapon and enemy credits
                </a>
                {' · '}
                <a
                  href="/game-assets/lpc-characters/upstream-melee-credits.txt"
                  target="_blank"
                  rel="noreferrer"
                >
                  Melee animation credits
                </a>
              </p>
            )}
            <a href="/game-assets/lpc-characters/CREDITS.txt" target="_blank" rel="noreferrer">
              Character credits
            </a>
            {' · '}
            <a href="/game-assets/lpc-animals/CREDITS.txt" target="_blank" rel="noreferrer">
              Animal credits
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
            {' · '}
            <a href="/game-assets/atlas/OFL.txt" target="_blank" rel="noreferrer">
              Atlas font license
            </a>
          </details>
        </>
      )}
    </Dialog>
  );
}
