import type { MapRoomType } from '../../domain/map/snapshot';
import type { WorldTown } from '../../domain/world/protocol';
import type { RpgSample, RpgSceneLabel } from './types';

export const ROOM_TYPE_LABELS: Record<MapRoomType, string> = {
  text: 'Text',
  voice: 'Voice',
  announcement: 'Announcement',
  forum: 'Forum',
  stage: 'Stage',
  media: 'Media',
  unsupported: 'Channel',
};

export function activeTownStreet(town: WorldTown) {
  for (const district of town.districts) {
    const street = district.streets.find((entry) => entry.id === town.activeStreetId);
    if (street) return { district, street };
  }
  return null;
}

/** Attach only the current member's public labels; retain every saved art and collision coordinate. */
export function presentTownScene(
  sample: RpgSample,
  serverName: string,
  town: WorldTown,
): RpgSample {
  if (sample.id === 'dungeon') return sample;
  const active = activeTownStreet(town);
  const signage: RpgSceneLabel[] = [
    {
      x: sample.spawn.x,
      y: sample.spawn.y - 80,
      text: serverName,
      detail: active ? `${active.district.label} · Street ${active.street.number}` : 'Town square',
      maxWidth: 250,
    },
  ];
  if (!active) return { ...sample, name: 'Town square', signage };
  const rooms = new Map(active.street.rooms.map((room) => [room.landmarkId, room]));
  const landmarks = sample.landmarks.flatMap((landmark) => {
    if (!landmark.id.startsWith('house:')) return [landmark];
    const room = rooms.get(landmark.id);
    if (!room) return [];
    signage.push({
      x: landmark.x,
      y: landmark.y - 74,
      text: room.label,
      roomType: room.type,
      maxWidth: 196,
    });
    return [
      {
        ...landmark,
        name: room.label,
        description: `${ROOM_TYPE_LABELS[room.type]} channel · ${active.district.label} · Street ${active.street.number}.`,
      },
    ];
  });
  const square = landmarks.find((landmark) => landmark.id === 'town-square');
  if (square) signage.push({ x: square.x, y: square.y - 36, text: 'Town square', maxWidth: 140 });
  return {
    ...sample,
    name: active.district.label,
    subtitle: `Street ${active.street.number}`,
    landmarks,
    signage,
    townSquareNavigation: true,
  };
}
