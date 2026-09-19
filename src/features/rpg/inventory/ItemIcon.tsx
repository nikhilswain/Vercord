import type { ItemId } from '../../../domain/adventure/inventory';
import { ITEM_ART } from './item-art';

/** Licensed native pixel art. Forage uses the same flowers the player gathers.
 * This is presentation only; names, sources and actions remain in the item catalog. */
export function ItemIcon({ id }: { id: ItemId }) {
  const art = ITEM_ART[id];
  if (art.crop) {
    const { x, y, size } = art.crop;
    return (
      <svg className="rpg-item-icon" viewBox={`${x} ${y} ${size} ${size}`} aria-hidden="true">
        <image href={art.url} width={art.width} height={art.height} />
      </svg>
    );
  }
  if (art.frame !== undefined && art.frameWidth && art.frameHeight) {
    const columns = art.width / art.frameWidth;
    const x = (art.frame % columns) * art.frameWidth;
    const y = Math.floor(art.frame / columns) * art.frameHeight;
    return (
      <svg
        className="rpg-item-icon"
        viewBox={`${x} ${y} ${art.frameWidth} ${art.frameHeight}`}
        aria-hidden="true"
      >
        <image href={art.url} width={art.width} height={art.height} />
      </svg>
    );
  }
  return (
    <img
      className="rpg-item-icon"
      src={art.url}
      width={art.width}
      height={art.height}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
    />
  );
}
