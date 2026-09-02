import type { IdentifierFactory } from '../../src/domain/discord/identifiers';
import { ADMINISTRATOR, VIEW_CHANNEL } from '../../src/domain/discord/constants';
import type { GuildStructureSnapshot } from '../../src/domain/discord/snapshot';
import {
  parseMapSnapshot,
  type MapArea,
  type MapRoom,
  type MapSnapshot,
} from '../../src/domain/map/snapshot';
import { isSafeMapDisplayText } from '../../src/domain/map/labels';
import type { PublicationAllowlist } from '../config/schema';

interface PublicMapOptions {
  slug: string;
  allowlist: PublicationAllowlist;
  identifiers: IdentifierFactory;
}

export interface MemberMapOptions {
  slug: string;
  memberKey: string;
  memberRoleKeys: ReadonlySet<string>;
  isOwner: boolean;
}

const uncategorizedAreaKey = 'a_uncategorized';
const unsafePublicControls = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu;
type SnapshotChannel = GuildStructureSnapshot['channels'][number];
type SnapshotRoom = SnapshotChannel & { kind: MapRoom['type'] };

function compareOrder(
  left: { order: number; key: string },
  right: { order: number; key: string },
): number {
  return left.order - right.order || left.key.localeCompare(right.key);
}

function publicKey(privateKey: string): string {
  return privateKey.toLowerCase();
}

function publicLabel(value: string, fallback: string): string {
  const sanitized = value.replace(unsafePublicControls, '').trim();
  return isSafeMapDisplayText(sanitized) ? sanitized : fallback;
}

function toMapRoom(channel: SnapshotRoom, order: number): MapRoom {
  return {
    key: publicKey(channel.key),
    label: publicLabel(channel.label, 'Discord room'),
    type: channel.kind,
    order,
  };
}

function isRoom(channel: SnapshotChannel): channel is SnapshotRoom {
  return channel.kind !== 'category';
}

function applyOverwrite(permissions: bigint, deny: bigint, allow: bigint): bigint {
  return (permissions & ~deny) | allow;
}

function memberBasePermissions(
  snapshot: GuildStructureSnapshot,
  options: MemberMapOptions,
): bigint {
  const everyone = snapshot.roles.find(({ key }) => key === snapshot.guild.everyoneRoleKey);
  if (everyone === undefined) throw new Error('SNAPSHOT_INVALID');

  let permissions = BigInt(everyone.permissions);
  for (const role of snapshot.roles) {
    if (options.memberRoleKeys.has(role.key)) permissions |= BigInt(role.permissions);
  }
  return options.isOwner || (permissions & ADMINISTRATOR) === ADMINISTRATOR ? ~0n : permissions;
}

function memberCanView(
  channel: SnapshotChannel,
  snapshot: GuildStructureSnapshot,
  options: MemberMapOptions,
  basePermissions: bigint,
): boolean {
  if ((basePermissions & ADMINISTRATOR) === ADMINISTRATOR) return true;

  let permissions = basePermissions;
  const everyoneOverwrite = channel.overwrites.find(
    ({ targetKey, targetType }) =>
      targetType === 'role' && targetKey === snapshot.guild.everyoneRoleKey,
  );
  if (everyoneOverwrite !== undefined) {
    permissions = applyOverwrite(
      permissions,
      BigInt(everyoneOverwrite.deny),
      BigInt(everyoneOverwrite.allow),
    );
  }

  let roleDeny = 0n;
  let roleAllow = 0n;
  for (const overwrite of channel.overwrites) {
    if (overwrite.targetType === 'role' && options.memberRoleKeys.has(overwrite.targetKey)) {
      roleDeny |= BigInt(overwrite.deny);
      roleAllow |= BigInt(overwrite.allow);
    }
  }
  permissions = applyOverwrite(permissions, roleDeny, roleAllow);

  const memberOverwrite = channel.overwrites.find(
    ({ targetKey, targetType }) => targetType === 'member' && targetKey === options.memberKey,
  );
  if (memberOverwrite !== undefined) {
    permissions = applyOverwrite(
      permissions,
      BigInt(memberOverwrite.deny),
      BigInt(memberOverwrite.allow),
    );
  }

  return (permissions & VIEW_CHANNEL) === VIEW_CHANNEL;
}

