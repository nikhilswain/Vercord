import type { MessageSlowmodePolicy } from '../../src/domain/messages/protocol';
import { WorldAccessError } from '../live-world/coordinator';

export type { MessageSlowmodePolicy } from '../../src/domain/messages/protocol';

const PREFIX = 'memberSlowmode:';
const COVERAGE_KEY = 'memberSlowmodeCoverage';
type Coverage = { online: boolean; at: number };

/** The guild Durable Object is the sole owner, including native observations. */
export class MemberSlowmode {
  private readonly lanes = new Map<string, Promise<unknown>>();

  public constructor(private readonly storage: DurableObjectStorage) {}

  public run<T extends { status: 'applied' | 'uncertain' }>(
    policy: MessageSlowmodePolicy,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = this.key(policy.actorKey, policy.roomKey);
    return this.ordered(key, async () => {
      if (policy.bypass || policy.intervalMs === 0) return operation();
      const [previous, coverage] = await Promise.all([
        this.storage.get<number>(key),
        this.storage.get<Coverage>(COVERAGE_KEY),
      ]);
      const now = Date.now();
      const coverageDeadline = coverage?.online
        ? coverage.at + policy.intervalMs
        : now + policy.intervalMs;
      const retryAt = Math.max(previous ?? 0, coverageDeadline);
      if (retryAt > now) throw new WorldAccessError('MESSAGE_RATE_LIMITED', 429, retryAt);

      // Persist before any provider dispatch; eviction/restart cannot grant another send.
      await this.storage.put(key, now + policy.intervalMs);
      await this.schedulePrune();
      try {
        return await operation();
      } catch (error) {
        // The caller throws only for definite rejection. Observations use this same lane.
        if (previous === undefined) await this.storage.delete(key);
        else await this.storage.put(key, previous);
        throw error;
      }
    });
  }

  public observe(actorKey: string, roomKey: string, nextAllowedAt: number): Promise<void> {
    const key = this.key(actorKey, roomKey);
    return this.ordered(key, async () => {
      const previous = await this.storage.get<number>(key);
      if (nextAllowedAt > Math.max(previous ?? 0, Date.now())) {
        await this.storage.put(key, nextAllowedAt);
        await this.schedulePrune();
      }
    });
  }

  public setCoverage(online: boolean, at = Date.now()): Promise<void> {
    return this.ordered(COVERAGE_KEY, async () => {
      const previous = await this.storage.get<Coverage>(COVERAGE_KEY);
      if (previous?.online === online) return;
      await this.storage.put(COVERAGE_KEY, { online, at });
    });
  }

  public async prune(): Promise<void> {
    const records = await this.storage.list<number>({ prefix: PREFIX });
    await Promise.all(
      [...records.keys()].map((key) =>
        this.ordered(key, async () => {
          const deadline = await this.storage.get<number>(key);
          if (deadline !== undefined && deadline <= Date.now()) await this.storage.delete(key);
        }),
      ),
    );
    await this.schedulePrune();
  }

  private key(actorKey: string, roomKey: string): string {
    return `${PREFIX}${roomKey}:${actorKey}`;
  }

  private schedulePrune(): Promise<void> {
    return this.ordered('alarm', async () => {
      const records = await this.storage.list<number>({ prefix: PREFIX });
      if (records.size === 0) return;
      let next = Infinity;
      for (const deadline of records.values()) next = Math.min(next, deadline);
      await this.storage.setAlarm(Math.max(Date.now() + 1, next));
    });
  }

  private ordered<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.lanes.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.lanes.set(key, current);
    void current
      .finally(() => {
        if (this.lanes.get(key) === current) this.lanes.delete(key);
      })
      .catch(() => undefined);
    return current;
  }
}
