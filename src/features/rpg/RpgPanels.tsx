import type { ProvisionsSnapshot } from '../../domain/adventure/provisions';
import { RpgDialog } from './ui/RpgDialog';
import { InventoryDialog } from './inventory/InventoryDialog';
import type { UseItemResult } from '../../domain/adventure/inventory';
import type { CraftItemResult } from '../../domain/adventure/crafting';
import { GameSettingsDialog } from '../settings/GameSettingsDialog';
import type { GameMusicControls } from '../audio/use-game-music';
import type { SavedWorldResponse, WorldTown } from '../../domain/world/protocol';
import type { HouseSceneId } from '../../domain/world/catalog/scenes';
import type { Point } from '../world/engine/types';
import { RPG_APPEARANCES } from './character';
import { RpgPortrait } from './RpgPortrait';
import { RpgIcon } from './RpgIcon';
import { RpgSceneMap } from './RpgSceneMap';
import { ForestMap } from './forest/ForestMap';
import { RpgTownMap } from './RpgTownMap';
import RpgAtlasDialog from './atlas/RpgAtlasDialog';
import { RPG_THEMES, RPG_WORLD_IDS, type RpgWorldId } from './themes';
import type { RpgDestination, RpgSample, RpgThemeId, RpgUiState } from './types';
import type { NavigationActions } from './navigation/types';
import { JourneyDialog, type JourneyActions } from './journal/JourneyDialog';
import { JourneyMapNote } from './journal/JourneyMapNote';
import type { JournalObjective } from './journal/model';

export type RpgPanel =
  'map' | 'guide' | 'appearance' | 'menu' | 'equipment' | 'settings' | 'journey';
const titles: Record<RpgPanel, string> = {
  map: 'A little sense of direction',
  guide: 'A traveler’s guide',
  appearance: 'Choose your traveler',
  menu: 'By the wayside',
  equipment: 'Inventory',
  settings: 'Settings',
  journey: 'Journey',
};

