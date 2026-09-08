import type { MapSnapshot } from '../../src/domain/map/snapshot';
import type { WorldBindings, WorldTown } from '../../src/domain/world/protocol';
import { STREET_HOUSE_COUNT } from '../../src/domain/world/streets';
import type { HouseAddress, StreetRow } from './town-repository';

/** Source labels and grouping come only from the latest member-authorized snapshot. */
export function projectTown(
  snapshot: MapSnapshot,
  addresses: HouseAddress[],
  streets: StreetRow[],
  activeStreetId: string | null,
): WorldTown {
  const homes = new Map(
    addresses.map((address) => [`${address.category_key}:${address.channel_key}`, address]),
  );
  const streetBySlot = new Map(
    streets.map((street) => [`${street.category_key}:${street.street_index}`, street]),
  );
  return {
    activeStreetId,
    districts: [...snapshot.areas]
      .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
      .map((area) => {
        const visible = new Map<string, WorldTown['districts'][number]['streets'][number]>();
        for (const room of [...area.rooms].sort(
          (a, b) => a.order - b.order || a.key.localeCompare(b.key),
        )) {
          const home = homes.get(`${area.key}:${room.key}`);
          if (!home) continue;
          const street = streetBySlot.get(
            `${area.key}:${Math.floor(home.slot / STREET_HOUSE_COUNT)}`,
          );
          if (!street) continue;
          let projected = visible.get(street.street_id);
          if (!projected) {
            projected = { id: street.street_id, number: street.street_index + 1, rooms: [] };
            visible.set(street.street_id, projected);
          }
          projected.rooms.push({
            key: room.key,
            label: room.label,
            type: room.type,
            landmarkId: `house:${home.slot % STREET_HOUSE_COUNT}`,
          });
        }
        return {
          key: area.key,
          label: area.label,
          streets: [...visible.values()].sort((a, b) => a.number - b.number),
        };
      }),
  };
}

export function streetBindings(town: WorldTown): WorldBindings {
  const street = town.districts
    .flatMap((district) => district.streets)
    .find((entry) => entry.id === town.activeStreetId);
  return street?.rooms.map(({ landmarkId, ...room }) => ({ landmarkId, rooms: [room] })) ?? [];
}
