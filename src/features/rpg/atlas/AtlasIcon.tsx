import type { AtlasPlaceKind, PinKind } from './types';

// Original glyphs from the reviewed atlas. One small SVG set, no icon runtime.
const paths = {
  text: 'M-10 0 0-9 10 0M-7-2V9H7V-2M-2 3V9M3-4H6M4-6V-2',
  voice: 'M-10 0 0-9 10 0M-7-2V9H7V-2M-3 2H-1L2 0V7L-1 5H-3ZM4 1Q7 3.5 4 6',
  forum: 'M-9-7H9V5H1L-5 10V5H-9ZM-5-3H5M-5 1H2',
  announcement: 'M-8-3H-3L8-8V7L-3 2H-8ZM-5 2-3 9H0L-1 3',
  landmark: 'M-9 9H9M-7 7V-5H-3V-8H3V-5H7V7M-2 7V2H2V7M-3-2H3',
  npc: 'M-4-5a4 4 0 1 0 8 0a4 4 0 1 0-8 0M-8 9V6Q-8 1 0 1Q8 1 8 6V9Z',
  region: 'M0-10 8 0 0 10-8 0ZM0-4 3 0 0 4-3 0Z',
  player: 'M0-10 7 7 0 3-7 7ZM0-5V1',
  location:
    'M0 10S-7 2-7-3A7 7 0 1 1 7-3C7 2 0 10 0 10ZM-2.5-3a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
  flower:
    'M0-3C-7-12 7-12 0-3C7-11 13 1 3 0C14 4 4 12 2 3C2 14-9 10-2 3C-13 8-13-5-3-1C-12-8 0-13 0-3ZM-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  close: 'M-6-6 6 6M6-6-6 6',
  target: 'M-9-4V-9H-4M4-9H9V-4M9 4H9V9H4M-4 9H-9V4M-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
};
export type AtlasIconName = AtlasPlaceKind | PinKind | keyof typeof paths;
export function AtlasGlyph({ name }: { name: AtlasIconName }) {
  return (
    <path
      d={
        paths[
          name === 'stage'
            ? 'voice'
            : name === 'media'
              ? 'forum'
              : name === 'unsupported'
                ? 'text'
                : name
        ]
      }
    />
  );
}
export function AtlasIcon({ name }: { name: AtlasIconName }) {
  return (
    <svg viewBox="-12 -12 24 24" className="atlas-icon" aria-hidden="true">
      <AtlasGlyph name={name} />
    </svg>
  );
}
