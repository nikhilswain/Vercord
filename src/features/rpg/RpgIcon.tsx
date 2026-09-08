export type RpgIconName =
  'map' | 'guide' | 'person' | 'menu' | 'close' | 'plus' | 'minus' | 'center';

const paths: Record<RpgIconName, string> = {
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16',
  guide: 'M4 3h6l2 2 2-2h6v16h-6l-2 2-2-2H4Zm8 2v16M7 7h2m-2 4h2m6-4h2m-2 4h2',
  person: 'M8 5h8v7H8Zm-3 16v-4l4-3h6l4 3v4M9 3v2m6-2v2',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M18 6 6 18',
  plus: 'M12 4v16M4 12h16',
  minus: 'M4 12h16',
  center: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M9 9h6v6H9Z',
};

export function RpgIcon({ name }: { name: RpgIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