function assembleMapSnapshot(
  snapshot: GuildStructureSnapshot,
  slug: string,
  selectedRooms: SnapshotRoom[],
  includedCategoryKeys: ReadonlySet<string>,
): MapSnapshot {
  const visibleCategories = snapshot.channels
    .filter((channel) => channel.kind === 'category')
    .sort(compareOrder);
  const visibleCategoryKeys = new Set(visibleCategories.map(({ key }) => key));
  const roomsByParent = new Map<string | null, SnapshotRoom[]>();

  for (const room of selectedRooms.sort(compareOrder)) {
    const parentKey =
      room.parentKey !== null && visibleCategoryKeys.has(room.parentKey) ? room.parentKey : null;
    const siblings = roomsByParent.get(parentKey) ?? [];
    siblings.push(room);
    roomsByParent.set(parentKey, siblings);
  }

  const selectedParentKeys = new Set(
    selectedRooms.flatMap(({ parentKey }) => (parentKey === null ? [] : [parentKey])),
  );
  const areas: MapArea[] = visibleCategories
    .filter(
      (category) => includedCategoryKeys.has(category.key) || selectedParentKeys.has(category.key),
    )
    .map((category, order) => ({
      key: publicKey(category.key),
      label: publicLabel(category.label, 'Discord area'),
      order,
      rooms: (roomsByParent.get(category.key) ?? []).map((room, roomOrder) =>
        toMapRoom(room, roomOrder),
      ),
    }));
  const uncategorizedRooms = roomsByParent.get(null) ?? [];

  if (uncategorizedRooms.length > 0) {
    areas.push({
      key: uncategorizedAreaKey,
      label: 'Uncategorized',
      order: areas.length,
      rooms: uncategorizedRooms.map((room, order) => toMapRoom(room, order)),
    });
  }

  return parseMapSnapshot({
    schemaVersion: 1,
    slug,
    generatedAt: snapshot.generatedAt,
    server: { displayName: publicLabel(snapshot.guild.displayName, 'Discord server') },
    areas,
  });
}

export function createPrivatePreviewMapSnapshot(
  snapshot: GuildStructureSnapshot,
  slug: string,
): MapSnapshot {
  const rooms = snapshot.channels.filter(isRoom);
  const categoryKeys = new Set(
    snapshot.channels.filter((channel) => channel.kind === 'category').map(({ key }) => key),
  );
  return assembleMapSnapshot(snapshot, slug, rooms, categoryKeys);
}

export function createMemberMapSnapshot(
  snapshot: GuildStructureSnapshot,
  options: MemberMapOptions,
): MapSnapshot {
  const basePermissions = memberBasePermissions(snapshot, options);
  const selectedRooms = snapshot.channels
    .filter(isRoom)
    .filter((channel) => memberCanView(channel, snapshot, options, basePermissions));
  return assembleMapSnapshot(snapshot, options.slug, selectedRooms, new Set());
}

export async function createPublicMapSnapshot(
  snapshot: GuildStructureSnapshot,
  options: PublicMapOptions,
): Promise<MapSnapshot> {
  const [allowedCategoryKeys, allowedChannelKeys] = await Promise.all([
    Promise.all(options.allowlist.categoryIds.map((id) => options.identifiers.for('channel', id))),
    Promise.all(options.allowlist.channelIds.map((id) => options.identifiers.for('channel', id))),
  ]);
  const categoryAllowlist = new Set(allowedCategoryKeys);
  const channelAllowlist = new Set(allowedChannelKeys);
  const visibleCategories = snapshot.channels
    .filter((channel) => channel.kind === 'category')
    .sort(compareOrder);
  const ageRestrictedCategoryKeys = new Set(
    visibleCategories.filter(({ ageRestricted }) => ageRestricted).map(({ key }) => key),
  );
  const selectedRooms = snapshot.channels
    .filter(isRoom)
    .filter(
      (channel) =>
        channelAllowlist.has(channel.key) ||
        (channel.parentKey !== null &&
          categoryAllowlist.has(channel.parentKey) &&
          !ageRestrictedCategoryKeys.has(channel.parentKey) &&
          !channel.ageRestricted),
    )
    .sort(compareOrder);
  return assembleMapSnapshot(snapshot, options.slug, selectedRooms, categoryAllowlist);
}
