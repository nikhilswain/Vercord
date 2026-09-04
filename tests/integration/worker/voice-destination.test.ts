import { describe, expect, it } from 'vitest';

import type { GuildStructureSnapshot } from '../../../src/domain/discord/snapshot';
import { resolveMappedVoiceDestination } from '../../../worker/voice/destination';

const channelKey = `c_${'A'.repeat(43)}`;
const snapshot = {
  schemaVersion: 1,
  identifierScheme: 'hmac-sha256-v1',
  generatedAt: '2026-09-04T00:00:00.000Z',
  guild: {
    key: `g_${'a'.repeat(43)}`,
    displayName: 'Test guild',
    ownerKey: `m_${'a'.repeat(43)}`,
    everyoneRoleKey: `r_${'a'.repeat(43)}`,
  },
  roles: [{ key: `r_${'a'.repeat(43)}`, permissions: '0' }],
  channels: [
    {
      key: channelKey,
      kind: 'voice',
      discordType: 2,
      label: 'Voice',
      parentKey: null,
      order: 0,
      ageRestricted: false,
      overwrites: [],
    },
  ],
} satisfies GuildStructureSnapshot;

describe('voice destination authorization boundary', () => {
  it('accepts a mapped voice room without a second OAuth membership lookup', () => {
    expect(resolveMappedVoiceDestination(snapshot, channelKey.toLowerCase())).toEqual(
      snapshot.channels[0],
    );
  });

  it('rejects unknown and non-voice destinations', () => {
    expect(resolveMappedVoiceDestination(snapshot, `c_${'b'.repeat(43)}`)).toBeNull();
    expect(
      resolveMappedVoiceDestination(
        { ...snapshot, channels: [{ ...snapshot.channels[0]!, kind: 'text' }] },
        channelKey.toLowerCase(),
      ),
    ).toBeNull();
  });
});
