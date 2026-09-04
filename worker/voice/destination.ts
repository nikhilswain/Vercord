import type { GuildStructureSnapshot } from '../../src/domain/discord/snapshot';

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
