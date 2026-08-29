import { describe, expect, it } from 'vitest';

import { DiscordDomainError } from '../../../../src/domain/discord/errors';
import { parseGuildStructureSnapshot } from '../../../../src/domain/discord/snapshot';
import { TEST_IDS } from '../../../fixtures/discord/guild-source';

const KEYS = {
  guild: `g_${'A'.repeat(43)}`,
  owner: `m_${'B'.repeat(43)}`,
  everyone: `r_${'C'.repeat(43)}`,
  staff: `r_${'D'.repeat(43)}`,
  category: `c_${'E'.repeat(43)}`,
  text: `c_${'F'.repeat(43)}`,
  rootVoice: `c_${'G'.repeat(43)}`,
  member: `m_${'H'.repeat(43)}`,
} as const;

interface MutableSnapshot {
  schemaVersion: unknown;
  identifierScheme: unknown;
  generatedAt: unknown;
  guild: {
    key: unknown;
    displayName: unknown;
    ownerKey: unknown;
    everyoneRoleKey: unknown;
    [key: string]: unknown;
  };
  roles: Array<{ key: unknown; permissions: unknown; [key: string]: unknown }>;
  channels: Array<{
    key: unknown;
    kind: unknown;
    discordType: unknown;
    label: unknown;
    parentKey: unknown;
    order: unknown;
    ageRestricted: unknown;
    overwrites: Array<{
      targetKey: unknown;
      targetType: unknown;
      allow: unknown;
      deny: unknown;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

function validSnapshot(): MutableSnapshot {
  return {
    schemaVersion: 1,
    identifierScheme: 'hmac-sha256-v1',
    generatedAt: '2026-08-29T00:00:00.000Z',
    guild: {
      key: KEYS.guild,
      displayName: 'Invented Test Guild',
      ownerKey: KEYS.owner,
      everyoneRoleKey: KEYS.everyone,
    },
    roles: [
      { key: KEYS.everyone, permissions: '1024' },
      { key: KEYS.staff, permissions: '0' },
    ],
    channels: [
      {
        key: KEYS.category,
        kind: 'category',
        discordType: 4,
        label: 'Public',
        parentKey: null,
        order: 0,
        ageRestricted: false,
        overwrites: [],
      },
      {
        key: KEYS.text,
        kind: 'text',
        discordType: 0,
        label: 'general',
        parentKey: KEYS.category,
        order: 0,
        ageRestricted: false,
        overwrites: [
          { targetKey: KEYS.everyone, targetType: 'role', allow: '0', deny: '1024' },
          { targetKey: KEYS.member, targetType: 'member', allow: '1024', deny: '0' },
        ],
      },
      {
        key: KEYS.rootVoice,
        kind: 'voice',
        discordType: 2,
        label: 'Lounge',
        parentKey: null,
        order: 1,
        ageRestricted: false,
        overwrites: [],
      },
    ],
  };
}

function expectSnapshotInvalid(action: () => unknown): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(DiscordDomainError);
  expect(thrown).toMatchObject({
    name: 'DiscordDomainError',
    code: 'SNAPSHOT_INVALID',
    message: 'SNAPSHOT_INVALID',
  });
  expect(JSON.stringify(thrown)).toBe('{"code":"SNAPSHOT_INVALID","name":"DiscordDomainError"}');
}

describe('persisted guild structure snapshot', () => {
  it('parses the complete minimized contract', () => {
    expect(parseGuildStructureSnapshot(validSnapshot())).toEqual(validSnapshot());
  });

  it('strips unknown fields at every represented object layer and excludes raw Discord IDs', () => {
    const raw = validSnapshot();
    raw.rawGuildId = TEST_IDS.guild;
    raw.guild.rawOwnerId = TEST_IDS.owner;
    raw.roles[0]!.rawRoleId = TEST_IDS.botRole;
    raw.channels[0]!.topic = 'PRIVATE_TOPIC_MUST_NOT_PERSIST';
    raw.channels[0]!.rawChannelId = TEST_IDS.category;
    raw.channels[1]!.overwrites[0]!.rawTargetId = TEST_IDS.guild;

    const parsed = parseGuildStructureSnapshot(raw);

    expect(parsed).not.toHaveProperty('rawGuildId');
    expect(parsed.guild).not.toHaveProperty('rawOwnerId');
    expect(parsed.roles[0]).not.toHaveProperty('rawRoleId');
    expect(parsed.channels[0]).not.toHaveProperty('topic');
    expect(parsed.channels[0]).not.toHaveProperty('rawChannelId');
    expect(parsed.channels[1]?.overwrites[0]).not.toHaveProperty('rawTargetId');
    expect(JSON.stringify(parsed)).not.toContain(TEST_IDS.guild);
    expect(JSON.stringify(parsed)).not.toContain(TEST_IDS.owner);
    expect(JSON.stringify(parsed)).not.toContain(TEST_IDS.botRole);
    expect(JSON.stringify(parsed)).not.toContain(TEST_IDS.category);
    expect(JSON.stringify(parsed)).not.toContain('PRIVATE_TOPIC_MUST_NOT_PERSIST');
  });

  it.each([
    [
      'schema version',
      (snapshot: MutableSnapshot) => {
        snapshot.schemaVersion = 2;
      },
    ],
    [
      'identifier scheme',
      (snapshot: MutableSnapshot) => {
        snapshot.identifierScheme = 'plain-snowflake-v1';
      },
    ],
    [
      'guild key prefix',
      (snapshot: MutableSnapshot) => {
        snapshot.guild.key = `c_${'A'.repeat(43)}`;
      },
    ],
    [
      'guild key digest length',
      (snapshot: MutableSnapshot) => {
        snapshot.guild.key = `g_${'A'.repeat(42)}`;
      },
    ],
    [
      'guild key alphabet',
      (snapshot: MutableSnapshot) => {
        snapshot.guild.key = `g_${'A'.repeat(42)}+`;
      },
    ],
    [
      'owner key prefix',
      (snapshot: MutableSnapshot) => {
        snapshot.guild.ownerKey = `r_${'B'.repeat(43)}`;
      },
    ],
    [
      'everyone role key prefix',
      (snapshot: MutableSnapshot) => {
        snapshot.guild.everyoneRoleKey = `m_${'C'.repeat(43)}`;
      },
    ],
    [
      'role key prefix',
      (snapshot: MutableSnapshot) => {
        snapshot.roles[0]!.key = `g_${'C'.repeat(43)}`;
      },
    ],
    [
      'channel key prefix',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[0]!.key = `r_${'E'.repeat(43)}`;
      },
    ],
    [
      'role overwrite key prefix',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[1]!.overwrites[0]!.targetKey = KEYS.member;
      },
    ],
    [
      'member overwrite key prefix',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[1]!.overwrites[1]!.targetKey = KEYS.staff;
      },
    ],
  ] satisfies Array<[string, (snapshot: MutableSnapshot) => void]>)(
    'rejects malformed %s',
    (_name, mutate) => {
      const snapshot = validSnapshot();
      mutate(snapshot);
      expectSnapshotInvalid(() => parseGuildStructureSnapshot(snapshot));
    },
  );

