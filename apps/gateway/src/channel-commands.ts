import { createHash } from 'node:crypto';

import {
  ChannelPolicyError,
  prepareChannelMutation,
  type KeyedChannel,
} from '../../../src/domain/discord/channel-policy';
import type { IdentifierFactory } from '../../../src/domain/discord/identifiers';
import type {
  LiveCommand,
  LiveCommandResult,
  LiveRead,
} from '../../../src/domain/discord/live-protocol';
import { InteractiveRateLimit, InteractiveRest, type DispatchContext } from './interactive-rest';
import { DiscordLiveState, recordGatewayOperation, type MutationFence } from './live-state';
import { LiveStateError } from './member-state';

type Command = Extract<LiveCommand, { type: 'channel-mutate' }>;
type Correlation = { fingerprint: string; expiresAt: number; result: Promise<LiveCommandResult> };

export class ChannelCommands {
  private readonly lanes = new Map<string, { tail: Promise<void>; count: number }>();
  private readonly outcomes = new Map<string, Correlation>();
  private pending = 0;

  public constructor(
    private readonly state: DiscordLiveState,
    private readonly rest: InteractiveRest,
    private readonly identifiers: IdentifierFactory,
  ) {}

  public execute(
    command: Command,
    isCurrent: () => boolean = () => true,
  ): Promise<LiveCommandResult> {
    const now = Date.now();
    for (const [id, entry] of this.outcomes) if (entry.expiresAt <= now) this.outcomes.delete(id);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          command.guildId,
          command.userId,
          command.input.kind,
          command.input.kind === 'create' ? null : command.input.roomKey,
          Object.entries(command.input.data).sort(([a], [b]) => a.localeCompare(b)),
        ]),
      )
      .digest('hex');
    const existing = this.outcomes.get(command.requestId);
    if (existing)
      return existing.fingerprint === fingerprint
        ? existing.result
        : Promise.resolve(this.rejected(command, 'INVALID_REQUEST'));
    if (this.outcomes.size >= 1_000)
      return Promise.resolve(this.rejected(command, 'CHANNEL_LIMIT_REACHED'));
    const lane = this.lanes.get(command.guildId) ?? { tail: Promise.resolve(), count: 0 };
    if (lane.count >= 20 || this.pending >= 200) {
      const result = Promise.resolve(this.rejected(command, 'CHANNEL_LIMIT_REACHED'));
      this.outcomes.set(command.requestId, { fingerprint, expiresAt: now + 60_000, result });
      return result;
    }
    const controller = new AbortController();
    const deadline = Math.min(command.expiresAt, now + 6_000);
    const context: DispatchContext = {
      requestId: command.requestId,
      dispatched: false,
      assertAllowed: () => {},
    };
    let timeout!: ReturnType<typeof setTimeout>;
    const expired = new Promise<LiveCommandResult>((resolve) => {
      timeout = setTimeout(
        () => {
          controller.abort();
          resolve(this.outcome(command, context, new LiveStateError()));
        },
        Math.max(0, deadline - now),
      );
    });
    lane.count += 1;
    this.pending += 1;
    this.lanes.set(command.guildId, lane);
    const execution = lane.tail
      .then(() => this.run(command, controller.signal, deadline, context, isCurrent))
      .finally(() => {
        lane.count -= 1;
        this.pending -= 1;
        if (lane.count === 0) this.lanes.delete(command.guildId);
      });
    const result = Promise.race([execution, expired]).finally(() => clearTimeout(timeout));
    lane.tail = execution.then(() => undefined);
    const correlation = { fingerprint, expiresAt: Number.POSITIVE_INFINITY, result };
    this.outcomes.set(command.requestId, correlation);
    void result.then((outcome) => {
      if (context.dispatched) {
        recordGatewayOperation({
          operation: 'command_dispatch',
          outcome: outcome.result.status,
          reason: command.input.kind,
          durationMs: Date.now() - now,
        });
      }
      correlation.expiresAt = Date.now() + 60_000;
    });
    return result;
  }

  private async run(
    command: Command,
    signal: AbortSignal,
    deadline: number,
    context: DispatchContext,
    isCurrent: () => boolean,
  ): Promise<LiveCommandResult> {
    let fence: MutationFence | undefined;
    try {
      signal.throwIfAborted();
      if (Date.now() >= deadline || !isCurrent()) throw new LiveStateError();
      const continuity = this.state.current(command.guildId, command.userId).cursor.streamId;
      context.invalidateSource = () => this.state.invalidateMutation(command.guildId, continuity);
      const authorizationStartedAt = Date.now();
      try {
        await this.state.freshMember(command.guildId, command.userId, signal);
        recordGatewayOperation({
          operation: 'fresh_mutation_authorization',
          outcome: 'completed',
          reason: 'member_refreshed',
          durationMs: Date.now() - authorizationStartedAt,
        });
      } catch (error) {
        recordGatewayOperation({
          operation: 'fresh_mutation_authorization',
          outcome: 'failed',
          reason: 'member_refresh_failed',
          durationMs: Date.now() - authorizationStartedAt,
        });
        throw error;
      }
      const initial = this.state.current(command.guildId, command.userId);
      const keys = new Map(
        await Promise.all(
          initial.source.channels.map(
            async (channel) =>
              [
                channel.id,
                (await this.identifiers.for('channel', channel.id)).toLowerCase(),
              ] as const,
          ),
        ),
      );
      const prepare = (read: LiveRead) => {
        signal.throwIfAborted();
        if (Date.now() >= deadline || !isCurrent() || read.cursor.streamId !== continuity)
          throw new LiveStateError();
        if (read.member.kind === 'absent')
          throw new ChannelPolicyError('GUILD_MEMBERSHIP_REQUIRED', 403);
        const channels: KeyedChannel[] = read.source.channels.flatMap((channel) => {
          const key = keys.get(channel.id);
          return key === undefined ? [] : [{ key, channel }];
        });
        return prepareChannelMutation({
          source: read.source,
          member: read.member.member,
          channels,
          mutation: command.input,
          now: Date.now(),
        });
      };
      const prepared = prepare(this.state.current(command.guildId, command.userId));
      context.assertAllowed = () => {
        const current = this.state.current(command.guildId, command.userId);
        if (JSON.stringify(prepare(current)) !== JSON.stringify(prepared))
          throw new ChannelPolicyError('CHANNEL_CHANGED', 409);
        fence = this.state.captureMutation(command.guildId, prepared);
      };
      let response: unknown;
      try {
        response = await this.rest.mutate(prepared, command.userId, signal, context);
      } catch (error) {
        if (
          context.responseStatus === undefined ||
          context.responseStatus < 200 ||
          context.responseStatus >= 300
        )
          throw error;
      }
      if (fence) {
        try {
          await this.state.reconcile(
            command.guildId,
            prepared,
            response,
            fence.cursor,
            fence,
            signal,
          );
        } catch {
          return this.applied(command, null);
        }
      }
      try {
        return this.applied(command, this.state.current(command.guildId, command.userId));
      } catch {
        return this.applied(command, null);
      }
    } catch (error) {
      return this.outcome(command, context, error);
    }
  }

  private outcome(command: Command, context: DispatchContext, error: unknown): LiveCommandResult {
    const status = context.responseStatus;
    if (status !== undefined && status >= 200 && status < 300) {
      context.invalidateSource?.();
      return this.applied(command, null);
    }
    if (error instanceof InteractiveRateLimit)
      return this.rejected(command, error.code, error.retryAt);
    if (status === 403) return this.rejected(command, 'CHANNEL_BOT_FORBIDDEN');
    if (status === 404) return this.rejected(command, 'CHANNEL_NOT_FOUND');
    if (status === 429) return this.rejected(command, 'CHANNEL_RATE_LIMITED');
    if (status !== undefined && status >= 400 && status < 500)
      return this.rejected(command, 'CHANNEL_CHANGE_REJECTED');
    if (context.dispatched) {
      context.invalidateSource?.();
      return {
        type: 'channel-result',
        requestId: command.requestId,
        read: null,
        result: {
          status: 'uncertain',
          requestId: command.requestId,
          code: 'CHANNEL_ACTION_UNCERTAIN',
        },
      };
    }
    return this.rejected(
      command,
      error instanceof ChannelPolicyError || error instanceof LiveStateError
        ? error.code
        : 'WORLD_SOURCE_UNAVAILABLE',
    );
  }

  private applied(command: Command, read: LiveRead | null): LiveCommandResult {
    return {
      type: 'channel-result',
      requestId: command.requestId,
      result: { status: 'applied', requestId: command.requestId, view: null },
      read,
    };
  }

  private rejected(command: Command, code: string, retryAt?: number): LiveCommandResult {
    return {
      type: 'channel-result',
      requestId: command.requestId,
      result: {
        status: 'rejected',
        requestId: command.requestId,
        code,
        ...(retryAt === undefined ? {} : { retryAt }),
      },
      read: null,
    };
  }
}
