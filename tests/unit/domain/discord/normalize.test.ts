import { describe, expect, it } from 'vitest';

import { ADMINISTRATOR } from '../../../../src/domain/discord/constants';
import { createIdentifierFactory } from '../../../../src/domain/discord/identifiers';
import {
  normalizeGuildStructure,
  type NormalizeOptions,
} from '../../../../src/domain/discord/normalize';
import type { IdentifierFactory } from '../../../../src/domain/discord/identifiers';
import { validateDiscordSourceBundle } from '../../../../src/domain/discord/source-schema';
import type { DiscordSourceBundle } from '../../../../src/domain/discord/source';
import type { ChannelKind } from '../../../../src/domain/discord/snapshot';
import { parseGuildStructureSnapshot } from '../../../../src/domain/discord/snapshot';
import { decodeBase64UrlSecret } from '../../../../worker/config/runtime';
import {
  createValidatedDiscordSourceFixture,
  TEST_IDS,
} from '../../../fixtures/discord/guild-source';

const SECRET = 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI';
const GENERATED_AT = '2026-08-28T00:00:00.000Z';

async function normalize(
  bundle: DiscordSourceBundle = createValidatedDiscordSourceFixture(),
  identifiers?: IdentifierFactory,
) {
  const options: NormalizeOptions = {
    generatedAt: GENERATED_AT,
    identifiers: identifiers ?? (await createIdentifierFactory(decodeBase64UrlSecret(SECRET))),
  };
  return normalizeGuildStructure(bundle, options);
}

function roleById(bundle: DiscordSourceBundle, id: string) {
  const role = bundle.guild.roles.find((candidate) => candidate.id === id);
  if (role === undefined) throw new Error('TEST_FIXTURE_ROLE_MISSING');
  return role;
}

