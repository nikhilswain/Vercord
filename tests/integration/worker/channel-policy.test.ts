import { expect, it } from 'vitest';

import {
  channelMutationResultSchema,
  worldViewSchema,
} from '../../../src/domain/channels/protocol';
import { prepareChannelMutation } from '../../../src/domain/discord/channel-policy';
import { liveReadSchema, memberAccessSchema } from '../../../src/domain/discord/live-protocol';
import { publicLabel } from '../../../src/domain/map/labels';
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

it('removes every forbidden control from public labels', () => {
  expect(publicLabel('alpha\u0000beta\u202egamma', 'fallback')).toBe('alphabetagamma');
});

it('rejects malformed member timeout timestamps', () => {
  expect(
    memberAccessSchema.safeParse({
      userId: '300000000000000001',
      roleIds: [],
      pending: false,
      communicationDisabledUntil: 'not-a-date',
    }).success,
  ).toBe(false);
});

it('fails closed when an invalid member timeout reaches policy preparation', () => {
  const source = createValidatedDiscordSourceFixture();
  source.guild.roles[0]!.permissions = '1040';

  expect(() =>
    prepareChannelMutation({
      source,
      member: {
        userId: source.guild.ownerId,
        roleIds: [],
        pending: false,
        communicationDisabledUntil: 'not-a-date',
      },
      channels: [],
      mutation: { kind: 'create', data: { name: 'test', type: 'text', parentKey: null } },
      now: 0,
    }),
  ).toThrow('CHANNEL_MEMBER_FORBIDDEN');
});

it('accepts the existing world-not-found channel error code', () => {
  expect(
    channelMutationResultSchema.safeParse({
      status: 'rejected',
      requestId: '3b7f4338-4cec-451d-b0d3-f3a942f264f0',
      code: 'WORLD_NOT_FOUND',
    }).success,
  ).toBe(true);
});

it('accepts the existing channels-unavailable fallback code', () => {
  expect(
    channelMutationResultSchema.safeParse({
      status: 'rejected',
      requestId: '3b7f4338-4cec-451d-b0d3-f3a942f264f0',
      code: 'CHANNELS_UNAVAILABLE',
    }).success,
  ).toBe(true);
});

it('accepts a source name with one hundred Unicode code points', () => {
  const source = createValidatedDiscordSourceFixture();
  source.guild.name = '😀'.repeat(100);

  expect(
    liveReadSchema.safeParse({
      guildId: source.guild.id,
      cursor: { streamId: 'e5c87579-ec50-4325-a4af-7c5927cd94cf', sequence: 1 },
      source,
      member: { kind: 'absent', userId: source.guild.ownerId },
    }).success,
  ).toBe(true);
});
