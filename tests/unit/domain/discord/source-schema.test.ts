import { describe, expect, it } from 'vitest';

import { DiscordDomainError } from '../../../../src/domain/discord/errors';
import {
  countCodePoints,
  parseDiscordBot,
  parseDiscordBotMember,
  parseDiscordChannels,
  parseDiscordGuild,
  validateDiscordSourceBundle,
} from '../../../../src/domain/discord/source-schema';
import type { DiscordSourceBundle } from '../../../../src/domain/discord/source';
import {
  createRawDiscordResponses,
  createValidatedDiscordSourceFixture,
  TEST_IDS,
} from '../../../fixtures/discord/guild-source';

const rawTextChannel = {
  id: TEST_IDS.publicText,
  type: 0,
  position: 0,
  name: 'general',
  parent_id: null,
  nsfw: false,
  permission_overwrites: [],
};

function expectSourceInvalid(action: () => unknown): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(DiscordDomainError);
  expect(thrown).toMatchObject({
    name: 'DiscordDomainError',
    code: 'DISCORD_SOURCE_INVALID',
    message: 'DISCORD_SOURCE_INVALID',
  });
  expect(JSON.stringify(thrown)).toBe(
    '{"code":"DISCORD_SOURCE_INVALID","name":"DiscordDomainError"}',
  );
}

function withBundle(change: (bundle: DiscordSourceBundle) => void): DiscordSourceBundle {
  const bundle = createValidatedDiscordSourceFixture();
  change(bundle);
  return bundle;
}

