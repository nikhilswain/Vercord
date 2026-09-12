export type RpgIconName =
  | 'map'
  | 'guide'
  | 'person'
  | 'menu'
  | 'close'
  | 'plus'
  | 'minus'
  | 'center'
  | 'fire'
  | 'water'
  | 'herb'
  | 'settings'
  | 'music'
  | 'volume'
  | 'muted';

const paths: Record<RpgIconName, string> = {
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16',
  guide: 'M4 3h6l2 2 2-2h6v16h-6l-2 2-2-2H4Zm8 2v16M7 7h2m-2 4h2m6-4h2m-2 4h2',
  person: 'M8 5h8v7H8Zm-3 16v-4l4-3h6l4 3v4M9 3v2m6-2v2',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M18 6 6 18',
  plus: 'M12 4v16M4 12h16',
  minus: 'M4 12h16',
  center: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M9 9h6v6H9Z',
  fire: 'M13 2c2 7-5 7-3 12 2 0 3-2 4-4 7 6 5 12-2 12S1 15 6 9c0 3 2 4 2 4-1-5 4-7 5-11Z',
  water: 'M12 2C10 6 4 11 4 15a8 8 0 0 0 16 0c0-4-6-9-8-13Zm-4 13a4 4 0 0 0 4 4',
  herb: 'M12 21V9m0 7C5 16 3 12 3 7c5 0 9 3 9 9Zm0-4c0-6 3-9 9-10 0 6-3 10-9 10Z',
  settings: 'M4 7h3m4 0h9M4 17h9m4 0h3M7 4h4v6H7Zm6 10h4v6h-4Z',
  music: 'M9 18V5l11-2v13M9 9l11-2M9 18c0 3-6 4-6 1s6-4 6-1Zm11-2c0 3-6 4-6 1s6-4 6-1Z',
  volume: 'M3 9h4l5-4v14l-5-4H3Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  muted: 'M3 9h4l5-4v14l-5-4H3Zm13 0 6 6m0-6-6 6',
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
