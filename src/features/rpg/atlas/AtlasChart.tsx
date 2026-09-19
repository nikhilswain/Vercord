import { memo, useId, type CSSProperties, type ReactNode } from 'react';
import { AtlasGlyph, type AtlasIconName } from './AtlasIcon';
import type { AtlasModel, AtlasPin, Point } from './types';

function labelLines(name: string) {
  const chars = Array.from(name),
    lines: string[] = [];
  while (chars.length && lines.length < 2) {
    const candidate = chars.slice(0, 17).join('');
    const space = candidate.lastIndexOf(' ');
    const length = chars.length > 17 && space > 7 ? space + 1 : 17;
    lines.push(chars.splice(0, length).join('').trim());
  }
  if (chars.length) lines[1] = `${lines[1]!.slice(0, 15)}…`;
  return lines;
}

export function AtlasMarker({
  point,
  name,
  label,
  children,
}: {
  point: Point;
  name: AtlasIconName;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <g transform={`translate(${point.x} ${point.y})`}>
      <g className="atlas-screen atlas-marker">
        <circle r="18" />
        <AtlasGlyph name={name} />
        {label && (
          <text y="35" className="atlas-place-label">
            {Array.from(label).length > 27 ? `${Array.from(label).slice(0, 25).join('')}…` : label}
          </text>
        )}
        {children}
      </g>
    </g>
  );
}

/** Expensive paths/house nodes only change when the saved map response changes. */
export const AtlasChart = memo(function AtlasChart({
  model,
  selected,
}: {
  model: AtlasModel;
  selected?: string;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <>
      <defs>
        <pattern id={`${id}-grain`} width="64" height="64" patternUnits="userSpaceOnUse">
          <circle cx="8" cy="8" r="2" fill="#dfd9b7" opacity=".065" />
        </pattern>
        <clipPath id={`${id}-land`}>
          {model.regions.map((r) => (
            <path key={r.id} d={r.path} fillRule="evenodd" />
          ))}
        </clipPath>
      </defs>
      {model.regions
        .filter((region) => region.path)
        .map((region) => (
          <g
            key={region.id}
            data-region={region.id}
            className="atlas-region"
            style={{ '--region-color': region.color } as CSSProperties}
          >
            <path
              d={region.path}
              className="atlas-region-shape"
              fillRule="evenodd"
              vectorEffect="non-scaling-stroke"
              tabIndex={0}
              role="button"
              aria-label={`Explore ${region.name}`}
            />
            <path
              d={region.path}
              fill={`url(#${id}-grain)`}
              fillRule="evenodd"
              pointerEvents="none"
            />
          </g>
        ))}
      {model.regions
        .filter((region) => region.path)
        .map((region) => {
          const lines = labelLines(region.name);
          return (
            <g
              key={region.id}
              data-label={region.id}
              transform={`translate(${region.center.x} ${region.center.y})`}
              className="atlas-region-label"
              style={{ '--region-color': region.color } as CSSProperties}
            >
              <g className="atlas-screen">
                <path d="M0-40 4-33 0-26-4-33Z" className="atlas-region-sigil" />
                <text textAnchor="middle">
                  <title>{region.name}</title>
                  {lines.map((line, i) => (
                    <tspan key={i} x="0" dy={i ? '1em' : 0}>
                      {line}
                    </tspan>
                  ))}
                </text>
                <text
                  y={lines.length > 1 ? 44 : 23}
                  textAnchor="middle"
                  className="atlas-region-caption"
                >
                  {model.local
                    ? `${region.places.length} places`
                    : `${region.places.filter((p) => p.kind !== 'landmark').length} channel houses`}
                </text>
              </g>
            </g>
          );
        })}
      <path
        d={model.roads}
        className="atlas-roads"
        clipPath={`url(#${id}-land)`}
        pointerEvents="none"
      />
      {model.water?.map((water, index) => (
        <rect key={`water:${index}`} {...water} className="atlas-water" />
      ))}
      {model.regions.map((region) => (
        <g
          key={region.id}
          className="atlas-places"
          data-places-region={region.id}
          style={{ '--region-color': region.color } as CSSProperties}
        >
          {region.places.map((place) => (
            <g
              key={place.id}
              data-place={place.id}
              className={selected === place.id ? 'atlas-place-selection' : undefined}
              tabIndex={0}
              role="button"
              aria-label={`Select ${place.name}`}
            >
              <title>{place.name}</title>
              <AtlasMarker point={place} name={place.kind} label={place.name} />
            </g>
          ))}
        </g>
      ))}
    </>
  );
});

export const AtlasPins = memo(function AtlasPins({
  pins,
  selected,
}: {
  pins: readonly AtlasPin[];
  selected?: string;
}) {
  return (
    <g className="atlas-pins">
      {pins.map((pin) => (
        <g
          key={pin.id}
          data-pin={pin.id}
          tabIndex={0}
          role="button"
          aria-label={`Select ${pin.name} pin`}
          className={`atlas-pin atlas-pin--${pin.kind}${selected === pin.id ? ' atlas-pin-selection' : ''}`}
        >
          <title>{pin.name}</title>
          <AtlasMarker point={pin} name={pin.kind}>
            <text y="35" className="atlas-pin-label">
              {pin.name}
            </text>
          </AtlasMarker>
        </g>
      ))}
    </g>
  );
});

export function AtlasPlayer({ position }: { position: Point }) {
  return (
    <g className="atlas-player" aria-label="Your location">
      <AtlasMarker point={position} name="player" />
    </g>
  );
}
