import { describe, expect, it } from 'vitest';

import { ADMINISTRATOR, VIEW_CHANNEL } from '../../../../src/domain/discord/constants';
import { DiscordDomainError } from '../../../../src/domain/discord/errors';
import {
  assertBotLeastPrivilege,
  computeBasePermissions,
  computeChannelPermissions,
  selectBotVisibleChannels,
} from '../../../../src/domain/discord/permissions';
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
  it('finds @everyone by the guild ID before ORing every assigned role', () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    roleById(bundle, TEST_IDS.guild).permissions = '0';
    roleById(bundle, TEST_IDS.botRole).permissions = '1024';
    roleById(bundle, TEST_IDS.staffRole).permissions = '32';
    bundle.botMember.roleIds.push(TEST_IDS.staffRole);
    bundle.guild.roles.reverse();

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
      { id: TEST_IDS.botRole, type: 0, allow: '0', deny: '1024' },
      { id: TEST_IDS.staffRole, type: 0, allow: '1024', deny: '0' },
    ];

    const permissions = computeChannelPermissions(computeBasePermissions(bundle), bundle, channel);

    expect(permissions & VIEW_CHANNEL).toBe(VIEW_CHANNEL);
  });

  it('lets the bot member overwrite run after role overwrites', () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    const channel = channelById(bundle, TEST_IDS.botPrivateText);
    channel.overwrites.push({
      id: TEST_IDS.bot,
      type: 1,
      allow: '0',
      deny: '1024',
    });

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

  it('rejects excessive bot permission with the exact value-free error', () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    roleById(bundle, TEST_IDS.botRole).permissions = ADMINISTRATOR.toString();

    let thrown: unknown;
    try {
      assertBotLeastPrivilege(bundle);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DiscordDomainError);
    expect(thrown).toMatchObject({
      name: 'DiscordDomainError',
      code: 'EXCESSIVE_BOT_PERMISSION',
      message: 'EXCESSIVE_BOT_PERMISSION',
    });
    expect(JSON.stringify(thrown)).toBe(
      '{"code":"EXCESSIVE_BOT_PERMISSION","name":"DiscordDomainError"}',
    );
  });

  it('accepts a least-privilege bot without throwing', () => {
    expect(() => assertBotLeastPrivilege(createValidatedDiscordSourceFixture())).not.toThrow();
  });
});
