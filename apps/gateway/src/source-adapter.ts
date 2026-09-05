import type { Guild } from 'discord.js';

import type {
  DiscordBotMemberSource,
  DiscordSourceBundle,
} from '../../../src/domain/discord/source';
import {
  parseDiscordBot,
  parseDiscordBotMember,
  parseDiscordChannels,
  parseDiscordGuild,
  validateDiscordSourceBundle,
} from '../../../src/domain/discord/source-schema';
import { LiveStateError } from './member-state';

const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);

export function sourceFromGuild(
  guild: Guild,
  fallbackBotMember?: DiscordBotMemberSource,
): DiscordSourceBundle {
  const bot = guild.client.user;
  const member = guild.members.me;
  if (!guild.available || bot === null || (member === null && fallbackBotMember === undefined))
    throw new LiveStateError();
  const channels = [...guild.channels.cache.values()]
    // Threads are absent from GET Guild Channels and inherit their parent permissions.
    .filter((channel) => !channel.isThread())
    .sort(byId)
    .map((channel) => {
      if (
        !('permissionOverwrites' in channel) ||
        channel.permissionOverwrites?.cache === undefined
      ) {
        throw new LiveStateError();
      }
      return {
        id: channel.id,
        type: channel.type,
        position: channel.rawPosition,
        name: channel.name,
        parent_id: channel.parentId,
        nsfw: 'nsfw' in channel ? channel.nsfw : false,
        rate_limit_per_user: 'rateLimitPerUser' in channel ? channel.rateLimitPerUser : 0,
        permission_overwrites: [...channel.permissionOverwrites.cache.values()]
          .sort(byId)
          .map((overwrite) => ({
            id: overwrite.id,
            type: overwrite.type,
            allow: overwrite.allow.bitfield.toString(),
            deny: overwrite.deny.bitfield.toString(),
          })),
      };
    });
  return validateDiscordSourceBundle(
    {
      bot: parseDiscordBot({ id: bot.id }),
      guild: parseDiscordGuild({
        id: guild.id,
        name: guild.name,
        owner_id: guild.ownerId,
        roles: [...guild.roles.cache.values()].sort(byId).map((role) => ({
          id: role.id,
          permissions: role.permissions.bitfield.toString(),
        })),
      }),
      botMember:
        member === null
          ? fallbackBotMember!
          : parseDiscordBotMember({
              roles: member.roles.cache
                .filter((role) => role.id !== guild.id)
                .map((role) => role.id)
                .sort(),
            }),
      channels: parseDiscordChannels(channels),
    },
    guild.id,
  );
}
