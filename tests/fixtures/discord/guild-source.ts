import {
  parseDiscordBot,
  parseDiscordBotMember,
  parseDiscordChannels,
  parseDiscordGuild,
  validateDiscordSourceBundle,
} from '../../../src/domain/discord/source-schema';
import type { DiscordSourceBundle } from '../../../src/domain/discord/source';

export const TEST_IDS = {
  guild: '100000000000000001',
  botRole: '100000000000000002',
  staffRole: '100000000000000003',
  bot: '200000000000000001',
  owner: '300000000000000001',
  memberWithOverwrite: '300000000000000002',
  category: '400000000000000001',
  publicText: '400000000000000002',
  botPrivateText: '400000000000000003',
  hiddenText: '400000000000000004',
  ageRestrictedText: '400000000000000005',
  unsyncedCategory: '400000000000000006',
  unsyncedVisibleChild: '400000000000000007',
  unsupportedChannel: '400000000000000008',
  thread: '400000000000000009',
  emptyCategory: '400000000000000010',
  lastMessage: '499999999999999999',
} as const;

export interface RawDiscordResponses {
  bot: unknown;
  guild: unknown;
  botMember: unknown;
  channels: unknown;
}

export function createRawDiscordResponses(): RawDiscordResponses {
  return structuredClone({
    bot: { id: TEST_IDS.bot, username: 'Dmap test bot' },
    guild: {
      id: TEST_IDS.guild,
      name: 'Invented Test Guild',
      owner_id: TEST_IDS.owner,
      description: 'PRIVATE_DESCRIPTION_MUST_NOT_PERSIST',
      roles: [
        { id: TEST_IDS.guild, name: '@everyone', permissions: '1024' },
        { id: TEST_IDS.botRole, name: 'Dmap', permissions: '0' },
        { id: TEST_IDS.staffRole, name: 'Staff', permissions: '0' },
      ],
    },
    botMember: {
      roles: [TEST_IDS.botRole],
      nick: 'PRIVATE_NICK_MUST_NOT_PERSIST',
      user: { id: TEST_IDS.bot },
    },
    channels: [
      channel(TEST_IDS.category, 4, 0, 'Public', null),
      {
        ...channel(TEST_IDS.publicText, 0, 0, 'general', TEST_IDS.category),
        topic: 'PRIVATE_TOPIC_MUST_NOT_PERSIST',
        last_message_id: TEST_IDS.lastMessage,
      },
      channel(TEST_IDS.botPrivateText, 0, 1, 'bot-private', TEST_IDS.category, false, [
        overwrite(TEST_IDS.guild, 0, '0', '1024'),
        overwrite(TEST_IDS.botRole, 0, '1024', '0'),
        overwrite(TEST_IDS.memberWithOverwrite, 1, '1024', '0'),
      ]),
      channel(TEST_IDS.hiddenText, 0, 2, 'hidden', TEST_IDS.category, false, [
        overwrite(TEST_IDS.guild, 0, '0', '1024'),
      ]),
      channel(TEST_IDS.ageRestrictedText, 0, 3, 'age-restricted', TEST_IDS.category, true),
      channel(TEST_IDS.unsyncedCategory, 4, 1, 'Denied category', null, false, [
        overwrite(TEST_IDS.guild, 0, '0', '1024'),
      ]),
      channel(
        TEST_IDS.unsyncedVisibleChild,
        0,
        0,
        'visible-child',
        TEST_IDS.unsyncedCategory,
        false,
        [overwrite(TEST_IDS.guild, 0, '0', '1024'), overwrite(TEST_IDS.botRole, 0, '1024', '0')],
      ),
      channel(TEST_IDS.unsupportedChannel, 14, 4, 'unsupported', null),
      channel(TEST_IDS.thread, 11, 5, 'thread', null),
      channel(TEST_IDS.emptyCategory, 4, 2, 'Empty', null),
    ],
  });
}

export function createValidatedDiscordSourceFixture(): DiscordSourceBundle {
  const raw = createRawDiscordResponses();
  return validateDiscordSourceBundle(
    {
      bot: parseDiscordBot(raw.bot),
      guild: parseDiscordGuild(raw.guild),
      botMember: parseDiscordBotMember(raw.botMember),
      channels: parseDiscordChannels(raw.channels),
    },
    TEST_IDS.guild,
  );
}

function overwrite(id: string, type: 0 | 1, allow: string, deny: string) {
  return { id, type, allow, deny, marker: 'DISCARD_OVERWRITE_MARKER' };
}

function channel(
  id: string,
  type: number,
  position: number,
  name: string,
  parentId: string | null,
  nsfw = false,
  permissionOverwrites: unknown[] = [],
) {
  return {
    id,
    type,
    position,
    name,
    parent_id: parentId,
    nsfw,
    permission_overwrites: permissionOverwrites,
  };
}
