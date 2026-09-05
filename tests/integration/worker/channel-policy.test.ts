import { expect, it } from 'vitest';

import { worldViewSchema } from '../../../src/domain/channels/protocol';
import { prepareChannelMutation } from '../../../src/domain/discord/channel-policy';
import { createValidatedDiscordSourceFixture } from '../../fixtures/discord/guild-source';

const publicView = {
  snapshot: {
    schemaVersion: 1,
    slug: 'test-map',
    generatedAt: '2026-09-05T00:00:00.000Z',
    server: { displayName: 'Test server' },
    areas: [],
  },
  controls: { canCreateRoot: false, categories: [], manageableKeys: [] },
  version: { epoch: 1, revision: 1 },
};

it('rejects a private source masquerading as a browser view', () => {
  expect(
    worldViewSchema.safeParse({
      ...publicView,
      source: {},
      member: {},
      guildId: '100000000000000001',
    }).success,
  ).toBe(false);
});

it('forbids pending members from creating channels', () => {
  const source = createValidatedDiscordSourceFixture();
  const member = {
    userId: source.guild.ownerId,
    roleIds: [],
    pending: true,
    communicationDisabledUntil: null,
  };

  expect(() =>
    prepareChannelMutation({
      source,
      member,
      channels: [],
      mutation: { kind: 'create', data: { name: 'test', type: 'text', parentKey: null } },
      now: 0,
    }),
  ).toThrow('CHANNEL_MEMBER_FORBIDDEN');
});
