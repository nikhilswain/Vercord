import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, expect, it, vi } from 'vitest';
import { MemberSlowmode } from '../../../worker/messages/member-slowmode';
import { serverPresenceMessageSchema } from '../../../src/domain/presence/protocol';

const policy = {
  actorKey: `m_${'a'.repeat(43)}`,
  roomKey: `c_${'b'.repeat(43)}`,
  intervalMs: 2_000,
  bypass: false,
};
const applied = async () => ({ status: 'applied' as const });
afterEach(() => vi.restoreAllMocks());

async function ledger(
  test: (slowmode: MemberSlowmode, storage: DurableObjectStorage) => Promise<void>,
) {
  const stub = env.WORLD_PRESENCE.getByName(crypto.randomUUID());
  await runInDurableObject(stub, async (_instance, state) => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const slowmode = new MemberSlowmode(state.storage);
    await slowmode.setCoverage(true, 0);
    await test(slowmode, state.storage);
  });
}

it.each(['applied', 'uncertain'] as const)(
  'reserves durably before dispatch and keeps %s delivery',
  async (status) => {
    await ledger(async (slowmode, storage) => {
      await slowmode.run(policy, async () => {
        const restored = new MemberSlowmode(storage);
        await expect(restored.run(policy, applied)).rejects.toMatchObject({
          code: 'MESSAGE_RATE_LIMITED',
          status: 429,
          retryAt: 12_000,
        });
        return { status };
      });
      await expect(slowmode.run(policy, applied)).rejects.toMatchObject({ retryAt: 12_000 });
      vi.spyOn(Date, 'now').mockReturnValue(12_000);
      await expect(slowmode.run(policy, applied)).resolves.toEqual({ status: 'applied' });
    });
  },
);

it('bypasses active deadlines only for exempt members and isolates member/room pairs', async () => {
  await ledger(async (slowmode) => {
    await slowmode.run(policy, applied);
    await expect(slowmode.run({ ...policy, bypass: true }, applied)).resolves.toEqual({
      status: 'applied',
    });
    await expect(
      slowmode.run({ ...policy, actorKey: `m_${'c'.repeat(43)}` }, applied),
    ).resolves.toEqual({ status: 'applied' });
    await expect(
      slowmode.run({ ...policy, roomKey: `c_${'d'.repeat(43)}` }, applied),
    ).resolves.toEqual({ status: 'applied' });
  });
});

it('rolls back definite rejection without losing a concurrent native observation', async () => {
  await ledger(async (slowmode) => {
    let observe!: Promise<void>;
    await expect(
      slowmode.run(policy, async () => {
        observe = slowmode.observe(policy.actorKey, policy.roomKey, 15_000);
        throw new Error('definite rejection');
      }),
    ).rejects.toThrow('definite rejection');
    await observe;
    await expect(slowmode.run(policy, applied)).rejects.toMatchObject({ retryAt: 15_000 });
  });
});

it('releases a rejected reservation and serializes concurrent sends', async () => {
  await ledger(async (slowmode) => {
    await expect(
      slowmode.run(policy, async () => {
        throw new Error('rejected');
      }),
    ).rejects.toThrow('rejected');
    const results = await Promise.allSettled([
      slowmode.run(policy, applied),
      slowmode.run(policy, applied),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
  });
});

it('blocks lost/recovered coverage for one current interval without extending repeated online signals', async () => {
  await ledger(async (slowmode, storage) => {
    await slowmode.setCoverage(false);
    await expect(slowmode.run(policy, applied)).rejects.toMatchObject({ retryAt: 12_000 });
    vi.spyOn(Date, 'now').mockReturnValue(11_000);
    await slowmode.setCoverage(true);
    const restored = new MemberSlowmode(storage);
    await restored.setCoverage(true);
    await expect(restored.run({ ...policy, intervalMs: 3_000 }, applied)).rejects.toMatchObject({
      retryAt: 14_000,
    });
    vi.spyOn(Date, 'now').mockReturnValue(14_000);
    await expect(restored.run({ ...policy, intervalMs: 3_000 }, applied)).resolves.toEqual({
      status: 'applied',
    });
  });
});

it('prunes expired records while retaining active observations', async () => {
  await ledger(async (slowmode, storage) => {
    await slowmode.observe(policy.actorKey, policy.roomKey, 9_000);
    await slowmode.observe(`m_${'c'.repeat(43)}`, policy.roomKey, 15_000);
    await slowmode.prune();
    const restored = new MemberSlowmode(storage);
    await expect(
      restored.run({ ...policy, actorKey: `m_${'c'.repeat(43)}` }, applied),
    ).rejects.toMatchObject({ retryAt: 15_000 });
    await expect(restored.run(policy, applied)).resolves.toEqual({ status: 'applied' });
    expect(await storage.getAlarm()).not.toBeNull();
  });
});

it('retains retryAt only on browser rejection frames', () => {
  const frame = {
    type: 'message-send-result',
    requestId: crypto.randomUUID(),
    status: 'rejected',
    code: 'MESSAGE_RATE_LIMITED',
    retryAt: 12_000,
  };
  expect(serverPresenceMessageSchema.safeParse(frame)).toMatchObject({
    success: true,
    data: { retryAt: 12_000 },
  });
  expect(
    serverPresenceMessageSchema.safeParse({
      ...frame,
      status: 'uncertain',
      code: 'MESSAGE_ACTION_UNCERTAIN',
    }).success,
  ).toBe(false);
});
