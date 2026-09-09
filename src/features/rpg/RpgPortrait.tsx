import { useId } from 'react';
import {
  getRpgCharacter,
  RPG_CHARACTER_ASSET_ROOT,
  RPG_CHARACTER_LAYERS,
} from '../../domain/world/catalog/characters';
import './rpg-portrait.css';

/** The rig's down-facing idle frame (6): column 0, row 2 of a 3 × 4 LPC sheet. */
export function RpgPortrait({
  appearance,
  width = 64,
  height = 64,
  className = '',
}: {
  appearance: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const id = useId();
  const character = getRpgCharacter(appearance);
  return (
    <svg
      className={`rpg-portrait ${className}`}
      viewBox="12 4 40 60"
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      data-appearance={character.id}
    >
      <defs>
        <clipPath id={`${id}-frame`}>
          <rect width="64" height="64" />
        </clipPath>
        {RPG_CHARACTER_LAYERS.map((layer) => {
          const tint = character.layers[layer].tint;
          if (tint === undefined) return null;
          return (
            <filter
              key={layer}
              id={`${id}-${layer}`}
              x="0"
              y="0"
              width="100%"
              height="100%"
              colorInterpolationFilters="sRGB"
            >
              <feComponentTransfer>
                <feFuncR type="linear" slope={((tint >> 16) & 255) / 255} />
                <feFuncG type="linear" slope={((tint >> 8) & 255) / 255} />
                <feFuncB type="linear" slope={(tint & 255) / 255} />
              </feComponentTransfer>
            </filter>
          );
        })}
      </defs>
      <g clipPath={`url(#${id}-frame)`}>
        {RPG_CHARACTER_LAYERS.map((layer) => (
          <image
            key={layer}
            href={`${RPG_CHARACTER_ASSET_ROOT}/${character.layers[layer].source}/${layer}-idle.png`}
            x="0"
            y="-128"
            width="192"
            height="256"
            filter={character.layers[layer].tint === undefined ? undefined : `url(#${id}-${layer})`}
          />
        ))}
      </g>
    </svg>
  );
}
