import { experienceForLevel } from '../../../domain/adventure/progression';
import type { AdventureStatus } from '../adventure/types';
import { RpgPortrait } from '../RpgPortrait';
import { HealthHeart } from './HealthHeart';

interface Props {
  name: string;
  appearance: string;
  status?: AdventureStatus;
  onAppearance(): void;
  onInventory(): void;
}

export function PlayerHud({ name, appearance, status, onAppearance, onInventory }: Props) {
  const floor = status ? experienceForLevel(status.level) : 0;
  const xp = status?.nextLevel ? Math.max(0, status.experience - floor) : 1;
  const xpGoal = status?.nextLevel ? status.nextLevel - floor : 1;
  return (
    <aside className="rpg-player-hud rpg-frame" aria-label="Player information">
      <div className="rpg-player-heading">
        <button
          className="rpg-player-portrait"
          onClick={onAppearance}
          aria-label={`Change appearance, currently ${name}`}
          title="Choose appearance"
        >
          <RpgPortrait appearance={appearance} width={56} height={56} crop="bust" />
        </button>
        <div className="rpg-player-name">
          <strong title={name}>{name}</strong>
          <span>Traveler</span>
        </div>
        {status && (
          <button
            className="rpg-pack-toggle"
            onClick={onInventory}
            aria-label="Open inventory"
            title="Inventory · I"
            aria-haspopup="dialog"
          >
            <img src="/game-assets/pixel-hud/inventory.png" width="26" height="26" alt="" />
            <kbd>I</kbd>
          </button>
        )}
      </div>
      {status && (
        <>
          <div className="rpg-player-health">
            <span className="rpg-heart-row" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => {
                const remaining = (status.health / status.maxHealth) * 5 - index;
                const fill = remaining >= 1 ? 'full' : remaining > 0 ? 'half' : 'empty';
                return <HealthHeart key={index} fill={fill} />;
              })}
            </span>
            <span
              className="rpg-player-hp"
              aria-label={`Health ${status.health} of ${status.maxHealth}`}
            >
              {status.health}
              <small> / {status.maxHealth}</small>
            </span>
          </div>
          <div className="rpg-player-level">
            <span>
              LV <b>{status.level}</b>
            </span>
            <progress
              className="rpg-xp-bar"
              value={xp}
              max={xpGoal}
              aria-label="Level experience"
              title={status.nextLevel ? `${xp} / ${xpGoal} XP` : 'Maximum level'}
            />
            <small>XP</small>
          </div>
        </>
      )}
    </aside>
  );
}
