import { AsyncLocalStorage } from 'node:async_hooks';

import { REST, Routes, type RESTOptions } from 'discord.js';
import { z } from 'zod';

import type { PreparedChannelMutation } from '../../../src/domain/discord/channel-policy';
import { memberRecordSchema, type MemberRecord } from '../../../src/domain/discord/live-protocol';
import { discordTimestampSchema, snowflakeSchema } from '../../../src/domain/discord/source-schema';
import { LiveStateError } from './member-state';

export type DispatchContext = {
  requestId: string;
  dispatched: boolean;
  responseStatus?: number;
  invalidateSource?(): void;
  assertAllowed(): void;
};

export const dispatchContext = new AsyncLocalStorage<DispatchContext>();

/** Runs inside the REST library's bucket queue, immediately before transport. */
export const guardedRequest: RESTOptions['makeRequest'] = async (url, init) => {
  init.signal?.throwIfAborted();
  const context = dispatchContext.getStore();
  context?.assertAllowed();
  if (context) {
    if (context.dispatched) throw new LiveStateError();
    context.dispatched = true;
  }
  const response = await fetch(url, init as Parameters<typeof fetch>[1]);
  // Do not wait for JSON parsing to preserve confirmation of an applied write.
  if (context) context.responseStatus = response.status;
  return response;
};

export const interactiveRestOptions = {
  retries: 0,
  timeout: 5_000,
  rejectOnRateLimit: () => true,
  makeRequest: guardedRequest,
} satisfies Partial<RESTOptions>;

const memberResponse = z.object({
  user: z.object({ id: snowflakeSchema }),
  roles: z.array(snowflakeSchema).max(1_000),
  pending: z.boolean().optional(),
  communication_disabled_until: discordTimestampSchema.nullable().optional(),
});

export class InteractiveRateLimit extends LiveStateError {
  public constructor(public readonly retryAt: number) {
    super('CHANNEL_RATE_LIMITED', 429);
  }
}

export class InteractiveRest {
  // The library owns route/global buckets. Retain rejected sublimits as well:
  // rejectOnRateLimit throws before the library installs its sublimit sleep.
  private readonly cooldowns = new Map<string, number>();
  private globalRetryAt = 0;

  public constructor(private readonly rest: REST) {}

  public async member(
    guildId: string,
    userId: string,
    signal?: AbortSignal,
  ): Promise<MemberRecord> {
    const path = Routes.guildMember(guildId, userId);
    this.assertCooldown(path);
    try {
      const data = memberResponse.parse(await this.rest.get(path, { signal }));
      if (data.user.id !== userId) throw new LiveStateError();
      return memberRecordSchema.parse({
        kind: 'present',
        member: {
          userId,
          roleIds: data.roles.filter((id) => id !== guildId).sort(),
          pending: data.pending ?? false,
          communicationDisabledUntil: data.communication_disabled_until ?? null,
        },
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 10007)
        return { kind: 'absent', userId };
      throw this.captureCooldown(path, error);
    }
  }

  public async mutate(
    prepared: PreparedChannelMutation,
    actorId: string,
    signal: AbortSignal,
    context: DispatchContext,
  ): Promise<unknown> {
    this.assertCooldown(prepared.path);
    const assertAllowed = context.assertAllowed;
    context.assertAllowed = () => {
      this.assertCooldown(prepared.path);
      assertAllowed();
    };
    try {
      return await dispatchContext.run(context, () => {
        const options = {
          body: prepared.body,
          signal,
          reason: `Dmap channel action by ${actorId}`,
        };
        const path = prepared.path as `/${string}`;
        if (prepared.method === 'POST') return this.rest.post(path, options);
        if (prepared.method === 'PATCH') return this.rest.patch(path, options);
        return this.rest.delete(path, options);
      });
    } catch (error) {
      throw this.captureCooldown(prepared.path, error);
    }
  }

  private assertCooldown(path: string): void {
    const now = Date.now();
    for (const [key, deadline] of this.cooldowns) if (deadline <= now) this.cooldowns.delete(key);
    const retryAt = Math.max(this.globalRetryAt, this.cooldowns.get(path) ?? 0);
    if (retryAt > now) throw new InteractiveRateLimit(retryAt);
  }

  private captureCooldown(path: string, error: unknown): unknown {
    if (typeof error !== 'object' || error === null) return error;
    const data = error as {
      retryAfter?: number;
      timeToReset?: number;
      sublimitTimeout?: number;
      global?: boolean;
    };
    const wait = Math.max(
      0,
      ...[data.retryAfter, data.timeToReset, data.sublimitTimeout].filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value) && value > 0,
      ),
    );
    if (wait === 0) return error;
    const retryAt = Math.ceil(Date.now() + wait);
    if (data.global || (!this.cooldowns.has(path) && this.cooldowns.size >= 1_000))
      this.globalRetryAt = Math.max(this.globalRetryAt, retryAt);
    else this.cooldowns.set(path, Math.max(this.cooldowns.get(path) ?? 0, retryAt));
    return new InteractiveRateLimit(retryAt);
  }
}
