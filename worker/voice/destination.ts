import type { IdentifierFactory } from '../../src/domain/discord/identifiers';
import type { GuildStructureSnapshot } from '../../src/domain/discord/snapshot';
import type { DiscordChannelSource } from '../../src/domain/discord/source';

type SnapshotChannel = GuildStructureSnapshot['channels'][number];
type VoiceDestination = SnapshotChannel & { kind: 'voice' | 'stage' };

export function resolveMappedVoiceDestination(
  snapshot: GuildStructureSnapshot,
  roomKey: string,
): VoiceDestination | null {
  const channel = snapshot.channels.find(({ key }) => key.toLowerCase() === roomKey);
  return channel?.kind === 'voice' || channel?.kind === 'stage'
    ? (channel as VoiceDestination)
    : null;
}

export async function resolveDiscordVoiceChannelId(
  channels: readonly DiscordChannelSource[],
  roomKey: string,
  identifiers: IdentifierFactory,
): Promise<string | null> {
  for (const channel of channels) {
    if (channel.type !== 2 && channel.type !== 13) continue;
    const channelKey = await identifiers.for('channel', channel.id);
    if (channelKey.toLowerCase() === roomKey) return channel.id;
  }
  return null;
}
