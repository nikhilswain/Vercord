import type { MapRoomType } from '../../../domain/map/snapshot';

export function RoomTypeIcon({ type }: { type: MapRoomType }) {
  const mark = (() => {
    switch (type) {
      case 'text':
        return <path d="M4 7h12M4 13h12M8 3 6 17M14 3l-2 14" />;
      case 'voice':
        return <path d="M5 9v2h3l4 3V6L8 9H5m9-1c1 1 1 3 0 4" />;
      case 'announcement':
        return <path d="M4 9v2h3l7 3V6L7 9H4m3 2 1 5" />;
      case 'stage':
        return <path d="M5 15h10M7 12h6M10 4v8m-3-5a3 3 0 0 0 6 0" />;
      case 'forum':
        return <path d="M4 5h12v8H9l-3 3v-3H4V5Z" />;
      case 'media':
        return (
          <>
            <rect x="4" y="5" width="12" height="10" rx="1" />
            <path d="m6 13 3-3 2 2 2-2 3 3" />
          </>
        );
      case 'unsupported':
        return <path d="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 4v4m0 3v.01" />;
    }
  })();

  return (
    <g className="room-type-icon" aria-hidden="true">
      {mark}
    </g>
  );
}
