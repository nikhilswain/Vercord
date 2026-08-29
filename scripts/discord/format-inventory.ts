import { GUILD_CATEGORY } from '../../src/domain/discord/constants';
import { selectBotVisibleChannels } from '../../src/domain/discord/permissions';
import type { DiscordChannelSource, DiscordSourceBundle } from '../../src/domain/discord/source';

// These are the exact terminal control and bidirectional-formatting ranges we must escape.
// eslint-disable-next-line no-control-regex
const TERMINAL_UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

export function escapeTerminalLabel(value: string): string {
  return value.replace(TERMINAL_UNSAFE, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return '\\u{FFFD}';
    return `\\u{${codePoint.toString(16).toUpperCase().padStart(4, '0')}}`;
  });
}

export function formatBotVisibleInventory(bundle: DiscordSourceBundle): string {
  const visible = selectBotVisibleChannels(bundle);
  const categories = visible
    .filter(({ type }) => type === GUILD_CATEGORY)
    .sort(compareDiscordOrder);
  const channels = visible.filter(({ type }) => type !== GUILD_CATEGORY);
  const parentlessChannels = channels.filter(({ parentId }) => parentId === null);
  const groups = [
    ...categories.map((category) => ({ category, channels: childrenOf(category, channels) })),
    ...(parentlessChannels.length > 0
      ? [{ category: null, channels: [...parentlessChannels].sort(compareDiscordOrder) }]
      : []),
  ];
  const unsupported = channels.filter(({ type }) => channelKind(type) === 'unsupported').length;
  const ageRestricted = channels.filter(({ nsfw }) => nsfw).length;
  const lines = [
    'Discord bot-visible inventory',
    `Guild: ${escapeTerminalLabel(bundle.guild.name)}`,
    `Counts: categories=${categories.length} channels=${channels.length} unsupported=${unsupported} age-restricted=${ageRestricted}`,
    'Tree:',
  ];

  groups.forEach(({ category, channels: groupedChannels }, groupIndex) => {
    const lastGroup = groupIndex === groups.length - 1;
    const groupMarker = lastGroup ? '`-' : '|-';
    if (category === null) {
      lines.push(`${groupMarker} Uncategorized`);
    } else {
      lines.push(`${groupMarker} [category] ${escapeTerminalLabel(category.name)}`);
    }

    groupedChannels.forEach((channel, channelIndex) => {
      const lastChannel = channelIndex === groupedChannels.length - 1;
      const indent = lastGroup ? '   ' : '|  ';
      const channelMarker = lastChannel ? '`-' : '|-';
      const restriction = channel.nsfw ? ', age-restricted' : '';
      lines.push(
        `${indent}${channelMarker} [${channelKind(channel.type)}${restriction}] ${escapeTerminalLabel(channel.name)}`,
      );
    });
  });

  lines.push(
    'Warning: omitted private channels are unknowable to the bot; this output can contain private names.',
  );
  return lines.join('\n');
}

function childrenOf(
  category: DiscordChannelSource,
  channels: DiscordChannelSource[],
): DiscordChannelSource[] {
  return channels.filter(({ parentId }) => parentId === category.id).sort(compareDiscordOrder);
}

function compareDiscordOrder(left: DiscordChannelSource, right: DiscordChannelSource): number {
  if (left.position !== right.position) return left.position < right.position ? -1 : 1;
  const leftId = BigInt(left.id);
  const rightId = BigInt(right.id);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function channelKind(type: number): string {
  switch (type) {
    case 0:
      return 'text';
    case 2:
      return 'voice';
    case GUILD_CATEGORY:
      return 'category';
    case 5:
      return 'announcement';
    case 13:
      return 'stage';
    case 15:
      return 'forum';
    case 16:
      return 'media';
    default:
      return 'unsupported';
  }
}
