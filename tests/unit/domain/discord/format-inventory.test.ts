import { describe, expect, it } from 'vitest';

import {
  escapeTerminalLabel,
  formatBotVisibleInventory,
} from '../../../../scripts/discord/format-inventory';
import { validateDiscordSourceBundle } from '../../../../src/domain/discord/source-schema';
import type { DiscordSourceBundle } from '../../../../src/domain/discord/source';

const IDS = {
  guild: '100000000000000001',
  bot: '100000000000000002',
  owner: '100000000000000003',
  botRole: '100000000000000004',
  category: '200000000000000001',
  text: '300000000000000001',
  voice: '300000000000000002',
  announcement: '300000000000000003',
  stage: '300000000000000004',
  forum: '300000000000000005',
  media: '300000000000000006',
  unsupported: '300000000000000007',
  hidden: '300000000000000008',
  thread: '300000000000000009',
  overwriteTarget: '300000000000000010',
} as const;

const TOKEN_SHAPED_VALUE = 'test.bot.token.never.real.000000000000000000000000000000';

function createBundle(): DiscordSourceBundle {
  const bundle: DiscordSourceBundle = {
    bot: { id: IDS.bot },
    guild: {
      id: IDS.guild,
      name: 'Invented Guild',
      ownerId: IDS.owner,
      roles: [
        { id: IDS.guild, permissions: '1024' },
        { id: IDS.botRole, permissions: '0' },
      ],
    },
    botMember: { roleIds: [IDS.botRole] },
    channels: [
      channel(IDS.unsupported, 14, 2, 'future-room', null),
      channel(IDS.media, 16, 1, 'media-room', null),
      channel(IDS.category, 4, 0, 'Operations', null),
      channel(IDS.voice, 2, 0, 'voice-room', IDS.category),
      channel(IDS.text, 0, 0, 'text-room', IDS.category),
      channel(IDS.announcement, 5, 1, 'news-room', IDS.category),
      channel(IDS.stage, 13, 2, 'stage-room', IDS.category),
      channel(IDS.forum, 15, 3, 'forum-room', IDS.category, true),
      channel(IDS.hidden, 0, 4, 'hidden-room', IDS.category, false, [
        { id: IDS.guild, type: 0, allow: '0', deny: '1024' },
        {
          id: IDS.overwriteTarget,
          type: 1,
          allow: '0',
          deny: '98765432109876543210',
        },
      ]),
      channel(IDS.thread, 11, 5, 'thread-room', IDS.category),
    ],
  };
  return validateDiscordSourceBundle(bundle, IDS.guild);
}

function channel(
  id: string,
  type: number,
  position: number,
  name: string,
  parentId: string | null,
  nsfw = false,
  overwrites: DiscordSourceBundle['channels'][number]['overwrites'] = [],
): DiscordSourceBundle['channels'][number] {
  return { id, type, position, name, parentId, nsfw, overwrites };
}

describe('escapeTerminalLabel', () => {
  it('escapes every required control and bidirectional code point as visible uppercase notation', () => {
    const codePoints = [
      ...range(0x0000, 0x001f),
      ...range(0x007f, 0x009f),
      0x200e,
      0x200f,
      ...range(0x202a, 0x202e),
      ...range(0x2066, 0x2069),
    ];

    for (const codePoint of codePoints) {
      expect(escapeTerminalLabel(`before${String.fromCodePoint(codePoint)}after`)).toBe(
        `before\\u{${codePoint.toString(16).toUpperCase().padStart(4, '0')}}after`,
      );
    }
  });
});

describe('formatBotVisibleInventory', () => {
  it('prints a deterministic fixed-ASCII inventory with kinds, counts, and Uncategorized', () => {
    expect(formatBotVisibleInventory(createBundle())).toBe(
      [
        'Discord bot-visible inventory',
        'Guild: Invented Guild',
        'Counts: categories=1 channels=7 unsupported=1 age-restricted=1',
        'Tree:',
        '|- [category] Operations',
        '|  |- [text] text-room',
        '|  |- [voice] voice-room',
        '|  |- [announcement] news-room',
        '|  |- [stage] stage-room',
        '|  `- [forum, age-restricted] forum-room',
        '`- Uncategorized',
        '   |- [media] media-room',
        '   `- [unsupported] future-room',
        'Warning: omitted private channels are unknowable to the bot; this output can contain private names.',
      ].join('\n'),
    );
  });

  it('escapes the guild, category, categorized-channel, and parentless-channel label boundaries', () => {
    const bundle = createBundle();
    bundle.guild.name = 'Guild\u001B[31m';
    bundle.channels.find(({ id }) => id === IDS.category)!.name = 'Category\u202Etxt';
    bundle.channels.find(({ id }) => id === IDS.text)!.name = 'Child\u0085next';
    bundle.channels.find(({ id }) => id === IDS.media)!.name = 'Loose\u2066name';

    const output = formatBotVisibleInventory(bundle);

    expect(output).toContain('Guild: Guild\\u{001B}[31m');
    expect(output).toContain('[category] Category\\u{202E}txt');
    expect(output).toContain('[text] Child\\u{0085}next');
    expect(output).toContain('[media] Loose\\u{2066}name');
    for (const codePoint of [
      ...range(0x0000, 0x0009),
      ...range(0x000b, 0x001f),
      ...range(0x007f, 0x009f),
      0x200e,
      0x200f,
      ...range(0x202a, 0x202e),
      ...range(0x2066, 0x2069),
    ]) {
      expect(output).not.toContain(String.fromCodePoint(codePoint));
    }
  });

  it('does not disclose source-only identifiers, permissions, overwrites, topics, tokens, or JSON', () => {
    const bundle = createBundle();
    const sourceWithDiscardedFields = bundle as DiscordSourceBundle & {
      topic: string;
      rawJson: string;
      token: string;
    };
    const visibleChannel = bundle.channels.find(({ id }) => id === IDS.text) as
      (DiscordSourceBundle['channels'][number] & { topic?: string; token?: string }) | undefined;
    if (visibleChannel === undefined) throw new Error('TEST_FIXTURE_CHANNEL_MISSING');
    visibleChannel.topic = 'PRIVATE_TOPIC_MUST_NOT_PRINT';
    visibleChannel.token = TOKEN_SHAPED_VALUE;
    sourceWithDiscardedFields.topic = 'PRIVATE_TOPIC_MUST_NOT_PRINT';
    sourceWithDiscardedFields.rawJson = '{"private":"RAW_JSON_MUST_NOT_PRINT"}';
    sourceWithDiscardedFields.token = TOKEN_SHAPED_VALUE;

    const output = formatBotVisibleInventory(sourceWithDiscardedFields);

    for (const rawId of Object.values(IDS)) expect(output).not.toContain(rawId);
    expect(output).not.toContain('1024');
    expect(output).not.toContain('98765432109876543210');
    expect(output).not.toContain(TOKEN_SHAPED_VALUE);
    expect(output).not.toContain('PRIVATE_TOPIC_MUST_NOT_PRINT');
    expect(output).not.toContain('RAW_JSON_MUST_NOT_PRINT');
    expect(output).not.toContain('overwrites');
    expect(output).not.toContain('{"');
    expect(output).not.toContain(String.fromCodePoint(0x001b));
  });
});

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
