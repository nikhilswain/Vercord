import { describe, expect, it } from 'vitest';

import { ADMINISTRATOR, CONNECT, VIEW_CHANNEL } from '../../../../src/domain/discord/constants';
import {
  computeBasePermissions,
  computeChannelPermissions,
  computeSnapshotMemberChannelPermissions,
  selectBotVisibleChannels,
} from '../../../../src/domain/discord/permissions';
import type { GuildStructureSnapshot } from '../../../../src/domain/discord/snapshot';
import type {
  DiscordChannelSource,
  DiscordSourceBundle,
} from '../../../../src/domain/discord/source';
import {
  createValidatedDiscordSourceFixture,
  TEST_IDS,
} from '../../../fixtures/discord/guild-source';

function channelById(bundle: DiscordSourceBundle, id: string): DiscordChannelSource {
  const channel = bundle.channels.find((candidate) => candidate.id === id);
  if (channel === undefined) throw new Error('TEST_FIXTURE_CHANNEL_MISSING');
  return channel;
}

function roleById(bundle: DiscordSourceBundle, id: string) {
  const role = bundle.guild.roles.find((candidate) => candidate.id === id);
  if (role === undefined) throw new Error('TEST_FIXTURE_ROLE_MISSING');
  return role;
}

describe('Discord bot permissions', () => {
  it('finds @everyone by guild ID instead of treating the first role as everyone', () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    roleById(bundle, TEST_IDS.staffRole).permissions = '32';
    bundle.guild.roles = [
      roleById(bundle, TEST_IDS.staffRole),
      roleById(bundle, TEST_IDS.guild),
      roleById(bundle, TEST_IDS.botRole),
    ];

    const permissions = computeBasePermissions(bundle);

    expect(permissions).toBe(VIEW_CHANNEL);
    expect(permissions & 32n).toBe(0n);
  });

  it('ORs every assigned role into the base permissions', () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    roleById(bundle, TEST_IDS.guild).permissions = '0';
    roleById(bundle, TEST_IDS.botRole).permissions = '1024';
    roleById(bundle, TEST_IDS.staffRole).permissions = '32';
    bundle.botMember.roleIds.push(TEST_IDS.staffRole);

    expect(computeBasePermissions(bundle)).toBe(VIEW_CHANNEL | 32n);
  });

  it('gives the guild owner the pure-computation bypass', () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    bundle.guild.ownerId = TEST_IDS.bot;
    roleById(bundle, TEST_IDS.guild).permissions = '0';

    expect(computeBasePermissions(bundle)).toBe(~0n);
  });

  it('gives ADMINISTRATOR the pure base-permission bypass', () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    roleById(bundle, TEST_IDS.botRole).permissions = ADMINISTRATOR.toString();

    expect(computeBasePermissions(bundle)).toBe(~0n);
  });

  it('gives an ADMINISTRATOR base the pure channel-permission bypass', () => {
    const bundle = createValidatedDiscordSourceFixture();

    expect(
      computeChannelPermissions(ADMINISTRATOR, bundle, channelById(bundle, TEST_IDS.hiddenText)),
    ).toBe(~0n);
  });

  it('applies a bot-role allow after the everyone deny', () => {
    const bundle = createValidatedDiscordSourceFixture();
    const permissions = computeChannelPermissions(
      computeBasePermissions(bundle),
      bundle,
      channelById(bundle, TEST_IDS.botPrivateText),
    );

    expect((permissions & VIEW_CHANNEL) === VIEW_CHANNEL).toBe(true);
  });

  it('lets a combined role allow win a combined role deny', () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    bundle.botMember.roleIds.push(TEST_IDS.staffRole);
    const channel = channelById(bundle, TEST_IDS.botPrivateText);
    channel.overwrites = [
      { id: TEST_IDS.guild, type: 0, allow: '0', deny: '1024' },
      { id: TEST_IDS.staffRole, type: 0, allow: '1024', deny: '0' },
      { id: TEST_IDS.botRole, type: 0, allow: '0', deny: '1024' },
    ];

    const permissions = computeChannelPermissions(computeBasePermissions(bundle), bundle, channel);

    expect(permissions & VIEW_CHANNEL).toBe(VIEW_CHANNEL);
  });

  it('lets the bot member overwrite run after role overwrites', () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    const channel = channelById(bundle, TEST_IDS.botPrivateText);
    channel.overwrites = [
      { id: TEST_IDS.guild, type: 0, allow: '0', deny: '1024' },
      { id: TEST_IDS.bot, type: 1, allow: '0', deny: '1024' },
      { id: TEST_IDS.botRole, type: 0, allow: '1024', deny: '0' },
    ];

    const permissions = computeChannelPermissions(computeBasePermissions(bundle), bundle, channel);

    expect(permissions & VIEW_CHANNEL).toBe(0n);
  });

  it('ignores an unrelated member overwrite when evaluating bot visibility', () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    const channel = channelById(bundle, TEST_IDS.botPrivateText);
    channel.overwrites = channel.overwrites.filter(({ id }) => id !== TEST_IDS.botRole);

    const permissions = computeChannelPermissions(computeBasePermissions(bundle), bundle, channel);

    expect(channel.overwrites).toContainEqual({
      id: TEST_IDS.memberWithOverwrite,
      type: 1,
      allow: '1024',
      deny: '0',
    });
    expect(permissions & VIEW_CHANNEL).toBe(0n);
  });

  it('selects only channels with VIEW_CHANNEL and excludes every thread type', () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    channelById(bundle, TEST_IDS.thread).type = 10;
    const secondThread = structuredClone(channelById(bundle, TEST_IDS.thread));
    secondThread.id = TEST_IDS.lastMessage;
    secondThread.type = 12;
    bundle.channels.push(secondThread);

    const selectedIds = selectBotVisibleChannels(bundle).map(({ id }) => id);

    expect(selectedIds).toContain(TEST_IDS.publicText);
    expect(selectedIds).not.toContain(TEST_IDS.hiddenText);
    expect(selectedIds).not.toContain(TEST_IDS.thread);
    expect(selectedIds).not.toContain(TEST_IDS.lastMessage);
  });
});

