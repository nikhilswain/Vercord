import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorldView } from '../../../src/domain/channels/protocol';
import {
  WorldStateStore,
  compareWorldVersion,
} from '../../../src/features/world/world-state';

function world(revision: number, displayName = 'Test world'): WorldView {
  return {
    snapshot: {
      schemaVersion: 1,
      slug: 'test-world',
      generatedAt: '2026-09-05T00:00:00.000Z',
      server: { displayName },
      areas: [],
    },
    controls: { canCreateRoot: revision > 1, categories: [], manageableKeys: [] },
    version: { epoch: 1, revision },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

describe('WorldStateStore', () => {
  it('orders DO incarnations before per-member revisions', () => {
    expect(
      compareWorldVersion({ epoch: 2, revision: 1 }, { epoch: 1, revision: 99 }),
    ).toBeGreaterThan(0);
    expect(compareWorldVersion({ epoch: 2, revision: 1 }, { epoch: 2, revision: 1 })).toBe(0);
    expect(
      compareWorldVersion({ epoch: 2, revision: 1 }, { epoch: 2, revision: 2 }),
    ).toBeLessThan(0);
  });

  it('accepts ordered controls while preserving identical map geometry', () => {
    const store = new WorldStateStore(async () => world(1));
    store.accept(world(1));
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);

    store.accept(world(2));
    expect(store.getSnapshot().view?.snapshot).toBe(first.view?.snapshot);
    expect(store.getSnapshot().view?.controls.canCreateRoot).toBe(true);

    const accepted = store.getSnapshot();
    store.accept(world(1, 'Older world'));
    expect(store.getSnapshot()).toBe(accepted);
  });

  it('single-flights reads and fences a late response after denial', async () => {
    const read = deferred<WorldView>();
    const reader = vi.fn(() => read.promise);
    const store = new WorldStateStore(reader);
    expect(reader).not.toHaveBeenCalled();

    const first = store.refresh();
    const second = store.refresh();
    expect(second).toBe(first);
    expect(reader).toHaveBeenCalledTimes(1);

    store.status({ state: 'denied', code: 'GUILD_MEMBERSHIP_REQUIRED' });
    read.resolve(world(1));
    await expect(first).resolves.toBe(false);
    expect(store.getSnapshot().view).toBeNull();
    expect(store.getSnapshot().sync).toEqual({
      state: 'denied',
      code: 'GUILD_MEMBERSHIP_REQUIRED',
    });
  });

  it('honors a 285-second server deadline before explicit refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T00:00:00.000Z'));
    const reader = vi.fn(async () => world(1));
    const store = new WorldStateStore(reader);
    const retryAt = Date.now() + 285_000;
    store.status({ state: 'cooldown', scope: 'admission', retryAt, code: 'CHANNEL_RATE_LIMITED' });

    await expect(store.refresh()).resolves.toBe(false);
    expect(reader).not.toHaveBeenCalled();
    expect(store.getSnapshot().retryAt).toBe(retryAt);
  });

  it('keeps an uncertain command locked until explicit refresh and confirmation', async () => {
    const store = new WorldStateStore(async () => world(2));
    store.mutation({
      status: 'uncertain',
      requestId: '123e4567-e89b-12d3-a456-426614174000',
      code: 'CHANNEL_ACTION_UNCERTAIN',
    });
    store.confirmReconciled();
    expect(store.getSnapshot()).toMatchObject({
      uncertainRequestId: '123e4567-e89b-12d3-a456-426614174000',
      canConfirmReconciled: false,
    });

    await expect(store.refresh()).resolves.toBe(true);
    expect(store.getSnapshot().canConfirmReconciled).toBe(true);
    store.confirmReconciled();
    expect(store.getSnapshot()).toMatchObject({
      uncertainRequestId: null,
      canConfirmReconciled: false,
    });
  });
});
