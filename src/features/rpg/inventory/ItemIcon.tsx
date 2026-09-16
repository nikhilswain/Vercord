import type { ItemId } from '../../../domain/adventure/inventory';

/** Small authored vector inventory symbols; no external icon/font dependency. */
export function ItemIcon({ id }: { id: ItemId }) {
  return (
    <svg
      className="rpg-item-icon"
      viewBox="0 0 32 32"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {id === 'raw-meat' || id === 'raw-fowl' ? (
        <>
          <path fill="#654234" d="M5 8h5V5h12v3h5v15h-5v4H10v-4H5z" />
          <path fill="#dd8c73" d="M8 9h4V7h9v3h4v11h-5v4h-9v-4H8z" />
          <path fill="#a84f4f" d="M11 11h10v3h2v5h-6v4h-5v-4H9v-5h2z" />
          <path
            fill="#f3dcad"
            d={
              id === 'raw-fowl'
                ? 'M18 18h4v4h4v-2h3v5h-4v3h-4v-5h-3z'
                : 'M14 12h6v3h2v5h-7v-3h-3v-3h2z'
            }
          />
          <path fill="#dfb68c" d="M16 14h3v4h-3z" />
        </>
      ) : id === 'wild-hide' ? (
        <>
          <path fill="#59402c" d="m6 4 6 4h8l6-4 3 5-5 6v6l4 6-6 2-5-4h-3l-5 4-5-3 4-6v-6L3 9z" />
          <path fill="#bd9160" d="m7 7 5 4h8l5-4 1 2-5 6v7l3 3-3 1-5-4-6 4-3-1 4-5v-6L6 9z" />
        </>
      ) : id === 'feather' ? (
        <>
          <path fill="#a6c2c0" d="M23 3h6v8l-4 7h-5v4h-6l-5 5-3-3 5-5v-7l6-5z" />
          <path
            fill="#f1e5c4"
            d="M23 5h3v5h-3v3h-3v3h-3v3h-3v3h-3v3H8v3H5v-3h3v-3h3v-3h3v-3h3v-3h3v-3h3z"
          />
        </>
      ) : id === 'mira-notes' ? (
        <>
          <path fill="#9b7045" d="M5 5h23v6h-3v17H7V11H4V7z" />
          <path fill="#eddaaa" d="M8 7h17v3h-3v15H9V10H7z" />
          <path fill="#7f7954" d="M12 12h7v2h-7zm0 5h7v2h-7zm0 4h4v1h-4z" />
        </>
      ) : (
        <>
          <path fill="#719557" d="M15 13h3v15h-3zM6 16h6v3h3v4h-5v-3H6zm13-2h7v5h-4v3h-4v-5z" />
          <path
            fill={id === 'moonblossom' ? '#b0cde3' : '#e4bd68'}
            d="M12 4h7v5h5v7h-6v4h-7v-5H6V9h6z"
          />
          <path fill={id === 'moonblossom' ? '#f4f2d6' : '#faf0b4'} d="M13 9h6v6h-6z" />
        </>
      )}
    </svg>
  );
}
