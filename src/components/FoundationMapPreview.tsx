export function FoundationMapPreview() {
  return (
    <svg
      className="foundation-map"
      viewBox="0 0 760 460"
      role="img"
      aria-labelledby="foundation-map-title"
      aria-describedby="foundation-map-description"
    >
      <title id="foundation-map-title">Preview of category districts and channel rooms</title>
      <desc id="foundation-map-description">
        Three abstract districts demonstrate how Discord categories and channels will become a map.
      </desc>
      <defs>
        <pattern id="map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" className="map-grid-line" />
        </pattern>
        <filter id="district-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="12" floodOpacity="0.24" />
        </filter>
      </defs>
      <rect width="760" height="460" rx="24" className="map-background" />
      <rect width="760" height="460" rx="24" fill="url(#map-grid)" />
      <path className="map-route" d="M108 284 C188 226 216 199 298 201" />
      <path className="map-route" d="M418 193 C488 184 536 206 594 253" />
      <path className="map-route map-route-secondary" d="M332 294 C378 337 441 344 501 327" />
      <g filter="url(#district-shadow)">
        <g className="district district-violet">
          <rect x="70" y="92" width="232" height="184" rx="28" />
          <text x="94" y="126" className="district-label">
            Welcome
          </text>
          <rect x="94" y="150" width="82" height="52" rx="14" className="room" />
          <rect x="190" y="150" width="88" height="52" rx="14" className="room" />
          <rect x="94" y="216" width="184" height="36" rx="12" className="room room-wide" />
        </g>
        <g className="district district-cyan">
          <rect x="330" y="64" width="174" height="238" rx="28" />
          <text x="354" y="100" className="district-label">
            Create
          </text>
          <rect x="354" y="124" width="126" height="50" rx="14" className="room" />
          <rect x="354" y="188" width="55" height="88" rx="14" className="room" />
          <rect x="423" y="188" width="57" height="88" rx="14" className="room" />
        </g>
        <g className="district district-amber">
          <rect x="530" y="178" width="164" height="190" rx="28" />
          <text x="554" y="214" className="district-label">
            Gather
          </text>
          <rect x="554" y="238" width="116" height="48" rx="14" className="room" />
          <rect x="554" y="300" width="50" height="44" rx="14" className="room" />
          <rect x="618" y="300" width="52" height="44" rx="14" className="room" />
        </g>
      </g>
      <circle cx="304" cy="201" r="7" className="route-node" />
      <circle cx="505" cy="327" r="7" className="route-node" />
    </svg>
  );
}