interface Props extends NavigationActions, JourneyActions {
  panel: RpgPanel | null;
  theme: RpgThemeId;
  world: RpgWorldId;
  appearance: string;
  ui: RpgUiState;
  sample: RpgSample;
  samples: readonly RpgSample[];
  mapObjective?: JournalObjective | null;
  mapFocus?: Point | null;
  house?: HouseSceneId;
  hall?: boolean;
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
  onSettings(): void;
  music: GameMusicControls;
  onEquip(id: string): boolean;
  onUseItem(id: string): UseItemResult | undefined;
  onCraftItem?(id: string): CraftItemResult | undefined;
  onConfigureProvisions?(
    settings: Partial<Pick<ProvisionsSnapshot, 'recovery' | 'quickBuff' | 'trackedRecipe'>>,
  ): void;
  onFindSource?(id: string): string;
  onReturnToTown?(): void;
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
  samples,
  mapObjective,
  mapFocus,
  house,
  hall,
  server,
  onClose,
  onSettings,
  music,
  onEquip,
  onUseItem,
  onCraftItem,
  onConfigureProvisions,
  onFindSource,
  onReturnToTown,
  onApplyEnemyLevel,
  onTheme,
  onAppearance,
  onFocus,
  onNavigate,
  onStopNavigation,
  onJourney,
  onJournalChange,
  onShowObjective,
}: Props) {
  const place = RPG_THEMES[theme];
  if (panel === 'journey')
    return (
      <JourneyDialog
        journal={ui.journal}
        onClose={onClose}
        onJournalChange={onJournalChange}
        onShowObjective={onShowObjective}
        onGuide={(objective) =>
          onNavigate?.(objective.target) ?? {
            ok: false,
            message: 'The world is still loading. Try again in a moment.',
          }
        }
      />
    );
  if (panel === 'settings')
    return <GameSettingsDialog music={music} demo={!server} onClose={onClose} />;
  if (panel === 'equipment' && ui.adventure)
    return (
      <InventoryDialog
        open
        status={ui.adventure}
        onClose={onClose}
        onEquip={onEquip}
        onUseItem={onUseItem}
        onCraftItem={onCraftItem}
        onConfigureProvisions={onConfigureProvisions}
        onFindSource={onFindSource}
        onReturnToTown={onReturnToTown}
        onApplyEnemyLevel={onApplyEnemyLevel}
      />
    );
  const home = RPG_THEMES[world];
  if (panel === 'map' && sample.sceneId === 'town-hall' && !mapObjective)
    return (
      <RpgAtlasDialog
        sample={sample}
        name="Town Hall"
        scope={JSON.stringify([server?.memberKey ?? 'demo', server?.worldId, world, 'town-hall'])}
        position={ui.position}
        focusAt={mapFocus}
        onClose={onClose}
        onFocus={onFocus}
        navigation={ui.navigation}
        onNavigate={onNavigate}
        onStopNavigation={onStopNavigation}
        onJourney={onJourney}
      />
    );
  if (panel === 'map' && (sample.forest || sample.temple || mapObjective?.target.area))
    return (
      <ForestMap
        key={mapFocus ? 'player' : 'overview'}
        sample={sample}
        ui={ui}
        onClose={onClose}
        onFocus={onFocus}
        scope={JSON.stringify([
          server?.memberKey ?? 'demo',
          server?.guildId,
          server?.worldId,
          world,
          sample.temple ?? sample.forest?.region ?? 'town',
        ])}
        navigation={ui.navigation}
        onNavigate={onNavigate}
        onStopNavigation={onStopNavigation}
        onJourney={onJourney}
        objective={mapObjective}
        focusAt={mapFocus}
      />
    );
  const appearances = RPG_APPEARANCES.filter((option) =>
    (home.appearances as readonly string[]).includes(option.id),
  );
  const mapSample = mapObjective
    ? (samples.find((s) => s.demo?.area === mapObjective.target.scene) ?? sample)
    : sample;
  if (panel === 'map' && mapSample !== sample)
    return (
      <RpgAtlasDialog
        sample={mapSample}
        name={mapSample.name}
        scope={`journey:${mapSample.demo?.area}`}
        position={mapSample.spawn}
        showPlayer={false}
        onClose={onClose}
        onJourney={onJourney}
        objective={mapObjective}
        navigation={ui.navigation}
        onNavigate={onNavigate}
        onStopNavigation={onStopNavigation}
      />
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
        focusAt={mapFocus}
        onClose={onClose}
        onFocus={onFocus}
        navigation={ui.navigation}
        onNavigate={onNavigate}
        onStopNavigation={onStopNavigation}
        onJourney={onJourney}
        objective={mapObjective}
      />
    );
  }
  return (
    <RpgDialog
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
      {panel === 'map' && <JourneyMapNote onJourney={onJourney} objective={mapObjective} />}
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
            navigation={ui.navigation}
            onNavigate={onNavigate}
            onStopNavigation={onStopNavigation}
          />
        ) : (
          <RpgSceneMap
            theme={theme}
            ui={ui}
            sample={sample}
            bindings={server?.bindings}
            navigation={ui.navigation}
            onNavigate={onNavigate}
            onStopNavigation={onStopNavigation}
          />
        ))}
      {panel === 'guide' && (
        <>
          {(sample.forest || sample.temple) && (
            <p>
              Follow marked trails between the twelve forest regions. Map shows the way home and
              records places you discover. Rootbound Reach has the entrance to Rootbound Temple;
              meet Mira there, break the guardian’s seal, and explore the sanctuary. Journey in Menu
              or Map explains your next step. Guidance is always optional.{' '}
              {ui.exploration?.saveAvailable === false
                ? 'Browser saving is unavailable. Keep this tab open to preserve this visit.'
                : 'Your adventure progress is saved in this browser; keep using this device to continue the same journey.'}
            </p>
          )}
          {sample.demo && (
            <p>
              <strong>Mosswild Jungle:</strong> follow the northwest village path and press E at the
              jungle sign. I opens inventory: all 24 weapons are available here. Press 3 to use your
              weapon. Aim with the cursor and left click, or tap a spot, to attack. WASD moves; J
              and the attack button use your facing direction. Ember unlocks at level 15 (1), Tide
              at level 25 (2). Each needs two minutes to recover. Aim ahead of moving enemies.
              Middle-button drag or touch drag pans the view. Spike plates trigger on contact. Ember
              hits hard at close range; Tide reaches further and freezes for two seconds. Watch
              their preparation poses and sidestep attacks. Higher-level enemies react faster and
              chain attacks. Gather flowers with E and gain experience. H uses a healing herb. The
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
              <dt>Map</dt>
              <dd>
                <kbd>Tab</kbd> opens the map. Double-tap <kbd>Tab</kbd> to look closer at your
                location. <kbd>Space</kbd> zooms into a selected area. <kbd>Esc</kbd> zooms out,
                then closes the map on the next press.
              </dd>
            </div>
            <div>
              <dt>Return to town</dt>
              <dd>
                <kbd>G</kbd> uses your Hearthstone. Always equipped; also in Inventory → Items.
              </dd>
            </div>
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
              <dt>Pick up dropped loot</dt>
              <dd>
                <kbd>F</kbd> or tap the pickup prompt. <kbd>I</kbd> opens your inventory; combine
                recipes there to see ingredients and effects. Brew at benches and cook at hearths; B
                uses your selected bottle.
              </dd>
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
          <button className="rpg-destination rpg-menu-settings" onClick={onJourney}>
            <span className="rpg-destination-mark" aria-hidden="true">
              <RpgIcon name="guide" />
            </span>
            <span className="rpg-destination-copy">
              <strong>Journey</strong>
              <span>Story, discoveries &amp; your next step</span>
            </span>
          </button>
          <button className="rpg-destination rpg-menu-settings" onClick={onSettings}>
            <span className="rpg-destination-mark" aria-hidden="true">
              <img src="/game-assets/ornate-retro/settings.svg" width="24" height="24" alt="" />
            </span>
            <span className="rpg-destination-copy">
              <strong>Settings</strong>
              <span>Background music &amp; volume</span>
            </span>
          </button>
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
                aria-pressed={theme === id && !house && !hall}
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
                  {theme === id && !house && !hall ? 'Here' : 'Visit'}
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
          {(house || sample.sceneId === 'town-hall' || place.kind === 'location') && (
            <button className="rpg-button rpg-return" onClick={() => onTheme('return')}>
              {sample.sceneId === 'town-hall'
                ? 'Leave Town Hall'
                : house
                  ? 'Leave house'
                  : hall
                    ? 'Return to Town Hall'
                    : `Return to ${home.name}`}
            </button>
          )}
          <p className="rpg-muted rpg-destination-note">
            {hall
              ? 'The cellar stair connects the Lantern Vault to Town Hall.'
              : place.kind === 'location'
                ? `Exploring from ${home.name}. The stairs return you to the same village.`
                : 'Your traveler is remembered for each village as you explore.'}
          </p>
          <details className="rpg-credits">
            <summary>Art &amp; font credits</summary>
            <p>
              UI art: zLizard’s Ornate Retro UI free sample. Alagard font: Hewett Tsoi.{' '}
              <a href="/game-assets/ornate-retro/CREDITS.txt" target="_blank" rel="noreferrer">
                UI art &amp; font credits
              </a>{' '}
              Hearts by ArtBIT; inventory icon by 7Soul1 (CC0).{' '}
              <a href="/game-assets/pixel-hud/CREDITS.txt" target="_blank" rel="noreferrer">
                HUD icon credits
              </a>
            </p>
            {!server && world === 'village' && (
              <p>
                Forest wildlife: LYASeeK.{' '}
                <a
                  href="/game-assets/minifolks-animals/CREDITS.txt"
                  target="_blank"
                  rel="noreferrer"
                >
                  MiniFolks credits
                </a>
                . Jungle bear and snake: Electric Lemon.{' '}
                <a href="/game-assets/jungle-demo/CREDITS.md" target="_blank" rel="noreferrer">
                  Jungle sources &amp; licenses
                </a>
                . Slimes: chiecola’s Momo Mama free demo, with recolors and combat motion by Dmap.{' '}
                <a href="/game-assets/momo-slime/CREDITS.md" target="_blank" rel="noreferrer">
                  Slime source &amp; license
                </a>
                . Spells, traps and forest guardian: CraftPix.{' '}
                <a href="/game-assets/magic-demo/CREDITS.md" target="_blank" rel="noreferrer">
                  Magic sources &amp; licenses
                </a>
                . Combat and bottle effects: Viktor Hahn, CodeManu and David Masia.{' '}
                <a href="/game-assets/action-fx/CREDITS.md" target="_blank" rel="noreferrer">
                  Effects sources &amp; licenses
                </a>
                . Predator plants and the ruined temple: CraftPix.{' '}
                <a href="/game-assets/predator-plants/CREDITS.md" target="_blank" rel="noreferrer">
                  Plant credits
                </a>
                {' · '}
                <a href="/game-assets/ruined-temple/CREDITS.md" target="_blank" rel="noreferrer">
                  Temple credits
                </a>
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
            <a href="/game-assets/town-hall/CREDITS.md" target="_blank" rel="noreferrer">
              Town hall credits
            </a>
            {' · '}
            <a href="/game-assets/ability-icons/CREDITS.md" target="_blank" rel="noreferrer">
              Ability icon credits
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
    </RpgDialog>
  );
}
