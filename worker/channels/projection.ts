import { channelStateSchema, type ChannelState } from '../../src/domain/channels/protocol';
import {
  MANAGE_CHANNELS,
  hasChannelPermission,
  isSupportedChannelType,
  sourceForMember,
} from '../../src/domain/discord/channel-policy';
import { VIEW_CHANNEL } from '../../src/domain/discord/constants';
import type { IdentifierFactory } from '../../src/domain/discord/identifiers';
import type { MemberAccess } from '../../src/domain/discord/live-protocol';
import type { GuildStructureSnapshot } from '../../src/domain/discord/snapshot';
import type { DiscordSourceBundle } from '../../src/domain/discord/source';
import { publicLabel } from '../../src/domain/map/labels';
import { createMemberMapSnapshot } from '../publication/create-public-map';

/** Project only an already validated, authoritative source; never perform provider reads here. */
export async function projectChannelState(input: {
  source: DiscordSourceBundle;
  snapshot: GuildStructureSnapshot;
  member: MemberAccess;
  slug: string;
  identifiers: IdentifierFactory;
}): Promise<ChannelState> {
  const { source, snapshot, member, slug, identifiers } = input;
  const actorSource = sourceForMember(source, member);
  const [memberKey, memberRoleKeys] = await Promise.all([
    identifiers.for('member', member.userId),
    Promise.all(member.roleIds.map((id) => identifiers.for('role', id))),
  ]);
  const projected = createMemberMapSnapshot(snapshot, {
    slug,
    memberKey,
    memberRoleKeys: new Set(memberRoleKeys),
    isOwner: source.guild.ownerId === member.userId,
  });
  const visibleKeys = new Set(
    projected.areas.flatMap((area) => area.rooms.map((room) => room.key)),
  );
  const disabledUntil =
    member.communicationDisabledUntil === null
      ? null
      : Date.parse(member.communicationDisabledUntil);
  const mutable =
    !member.pending &&
    (disabledUntil === null || (Number.isFinite(disabledUntil) && disabledUntil <= Date.now()));
  const canCreate =
    mutable &&
    hasChannelPermission(actorSource, null, MANAGE_CHANNELS) &&
    hasChannelPermission(source, null, MANAGE_CHANNELS);
  const categories: ChannelState['controls']['categories'] = [];
  const manageableKeys: string[] = [];
  if (mutable)
    for (const channel of source.channels) {
      if (
        !hasChannelPermission(actorSource, channel, VIEW_CHANNEL | MANAGE_CHANNELS) ||
        !hasChannelPermission(source, channel, VIEW_CHANNEL | MANAGE_CHANNELS)
      )
        continue;
      const key = (await identifiers.for('channel', channel.id)).toLowerCase();
      if (channel.type === 4 && canCreate)
        categories.push({ key, label: publicLabel(channel.name, 'Discord area') });
      else if (isSupportedChannelType(channel.type) && visibleKeys.has(key))
        manageableKeys.push(key);
    }
  return channelStateSchema.parse({
    snapshot: projected,
    controls: {
      canCreateRoot:
        canCreate &&
        hasChannelPermission(actorSource, null, VIEW_CHANNEL) &&
        hasChannelPermission(source, null, VIEW_CHANNEL),
      categories,
      manageableKeys,
    },
  });
}
