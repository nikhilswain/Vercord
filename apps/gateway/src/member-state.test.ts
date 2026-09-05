import { expect, it, vi } from 'vitest';

import type { MemberRecord } from '../../../src/domain/discord/live-protocol';
import { MemberState } from './member-state';

it('coalesces entry and never overwrites a removal with a late response', async () => {
  let finish!: (value: MemberRecord) => void;
  const read = vi.fn(
    () =>
      new Promise<MemberRecord>((resolve) => {
        finish = resolve;
      }),
  );
  const state = new MemberState(read);
  const first = state.get('100000000000000001', '200000000000000001');
  const second = state.get('100000000000000001', '200000000000000001');
  await Promise.resolve();
  const removed: MemberRecord = { kind: 'absent', userId: '200000000000000001' };
  state.update('100000000000000001', removed);
  finish({
    kind: 'present',
    member: {
      userId: removed.userId,
      roleIds: [],
      pending: false,
      communicationDisabledUntil: null,
    },
  });
  expect(await first).toEqual(removed);
  expect(await second).toEqual(removed);
  expect(read).toHaveBeenCalledTimes(1);
});
