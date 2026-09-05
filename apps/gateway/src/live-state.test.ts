import { EventEmitter } from 'node:events';

import type { Client } from 'discord.js';
import { expect, it, vi } from 'vitest';

import type { LiveCommand, MemberRecord } from '../../../src/domain/discord/live-protocol';
import { DiscordLiveState } from './live-state';
import { LiveStateError, type MemberReader } from './member-state';

// Isolate guild-cache conversion; exercise the real recovery and relationship validator.
vi.mock('./source-adapter', () => ({
  sourceFromGuild: () => ({
    bot: { id: '4' },
    guild: { id: '1', name: 'Guild', ownerId: '6', roles: [{ id: '1', permissions: '0' }] },
    botMember: { roleIds: [] },
    channels: [
      {
        id: '5',
        type: 0,
        position: 0,
        name: 'general',
        parentId: null,
        nsfw: false,
        overwrites: [],
      },
    ],
  }),
}));

const present = (userId: string): MemberRecord => ({
  kind: 'present',
  member: { userId, roleIds: [], pending: false, communicationDisabledUntil: null },
});
const command = (userId: string): Extract<LiveCommand, { type: 'world-read' }> => ({
  type: 'world-read',
  guildId: '1',
  userId,
  requestId: crypto.randomUUID(),
  subscriptionId: crypto.randomUUID(),
  watch: 'connected',
  expiresAt: Date.now() + 60_000,
});
function fixture(readMember: MemberReader): DiscordLiveState {
  const client = Object.assign(new EventEmitter(), {
    guilds: { cache: new Map([['1', { available: true, shardId: 0, members: { me: {} } }]]) },
  }) as unknown as Client;
  return new DiscordLiveState(client, { for: async () => `g_${'a'.repeat(43)}` }, () => true, {
    readMember,
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

it('finishes remaining watches when another member releases during recovery', async () => {
  const first = deferred<MemberRecord>();
  const second = deferred<MemberRecord>();
  const started = deferred<void>();
  const live = fixture(async (_guildId, userId) => {
    if (userId === '2') return first.promise;
    started.resolve();
    return second.promise;
  });
  try {
    const leaving = command('2');
    const leavingRead = live.read(leaving).catch((error: unknown) => error);
    const remainingRead = live.read(command('3'));
    await started.promise;
    live.release({ ...leaving, type: 'world-release' });
    first.resolve(present('2'));
    second.resolve(present('3'));
    expect(await leavingRead).toBeInstanceOf(LiveStateError);
    expect((await remainingRead).member).toEqual(present('3'));
    expect(live.current('1', '3').member).toEqual(present('3'));
  } finally {
    live.stop();
  }
});

it('hydrates a same-user replacement watch before shared recovery becomes ready', async () => {
  const obsolete = deferred<MemberRecord>();
  const replacement = deferred<MemberRecord>();
  const otherMember = deferred<MemberRecord>();
  const started = deferred<void>();
  const replacementStarted = deferred<void>();
  let memberReads = 0;
  const live = fixture(async (_guildId, userId) => {
    if (userId === '3') {
      started.resolve();
      return otherMember.promise;
    }
    memberReads += 1;
    if (memberReads === 1) return obsolete.promise;
    replacementStarted.resolve();
    return replacement.promise;
  });
  try {
    const leaving = command('2');
    const leavingRead = live.read(leaving).catch((error: unknown) => error);
    const remainingRead = live.read(command('3'));
    await started.promise;
    live.release({ ...leaving, type: 'world-release' });
    const replacementRead = live.read(command('2'));
    obsolete.resolve(present('2'));
    otherMember.resolve(present('3'));
    await replacementStarted.promise;
    expect(() => live.current('1', '3')).toThrow(LiveStateError);
    replacement.resolve({ kind: 'absent', userId: '2' });
    expect(await leavingRead).toBeInstanceOf(LiveStateError);
    expect((await remainingRead).member).toEqual(present('3'));
    expect((await replacementRead).member).toEqual({ kind: 'absent', userId: '2' });
    expect(live.current('1', '2').member).toEqual({ kind: 'absent', userId: '2' });
  } finally {
    live.stop();
  }
});

it.each([
  ['malformed response', { id: '5', permission_overwrites: [] }],
  [
    'wrong PATCH target',
    { id: '7', type: 0, position: 0, name: 'renamed', permission_overwrites: [] },
  ],
  [
    'invalid parent relationship',
    { id: '5', type: 0, position: 0, name: 'renamed', parent_id: '8', permission_overwrites: [] },
  ],
])('revokes source authority without retaining a candidate with %s', async (_label, response) => {
  const live = fixture(async (_guildId, userId) => present(userId));
  try {
    const initial = await live.read(command('2'));
    await expect(
      live.reconcile(
        '1',
        { method: 'PATCH', path: '/channels/5', body: { name: 'renamed' } },
        response,
        initial.cursor,
      ),
    ).rejects.toBeInstanceOf(LiveStateError);
    expect(() => live.current('1', '2')).toThrow(LiveStateError);
    await live.recover('1');
    expect(live.current('1', '2').source.channels[0]?.name).toBe('general');
  } finally {
    live.stop();
  }
});