describe('snapshot member channel permissions', () => {
  it('applies everyone, combined role, then member overwrites for VIEW_CHANNEL and CONNECT', () => {
    const digest = 'A'.repeat(43);
    const everyoneKey = `r_${digest}`;
    const allowedKey = `r_${'B'.repeat(43)}`;
    const deniedKey = `r_${'C'.repeat(43)}`;
    const memberKey = `m_${digest}`;
    const channel = {
      key: `c_${digest}`,
      kind: 'voice' as const,
      discordType: 2,
      label: 'Voice',
      parentKey: null,
      order: 0,
      ageRestricted: false,
      overwrites: [
        {
          targetKey: everyoneKey,
          targetType: 'role' as const,
          allow: '0',
          deny: CONNECT.toString(),
        },
        {
          targetKey: deniedKey,
          targetType: 'role' as const,
          allow: '0',
          deny: VIEW_CHANNEL.toString(),
        },
        {
          targetKey: allowedKey,
          targetType: 'role' as const,
          allow: (VIEW_CHANNEL | CONNECT).toString(),
          deny: '0',
        },
        {
          targetKey: memberKey,
          targetType: 'member' as const,
          allow: '0',
          deny: CONNECT.toString(),
        },
      ],
    };
    const snapshot = {
      guild: { everyoneRoleKey: everyoneKey },
      roles: [
        { key: everyoneKey, permissions: (VIEW_CHANNEL | CONNECT).toString() },
        { key: allowedKey, permissions: '0' },
        { key: deniedKey, permissions: '0' },
      ],
    } as GuildStructureSnapshot;

    const permissions = computeSnapshotMemberChannelPermissions(snapshot, channel, {
      memberKey,
      memberRoleKeys: new Set([allowedKey, deniedKey]),
      isOwner: false,
    });

    expect(permissions & VIEW_CHANNEL).toBe(VIEW_CHANNEL);
    expect(permissions & CONNECT).toBe(0n);
  });
});