describe('bot-visible Discord structure normalization', () => {
  it('retains visible structure, a denied parent, and an unsupported type while dropping hidden and empty records', async () => {
    const snapshot = await normalize();
    const labels = snapshot.channels.map(({ label }) => label);

    expect(labels).toEqual([
      'Public',
      'general',
      'bot-private',
      'age-restricted',
      'Denied category',
      'visible-child',
      'unsupported',
    ]);
    expect(labels).not.toContain('hidden');
    expect(labels).not.toContain('thread');
    expect(labels).not.toContain('Empty');

    const deniedCategory = snapshot.channels.find(({ label }) => label === 'Denied category');
    const visibleChild = snapshot.channels.find(({ label }) => label === 'visible-child');
    expect(deniedCategory).toMatchObject({ kind: 'category', discordType: 4 });
    expect(visibleChild?.parentKey).toBe(deniedCategory?.key);
    expect(snapshot.channels.find(({ label }) => label === 'unsupported')).toMatchObject({
      kind: 'unsupported',
      discordType: 14,
    });
  });

  it.each([
    [0, 'text'],
    [2, 'voice'],
    [5, 'announcement'],
    [13, 'stage'],
    [15, 'forum'],
    [16, 'media'],
  ] satisfies Array<[number, ChannelKind]>)('maps Discord type %i to %s', async (type, kind) => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    const channel = bundle.channels.find(({ id }) => id === TEST_IDS.unsupportedChannel)!;
    channel.type = type;

    const snapshot = await normalize(bundle);

    expect(snapshot.channels.find(({ label }) => label === 'unsupported')).toMatchObject({
      kind,
      discordType: type,
    });
  });

  it.each([10, 11, 12])('drops Discord thread type %i', async (type) => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    bundle.channels.find(({ id }) => id === TEST_IDS.thread)!.type = type;

    const snapshot = await normalize(bundle);

    expect(snapshot.channels.map(({ label }) => label)).not.toContain('thread');
  });

  it('sorts duplicate positions by numeric raw snowflake before assigning contiguous sibling order', async () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    const publicIndex = bundle.channels.findIndex(({ id }) => id === TEST_IDS.publicText);
    const privateIndex = bundle.channels.findIndex(({ id }) => id === TEST_IDS.botPrivateText);
    if (publicIndex === -1 || privateIndex === -1) throw new Error('TEST_FIXTURE_CHANNEL_MISSING');
    [bundle.channels[publicIndex], bundle.channels[privateIndex]] = [
      bundle.channels[privateIndex]!,
      bundle.channels[publicIndex]!,
    ];
    expect(bundle.channels[publicIndex]?.id).toBe(TEST_IDS.botPrivateText);
    expect(bundle.channels[privateIndex]?.id).toBe(TEST_IDS.publicText);

    const snapshot = await normalize(bundle);
    const publicCategory = snapshot.channels.find(({ label }) => label === 'Public');
    const children = snapshot.channels
      .filter(({ parentKey }) => parentKey === publicCategory?.key)
      .sort((left, right) => left.order - right.order);

    expect(children.map(({ label, order }) => ({ label, order }))).toEqual([
      { label: 'general', order: 0 },
      { label: 'bot-private', order: 1 },
      { label: 'age-restricted', order: 2 },
    ]);
    expect(JSON.stringify(children)).not.toContain(TEST_IDS.publicText);
    expect(JSON.stringify(children)).not.toContain(TEST_IDS.botPrivateText);
  });

  it('defaults absent nsfw to false and preserves explicit age restriction', async () => {
    const snapshot = await normalize();

    expect(snapshot.channels.find(({ label }) => label === 'unsupported')?.ageRestricted).toBe(
      false,
    );
    expect(snapshot.channels.find(({ label }) => label === 'age-restricted')?.ageRestricted).toBe(
      true,
    );
  });

  it('retains all roles and every overwrite on retained records with domain-correct opaque keys', async () => {
    const bundle = createValidatedDiscordSourceFixture();
    const identifiers = await createIdentifierFactory(decodeBase64UrlSecret(SECRET));
    const snapshot = await normalize(bundle, identifiers);
    const privateChannel = snapshot.channels.find(({ label }) => label === 'bot-private');
    const expectedRoleKeys = await Promise.all(
      bundle.guild.roles.map(({ id }) => identifiers.for('role', id)),
    );

    expect(snapshot.roles).toHaveLength(3);
    expect(snapshot.roles.map(({ permissions }) => permissions)).toEqual(['1024', '0', '0']);
    expect(snapshot.roles.map(({ key }) => key)).toEqual(expectedRoleKeys);
    await expect(identifiers.for('guild', TEST_IDS.guild)).resolves.toBe(snapshot.guild.key);
    await expect(identifiers.for('member', TEST_IDS.owner)).resolves.toBe(snapshot.guild.ownerKey);
    await expect(identifiers.for('role', TEST_IDS.guild)).resolves.toBe(
      snapshot.guild.everyoneRoleKey,
    );
    await expect(identifiers.for('channel', TEST_IDS.botPrivateText)).resolves.toBe(
      privateChannel?.key,
    );

    const expectedOverwrites = [
      {
        label: 'bot-private',
        targets: [
          { kind: 'role', id: TEST_IDS.guild, allow: '0', deny: '1024' },
          { kind: 'role', id: TEST_IDS.botRole, allow: '1024', deny: '0' },
          { kind: 'member', id: TEST_IDS.memberWithOverwrite, allow: '1024', deny: '0' },
        ],
      },
      {
        label: 'Denied category',
        targets: [{ kind: 'role', id: TEST_IDS.guild, allow: '0', deny: '1024' }],
      },
      {
        label: 'visible-child',
        targets: [
          { kind: 'role', id: TEST_IDS.guild, allow: '0', deny: '1024' },
          { kind: 'role', id: TEST_IDS.botRole, allow: '1024', deny: '0' },
        ],
      },
    ] as const;

    for (const { label, targets } of expectedOverwrites) {
      const normalized = snapshot.channels.find((channel) => channel.label === label);
      expect(normalized?.overwrites).toHaveLength(targets.length);
      for (let index = 0; index < targets.length; index += 1) {
        const expected = targets[index]!;
        const actual = normalized?.overwrites[index];
        expect(actual).toMatchObject({
          targetType: expected.kind,
          allow: expected.allow,
          deny: expected.deny,
        });
        await expect(identifiers.for(expected.kind, expected.id)).resolves.toBe(actual?.targetKey);
      }
    }

    expect(snapshot.channels.flatMap(({ overwrites }) => overwrites)).toHaveLength(6);
  });

  it('domain-separates valid role and member overwrites with the same raw target ID', async () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    const publicChannel = bundle.channels.find(({ id }) => id === TEST_IDS.publicText);
    if (publicChannel === undefined) throw new Error('TEST_FIXTURE_CHANNEL_MISSING');
    publicChannel.overwrites = [
      { id: TEST_IDS.botRole, type: 0, allow: '0', deny: '0' },
      { id: TEST_IDS.botRole, type: 1, allow: '0', deny: '0' },
    ];
    validateDiscordSourceBundle(bundle, TEST_IDS.guild);
    const identifiers = await createIdentifierFactory(decodeBase64UrlSecret(SECRET));

    const snapshot = await normalize(bundle, identifiers);
    const overwrites = snapshot.channels.find(({ label }) => label === 'general')?.overwrites;
    const expectedRoleKey = await identifiers.for('role', TEST_IDS.botRole);
    const expectedMemberKey = await identifiers.for('member', TEST_IDS.botRole);

    expect(overwrites).toEqual([
      { targetKey: expectedRoleKey, targetType: 'role', allow: '0', deny: '0' },
      { targetKey: expectedMemberKey, targetType: 'member', allow: '0', deny: '0' },
    ]);
    expect(expectedRoleKey).not.toBe(expectedMemberKey);
  });

  it('returns only the minimized parseable snapshot without raw identifiers or discarded data', async () => {
    const validatedBundle = createValidatedDiscordSourceFixture();
    const identifiers = await createIdentifierFactory(decodeBase64UrlSecret(SECRET));
    const snapshot = await normalizeGuildStructure(validatedBundle, {
      generatedAt: GENERATED_AT,
      identifiers,
    });
    const json = JSON.stringify(snapshot);

    for (const rawId of Object.values(TEST_IDS)) expect(json).not.toContain(rawId);
    expect(json).not.toContain('PRIVATE_TOPIC_MUST_NOT_PERSIST');
    expect(json).not.toContain('PRIVATE_DESCRIPTION_MUST_NOT_PERSIST');
    expect(json).not.toContain('PRIVATE_NICK_MUST_NOT_PERSIST');
    expect(json).not.toContain('DISCARD_OVERWRITE_MARKER');
    expect(json).not.toContain('last_message_id');
    expect(json).not.toContain('roleIds');
    expect(json).not.toContain('botMember');
    expect(json).not.toContain('Staff');
    expect(Object.keys(snapshot)).toEqual([
      'schemaVersion',
      'identifierScheme',
      'generatedAt',
      'guild',
      'roles',
      'channels',
    ]);
    expect(Object.keys(snapshot.guild)).toEqual([
      'key',
      'displayName',
      'ownerKey',
      'everyoneRoleKey',
    ]);
    expect(Object.keys(snapshot.channels[0]!)).toEqual([
      'key',
      'kind',
      'discordType',
      'label',
      'parentKey',
      'order',
      'ageRestricted',
      'overwrites',
    ]);
    expect(parseGuildStructureSnapshot(snapshot)).toEqual(snapshot);
  });

  it('produces byte-equivalent JSON for the same source, key, and timestamp', async () => {
    const first = await normalize();
    const second = await normalize();

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('accepts an Administrator bot and includes channels visible through its bypass', async () => {
    const bundle = structuredClone(createValidatedDiscordSourceFixture());
    roleById(bundle, TEST_IDS.botRole).permissions = ADMINISTRATOR.toString();

    const snapshot = await normalize(bundle);

    expect(snapshot.channels.map(({ label }) => label)).toContain('hidden');
  });
});
