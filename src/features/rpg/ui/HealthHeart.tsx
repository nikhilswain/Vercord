/** Three native 17 × 15 frames: full, half and empty. Artwork by ArtBIT (CC0). */
export function HealthHeart({ fill }: { fill: 'full' | 'half' | 'empty' }) {
  const frame = { full: 0, half: 1, empty: 2 }[fill];
  return (
    <svg
      className="rpg-health-heart"
      viewBox={`${frame * 17} 0 17 15`}
      width="21"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <image href="/game-assets/pixel-hud/hearts.png" width="51" height="15" />
    </svg>
  );
}