describe('Discord upstream source schemas', () => {
  it('parses the invented fixture and strips every represented layer', () => {
    const raw = createRawDiscordResponses();
    const bot = parseDiscordBot(raw.bot);
    const guild = parseDiscordGuild(raw.guild);
    const member = parseDiscordBotMember(raw.botMember);
    const channels = parseDiscordChannels(raw.channels);

    expect(bot).toEqual({ id: TEST_IDS.bot });
    expect(guild).toEqual({
      id: TEST_IDS.guild,
      name: 'Invented Test Guild',
      ownerId: TEST_IDS.owner,
      roles: [
        { id: TEST_IDS.guild, permissions: '1024' },
        { id: TEST_IDS.botRole, permissions: '0' },
        { id: TEST_IDS.staffRole, permissions: '0' },
      ],
    });
    expect(member).toEqual({ roleIds: [TEST_IDS.botRole] });
    expect(channels[1]).toEqual({
      id: TEST_IDS.publicText,
      type: 0,
      position: 0,
      name: 'general',
      parentId: TEST_IDS.category,
      nsfw: false,
      overwrites: [],
    });
    expect(channels[2]?.overwrites[0]).toEqual({
      id: TEST_IDS.guild,
      type: 0,
      allow: '0',
      deny: '1024',
    });
    const serialized = JSON.stringify({ bot, guild, member, channels });
    expect(serialized).not.toContain('PRIVATE_');
    expect(serialized).not.toContain(TEST_IDS.lastMessage);
    expect(serialized).not.toContain('DISCARD_OVERWRITE_MARKER');
  });

  it('returns fresh raw and validated fixtures', () => {
    const firstRaw = createRawDiscordResponses();
    const secondRaw = createRawDiscordResponses();
    expect(firstRaw).not.toBe(secondRaw);
    const first = createValidatedDiscordSourceFixture();
    first.channels[0]!.name = 'mutated';
    expect(createValidatedDiscordSourceFixture().channels[0]!.name).toBe('Public');
  });

  it('defaults absent channel parent, nsfw, and overwrites', () => {
    const { parent_id, nsfw, permission_overwrites, ...minimal } = rawTextChannel;
    expect(parent_id).toBeNull();
    expect(nsfw).toBe(false);
    expect(permission_overwrites).toEqual([]);
    expect(parseDiscordChannels([minimal])).toEqual([
      {
        id: TEST_IDS.publicText,
        type: 0,
        position: 0,
        name: 'general',
        parentId: null,
        nsfw: false,
        overwrites: [],
      },
    ]);
  });

  it.each<[string, () => unknown]>([
    ['leading-zero snowflake', () => parseDiscordBot({ id: '01' })],
    ['zero snowflake', () => parseDiscordBot({ id: '0' })],
    ['snowflake above uint64', () => parseDiscordBot({ id: '18446744073709551616' })],
    ['missing channel name', () => parseDiscordChannels([{ ...rawTextChannel, name: undefined }])],
    [
      'control character in label',
      () => parseDiscordChannels([{ ...rawTextChannel, name: 'staff\nroom' }]),
    ],
    ['negative position', () => parseDiscordChannels([{ ...rawTextChannel, position: -1 }])],
    ['fractional position', () => parseDiscordChannels([{ ...rawTextChannel, position: 0.5 }])],
    ['DM channel type', () => parseDiscordChannels([{ ...rawTextChannel, type: 1 }])],
    ['group DM channel type', () => parseDiscordChannels([{ ...rawTextChannel, type: 3 }])],
    ['negative channel type', () => parseDiscordChannels([{ ...rawTextChannel, type: -1 }])],
    ['fractional channel type', () => parseDiscordChannels([{ ...rawTextChannel, type: 0.5 }])],
    [
      'permission with leading zero',
      () =>
        parseDiscordChannels([
          {
            ...rawTextChannel,
            permission_overwrites: [{ id: TEST_IDS.botRole, type: 0, allow: '01024', deny: '0' }],
          },
        ]),
    ],
    [
      'permission over 128 digits',
      () =>
        parseDiscordGuild({
          id: TEST_IDS.guild,
          name: 'Guild',
          owner_id: TEST_IDS.owner,
          roles: [{ id: TEST_IDS.guild, permissions: '1'.repeat(129) }],
        }),
    ],
    [
      'empty permission string',
      () =>
        parseDiscordGuild({
          id: TEST_IDS.guild,
          name: 'Guild',
          owner_id: TEST_IDS.owner,
          roles: [{ id: TEST_IDS.guild, permissions: '' }],
        }),
    ],
    [
      'negative permission string',
      () =>
        parseDiscordGuild({
          id: TEST_IDS.guild,
          name: 'Guild',
          owner_id: TEST_IDS.owner,
          roles: [{ id: TEST_IDS.guild, permissions: '-1' }],
        }),
    ],
    [
      'non-decimal permission string',
      () =>
        parseDiscordGuild({
          id: TEST_IDS.guild,
          name: 'Guild',
          owner_id: TEST_IDS.owner,
          roles: [{ id: TEST_IDS.guild, permissions: '1e3' }],
        }),
    ],
    [
      'invalid overwrite type',
      () =>
        parseDiscordChannels([
          {
            ...rawTextChannel,
            permission_overwrites: [{ id: TEST_IDS.botRole, type: 2, allow: '0', deny: '0' }],
          },
        ]),
    ],
  ])('rejects %s', (_name, parse) => {
    expectSourceInvalid(parse);
  });

  it.each([
    ['empty', ''],
    ['101 code points', 'x'.repeat(101)],
    ['NUL control', '\u0000'],
    ['DEL control', '\u007f'],
    ['unpaired high surrogate', '\ud800'],
    ['unpaired low surrogate', '\udc00'],
  ])('rejects channel names with %s', (_case, name) => {
    expectSourceInvalid(() => parseDiscordChannels([{ ...rawTextChannel, name }]));
  });

  it('counts Unicode code points rather than UTF-16 code units', () => {
    const oneHundredEmoji = '😀'.repeat(100);
    expect(countCodePoints(oneHundredEmoji)).toBe(100);
    expect(parseDiscordChannels([{ ...rawTextChannel, name: oneHundredEmoji }])[0]?.name).toBe(
      oneHundredEmoji,
    );
    expectSourceInvalid(() =>
      parseDiscordChannels([{ ...rawTextChannel, name: `${oneHundredEmoji}😀` }]),
    );
  });

  it.each([
    ['guild empty name', ''],
    ['guild control name', 'guild\tname'],
    ['guild unpaired surrogate', '\ud800'],
    ['guild 101 code-point name', 'g'.repeat(101)],
  ])('rejects %s', (_case, name) => {
    const raw = createRawDiscordResponses();
    expectSourceInvalid(() => parseDiscordGuild({ ...(raw.guild as object), name }));
  });

  it('accepts canonical permissions through 128 digits and all server channel kinds', () => {
    const channels = [0, 2, 4, 5, 10, 11, 12, 13, 14, 15, 16].map((type) => ({
      ...rawTextChannel,
      type,
      permission_overwrites: [{ id: TEST_IDS.botRole, type: 0, allow: '0', deny: '9'.repeat(128) }],
    }));
    expect(parseDiscordChannels(channels).map(({ type }) => type)).toEqual([
      0, 2, 4, 5, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });

  it.each([
    [
      'guild roles',
      () => {
        const raw = createRawDiscordResponses();
        const guild = raw.guild as { roles: unknown[] };
        guild.roles = Array.from({ length: 1_001 }, () => ({
          id: TEST_IDS.botRole,
          permissions: '0',
        }));
        return parseDiscordGuild(guild);
      },
    ],
    [
      'bot member roles',
      () =>
        parseDiscordBotMember({
          roles: Array.from({ length: 1_001 }, () => TEST_IDS.botRole),
        }),
    ],
    [
      'channels',
      () =>
        parseDiscordChannels(
          Array.from({ length: 1_001 }, () => ({
            ...rawTextChannel,
          })),
        ),
    ],
    [
      'channel overwrites',
      () =>
        parseDiscordChannels([
          {
            ...rawTextChannel,
            permission_overwrites: Array.from({ length: 1_001 }, () => ({
              id: TEST_IDS.memberWithOverwrite,
              type: 1,
              allow: '0',
              deny: '0',
            })),
          },
        ]),
    ],
  ] satisfies Array<[string, () => unknown]>)(
    'enforces the 1,000-item %s limit',
    (_name, action) => {
      expectSourceInvalid(action);
    },
  );

  it('accepts exactly 1,000 items at each array boundary', () => {
    expect(
      parseDiscordBotMember({
        roles: Array.from({ length: 1_000 }, () => TEST_IDS.botRole),
      }).roleIds,
    ).toHaveLength(1_000);
    expect(
      parseDiscordGuild({
        id: TEST_IDS.guild,
        name: 'Guild',
        owner_id: TEST_IDS.owner,
        roles: Array.from({ length: 1_000 }, () => ({
          id: TEST_IDS.botRole,
          permissions: '0',
        })),
      }).roles,
    ).toHaveLength(1_000);
    expect(
      parseDiscordChannels(Array.from({ length: 1_000 }, () => ({ ...rawTextChannel }))),
    ).toHaveLength(1_000);
    expect(
      parseDiscordChannels([
        {
          ...rawTextChannel,
          permission_overwrites: Array.from({ length: 1_000 }, () => ({
            id: TEST_IDS.memberWithOverwrite,
            type: 1,
            allow: '0',
            deny: '0',
          })),
        },
      ])[0]?.overwrites,
    ).toHaveLength(1_000);
  });
});

describe('Discord source bundle relationships', () => {
  it('accepts the complete invented fixture and the configured guild ID', () => {
    const bundle = createValidatedDiscordSourceFixture();
    expect(validateDiscordSourceBundle(bundle, TEST_IDS.guild)).toEqual(bundle);
  });

  it.each([
    [
      'configured guild mismatch',
      (bundle: DiscordSourceBundle) => {
        bundle.guild.id = TEST_IDS.owner;
      },
    ],
    [
      'duplicate guild roles',
      (bundle: DiscordSourceBundle) => {
        bundle.guild.roles.push({ ...bundle.guild.roles[0]! });
      },
    ],
    [
      'missing everyone role',
      (bundle: DiscordSourceBundle) => {
        bundle.guild.roles = bundle.guild.roles.filter(({ id }) => id !== TEST_IDS.guild);
      },
    ],
    [
      'duplicate everyone role',
      (bundle: DiscordSourceBundle) => {
        bundle.guild.roles.push({ id: TEST_IDS.guild, permissions: '0' });
      },
    ],
    [
      'duplicate bot role IDs',
      (bundle: DiscordSourceBundle) => {
        bundle.botMember.roleIds.push(TEST_IDS.botRole);
      },
    ],
    [
      'missing bot role references',
      (bundle: DiscordSourceBundle) => {
        bundle.botMember.roleIds.push(TEST_IDS.owner);
      },
    ],
    [
      'duplicate channel IDs',
      (bundle: DiscordSourceBundle) => {
        bundle.channels.push({ ...bundle.channels[0]! });
      },
    ],
    [
      'category with a parent',
      (bundle: DiscordSourceBundle) => {
        bundle.channels.find(({ id }) => id === TEST_IDS.category)!.parentId =
          TEST_IDS.emptyCategory;
      },
    ],
    [
      'missing channel parent',
      (bundle: DiscordSourceBundle) => {
        bundle.channels.find(({ id }) => id === TEST_IDS.publicText)!.parentId = TEST_IDS.owner;
      },
    ],
    [
      'non-category channel parent',
      (bundle: DiscordSourceBundle) => {
        bundle.channels.find(({ id }) => id === TEST_IDS.publicText)!.parentId =
          TEST_IDS.hiddenText;
      },
    ],
    [
      'self-parenting channel',
      (bundle: DiscordSourceBundle) => {
        bundle.channels.find(({ id }) => id === TEST_IDS.publicText)!.parentId =
          TEST_IDS.publicText;
      },
    ],
    [
      'parent cycle',
      (bundle: DiscordSourceBundle) => {
        const category = bundle.channels.find(({ id }) => id === TEST_IDS.category)!;
        const empty = bundle.channels.find(({ id }) => id === TEST_IDS.emptyCategory)!;
        category.parentId = empty.id;
        empty.parentId = category.id;
      },
    ],
    [
      'missing role overwrite reference',
      (bundle: DiscordSourceBundle) => {
        bundle.channels[0]!.overwrites.push({
          id: TEST_IDS.owner,
          type: 0,
          allow: '0',
          deny: '0',
        });
      },
    ],
    [
      'duplicate role overwrite pair',
      (bundle: DiscordSourceBundle) => {
        bundle.channels[0]!.overwrites.push(
          { id: TEST_IDS.botRole, type: 0, allow: '0', deny: '0' },
          { id: TEST_IDS.botRole, type: 0, allow: '1024', deny: '0' },
        );
      },
    ],
    [
      'duplicate member overwrite pair',
      (bundle: DiscordSourceBundle) => {
        bundle.channels[0]!.overwrites.push(
          { id: TEST_IDS.memberWithOverwrite, type: 1, allow: '0', deny: '0' },
          { id: TEST_IDS.memberWithOverwrite, type: 1, allow: '1024', deny: '0' },
        );
      },
    ],
  ] satisfies Array<[string, (bundle: DiscordSourceBundle) => void]>)(
    'rejects %s',
    (_name, mutate) => {
      const bundle = createValidatedDiscordSourceFixture();
      expectSourceInvalid(() => {
        mutate(bundle);
        return validateDiscordSourceBundle(bundle, TEST_IDS.guild);
      });
    },
  );

  it('accepts the same overwrite ID once for each target type', () => {
    const bundle = withBundle((value) => {
      value.channels[0]!.overwrites = [
        { id: TEST_IDS.botRole, type: 0, allow: '0', deny: '0' },
        { id: TEST_IDS.botRole, type: 1, allow: '0', deny: '0' },
      ];
    });
    expect(
      validateDiscordSourceBundle(bundle, TEST_IDS.guild).channels[0]?.overwrites,
    ).toHaveLength(2);
  });
});