  it.each([
    [
      'duplicate role keys',
      (snapshot: MutableSnapshot) => {
        snapshot.roles[1]!.key = snapshot.roles[0]!.key;
      },
    ],
    [
      'duplicate channel keys',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[1]!.key = snapshot.channels[0]!.key;
      },
    ],
    [
      'missing everyone role',
      (snapshot: MutableSnapshot) => {
        snapshot.guild.everyoneRoleKey = `r_${'Z'.repeat(43)}`;
      },
    ],
    [
      'missing role overwrite reference',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[1]!.overwrites[0]!.targetKey = `r_${'Z'.repeat(43)}`;
      },
    ],
    [
      'unknown parent',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[1]!.parentKey = `c_${'Z'.repeat(43)}`;
      },
    ],
    [
      'non-category parent',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[1]!.parentKey = KEYS.rootVoice;
      },
    ],
    [
      'category parenting',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[0]!.parentKey = KEYS.category;
      },
    ],
    [
      'duplicate root sibling order',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[2]!.order = 0;
      },
    ],
    [
      'non-contiguous root sibling order',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[2]!.order = 2;
      },
    ],
    [
      'non-zero first child order',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[1]!.order = 1;
      },
    ],
  ] satisfies Array<[string, (snapshot: MutableSnapshot) => void]>)(
    'rejects %s',
    (_name, mutate) => {
      const snapshot = validSnapshot();
      mutate(snapshot);
      expectSnapshotInvalid(() => parseGuildStructureSnapshot(snapshot));
    },
  );

  it.each([
    ['role', { allow: '2048', deny: '0' }],
    ['member', { allow: '0', deny: '2048' }],
  ] as const)(
    'rejects duplicate %s overwrites within the same channel',
    (targetType, permissions) => {
      const snapshot = validSnapshot();
      const overwrite = snapshot.channels[1]!.overwrites.find(
        (candidate) => candidate.targetType === targetType,
      )!;
      snapshot.channels[1]!.overwrites.push({ ...overwrite, ...permissions });

      expectSnapshotInvalid(() => parseGuildStructureSnapshot(snapshot));
    },
  );

  it('accepts the same overwrite target in different channels', () => {
    const snapshot = validSnapshot();
    snapshot.channels[2]!.overwrites.push({
      targetKey: KEYS.everyone,
      targetType: 'role',
      allow: '2048',
      deny: '0',
    });

    expect(parseGuildStructureSnapshot(snapshot).channels[2]?.overwrites).toEqual([
      { targetKey: KEYS.everyone, targetType: 'role', allow: '2048', deny: '0' },
    ]);
  });

  it('accepts the same overwrite digest in valid role and member target domains', () => {
    const snapshot = validSnapshot();
    const sharedDigest = 'J'.repeat(43);
    snapshot.roles.push({ key: `r_${sharedDigest}`, permissions: '0' });
    snapshot.channels[1]!.overwrites.push(
      { targetKey: `r_${sharedDigest}`, targetType: 'role', allow: '0', deny: '0' },
      { targetKey: `m_${sharedDigest}`, targetType: 'member', allow: '0', deny: '0' },
    );

    expect(parseGuildStructureSnapshot(snapshot).channels[1]?.overwrites).toContainEqual({
      targetKey: `m_${sharedDigest}`,
      targetType: 'member',
      allow: '0',
      deny: '0',
    });
  });

  it('validates sibling order numerically rather than requiring array order', () => {
    const snapshot = validSnapshot();
    snapshot.channels.reverse();
    expect(parseGuildStructureSnapshot(snapshot).channels.map(({ key }) => key)).toEqual([
      KEYS.rootVoice,
      KEYS.text,
      KEYS.category,
    ]);
  });

  it.each(['2026-08-29', '2026-08-29T00:00:00', '2026-02-30T00:00:00.000Z', 'not-a-timestamp'])(
    'rejects malformed timestamp %s',
    (generatedAt) => {
      const snapshot = validSnapshot();
      snapshot.generatedAt = generatedAt;
      expectSnapshotInvalid(() => parseGuildStructureSnapshot(snapshot));
    },
  );

  it('counts snapshot display names and labels by Unicode code point', () => {
    const snapshot = validSnapshot();
    snapshot.guild.displayName = '😀'.repeat(100);
    snapshot.channels[0]!.label = '😀'.repeat(100);
    const parsed = parseGuildStructureSnapshot(snapshot);
    expect(parsed.guild.displayName).toBe('😀'.repeat(100));
    expect(parsed.channels[0]?.label).toBe('😀'.repeat(100));
  });

  it.each([
    [
      '101-code-point guild name',
      (snapshot: MutableSnapshot) => {
        snapshot.guild.displayName = '😀'.repeat(101);
      },
    ],
    [
      'control character in guild name',
      (snapshot: MutableSnapshot) => {
        snapshot.guild.displayName = 'guild\nname';
      },
    ],
    [
      'unpaired surrogate in guild name',
      (snapshot: MutableSnapshot) => {
        snapshot.guild.displayName = '\ud800';
      },
    ],
    [
      '101-code-point channel label',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[0]!.label = '😀'.repeat(101);
      },
    ],
    [
      'control character in channel label',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[0]!.label = 'staff\troom';
      },
    ],
    [
      'unpaired surrogate in channel label',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[0]!.label = '\udc00';
      },
    ],
  ] satisfies Array<[string, (snapshot: MutableSnapshot) => void]>)(
    'rejects %s',
    (_name, mutate) => {
      const snapshot = validSnapshot();
      mutate(snapshot);
      expectSnapshotInvalid(() => parseGuildStructureSnapshot(snapshot));
    },
  );

  it.each([
    [
      'unknown channel kind',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[0]!.kind = 'thread';
      },
    ],
    [
      'negative discord type',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[0]!.discordType = -1;
      },
    ],
    [
      'fractional discord type',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[0]!.discordType = 0.5;
      },
    ],
    [
      'negative order',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[0]!.order = -1;
      },
    ],
    [
      'fractional order',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[0]!.order = 0.5;
      },
    ],
    [
      'invalid target type',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[1]!.overwrites[0]!.targetType = 'user';
      },
    ],
    [
      'leading-zero role permission',
      (snapshot: MutableSnapshot) => {
        snapshot.roles[0]!.permissions = '01024';
      },
    ],
    [
      'leading-zero overwrite allow',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[1]!.overwrites[0]!.allow = '01024';
      },
    ],
    [
      'non-boolean age restriction',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[0]!.ageRestricted = 0;
      },
    ],
    [
      'empty guild display name',
      (snapshot: MutableSnapshot) => {
        snapshot.guild.displayName = '';
      },
    ],
    [
      'empty channel label',
      (snapshot: MutableSnapshot) => {
        snapshot.channels[0]!.label = '';
      },
    ],
  ] satisfies Array<[string, (snapshot: MutableSnapshot) => void]>)(
    'rejects invalid field shape: %s',
    (_name, mutate) => {
      const snapshot = validSnapshot();
      mutate(snapshot);
      expectSnapshotInvalid(() => parseGuildStructureSnapshot(snapshot));
    },
  );

  it('accepts every persisted channel kind and member overwrites without a member table', () => {
    const kinds = [
      'category',
      'text',
      'voice',
      'announcement',
      'stage',
      'forum',
      'media',
      'unsupported',
    ];
    for (const kind of kinds) {
      const snapshot = validSnapshot();
      snapshot.channels[2]!.kind = kind;
      expect(parseGuildStructureSnapshot(snapshot).channels[2]?.kind).toBe(kind);
    }
    expect(parseGuildStructureSnapshot(validSnapshot()).channels[1]?.overwrites[1]).toEqual({
      targetKey: KEYS.member,
      targetType: 'member',
      allow: '1024',
      deny: '0',
    });
  });
});
