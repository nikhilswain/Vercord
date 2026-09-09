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
  if (town.continuous) {
    const rooms = new Map(
      town.districts.flatMap((district) =>
        district.streets.flatMap((street) =>
          street.rooms.map((room) => [room.landmarkId, { room, district }] as const),
        ),
      ),
    );
    const signage: RpgSceneLabel[] = [];
    const districtAnchors = new Map<string, Array<{ x: number; y: number }>>();
    const landmarks = sample.landmarks.flatMap((landmark) => {
      if (!landmark.id.startsWith('house:')) return [landmark];
      const binding = rooms.get(landmark.id);
      if (!binding) return [];
      const { room, district } = binding;
      const anchor = landmark.labelAnchor ?? { x: landmark.x, y: landmark.y - 180 };
      signage.push({
        ...anchor,
        text: room.label,
        roomType: room.type,
        kind: 'room',
        maxWidth: 196,
      });
      const anchors = districtAnchors.get(district.key) ?? [];
      anchors.push(anchor);
      districtAnchors.set(district.key, anchors);
      return [
        {
          ...landmark,
          name: room.label,
          description: `${ROOM_TYPE_LABELS[room.type]} channel · ${district.label}.`,
        },
      ];
    });
    for (const district of town.districts) {
      if (district.anchors?.length) {
        signage.push(
          ...district.anchors.map((anchor) => ({
            ...anchor,
            text: district.label,
            kind: 'district' as const,
            maxWidth: 260,
          })),
        );
        continue;
      }
      const anchors = districtAnchors.get(district.key);
      if (!anchors?.length) continue;
      signage.push({
        x:
          (Math.min(...anchors.map((point) => point.x)) +
            Math.max(...anchors.map((point) => point.x))) /
          2,
        y: Math.min(...anchors.map((point) => point.y)) - 64,
        text: district.label,
        kind: 'district',
        maxWidth: 260,
      });
    }
    return {
      ...sample,
      name: serverName,
      subtitle: 'Neighborhoods & channel houses',
      landmarks,
      signage,
      townSquareNavigation: false,
    };
  }
  const active = activeTownStreet(town);
  const signage: RpgSceneLabel[] = [];
  if (!active) return { ...sample, name: 'Town square', signage };
  const rooms = new Map(active.street.rooms.map((room) => [room.landmarkId, room]));
  const landmarks = sample.landmarks.flatMap((landmark) => {
    if (!landmark.id.startsWith('house:')) return [landmark];
    const room = rooms.get(landmark.id);
    if (!room) return [];
    signage.push({
      x: landmark.labelAnchor?.x ?? landmark.x,
      y: landmark.labelAnchor?.y ?? landmark.y - 180,
      text: room.label,
      roomType: room.type,
      kind: 'room',
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
  const roofLabels = signage.filter((label) => label.kind === 'room');
  if (roofLabels.length)
    signage.push({
      x:
        (Math.min(...roofLabels.map((label) => label.x)) +
          Math.max(...roofLabels.map((label) => label.x))) /
        2,
      y: Math.min(...roofLabels.map((label) => label.y)) - 64,
      text: active.district.label,
      kind: 'district',
      maxWidth: 260,
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
