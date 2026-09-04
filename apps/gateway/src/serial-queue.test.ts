import { describe, expect, it } from 'vitest';

import { KeyedSerialQueue } from './serial-queue';

describe('KeyedSerialQueue', () => {
  it('serializes one member while allowing another member to proceed', async () => {
    const queue = new KeyedSerialQueue();
    const events: string[] = [];
    let releaseFirst = (): void => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.run('guild:user-a', async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
    });
    const second = queue.run('guild:user-a', async () => {
      events.push('second');
    });
    const other = queue.run('guild:user-b', async () => {
      events.push('other');
    });

    await other;
    expect(events).toEqual(['first:start', 'other']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'other', 'first:end', 'second']);
  });
});
