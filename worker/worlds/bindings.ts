import type { MapSnapshot } from '../../src/domain/map/snapshot';
import type { WorldDocument } from '../../src/domain/world/document';
import type { WorldBindings } from '../../src/domain/world/protocol';

function anchorIndex(key: string, count: number): number {
  let value = 2166136261;
  for (const character of key) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return (value >>> 0) % count;
}

/** Only receives the member's authorized projection. Channel count never shapes geometry. */
export function projectWorldBindings(
  document: WorldDocument,
  snapshot: MapSnapshot,
): WorldBindings {
  const anchors = document.scenes.overworld.landmarks
    .filter((landmark) => landmark.kind !== 'portal')
    .map((landmark) => landmark.id)
    .sort();
  if (!anchors.length) return [];
  const bindings: WorldBindings = anchors.map((landmarkId) => ({ landmarkId, rooms: [] }));
  for (const area of snapshot.areas) {
    for (const room of area.rooms) {
      bindings[anchorIndex(room.key, anchors.length)]!.rooms.push({
        key: room.key,
        label: room.label,
        type: room.type,
      });
    }
  }
  // Even empty physical landmarks stay on the map, with no hints about hidden channels.
  return bindings;
}
