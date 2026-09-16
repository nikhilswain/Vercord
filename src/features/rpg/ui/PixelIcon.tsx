/** Grid-aligned ability symbols; frames and hearts use Ornate Retro UI art. */
export function PixelIcon({ name }: { name: 'fire' | 'water' | 'lock' | 'herb' }) {
  const paths = {
    fire: 'M8 1h2v4h2v2h2v6h-2v2H4v-2H2V9h2V6h2v3h2z',
    water: 'M7 1h2v3h2v3h2v3h1v3h-2v2H4v-2H2v-3h1V7h2V4h2z',
    lock: 'M5 2h6v2h2v4h1v7H2V8h1V4h2zm2 2H5v4h6V4H9v-1H7z',
    herb: 'M2 3h5v2h2v4h1V6h2V4h3v5h-2v2h-3v4H8v-4H5V9H3V7H2z',
  };
  return (
    <svg
      className={`rpg-pixel-icon rpg-pixel-icon--${name}`}
      viewBox="0 0 16 16"
      width="32"
      height="32"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path d={paths[name]} fill="currentColor" fillRule="evenodd" />
      {name === 'fire' && <path d="M8 8h2v3h1v2H6v-3h2z" fill="#f3d59c" />}
      {name === 'water' && <path d="M5 9h2v3h4v1H5z" fill="#d2e1c9" />}
      {name === 'lock' && <path d="M7 10h2v3H7z" fill="#14291f" />}
    </svg>
  );
}
