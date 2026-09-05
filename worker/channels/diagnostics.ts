import { DiscordDomainError } from '../../src/domain/discord/errors';
import { WorkerError } from '../errors';

const channelFailureCounts = new Map<string, number>();
const SAFE_OPERATIONS = new Set(['session', 'world', 'channel-state', 'session-touch', 'mutation']);

/** Only stable codes, never exception text, provider bodies, credentials, or guild data. */
export function channelFailureReason(error: unknown): string {
  if (error instanceof WorkerError || error instanceof DiscordDomainError) return error.code;
  if (!(error instanceof Error)) return 'UNKNOWN';
  if (/^[A-Z][A-Z0-9_]{0,63}$/u.test(error.message)) return error.message;
  if (error.message.includes('different request')) return 'CROSS_REQUEST_IO';
  if (error.message.includes('Network connection lost') || error.message === 'fetch failed')
    return 'NETWORK_UNAVAILABLE';
  if (error.message.includes('D1_ERROR')) return 'DATABASE_ERROR';
  if (error.name === 'ZodError') return 'RESPONSE_SCHEMA_INVALID';
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'REQUEST_TIMEOUT';
  return 'UNEXPECTED_ERROR';
}

export function logChannelFailure(stage: string, error: unknown, durationMs = 0): void {
  try {
    const operation = SAFE_OPERATIONS.has(stage) ? stage : 'unknown';
    const reason = channelFailureReason(error);
    const key = `${operation}:${reason}`;
    const count = (channelFailureCounts.get(key) ?? 0) + 1;
    channelFailureCounts.set(key, count);
    console.warn(
      JSON.stringify({
        service: 'dmap-worker',
        event: 'channel_operation',
        operation,
        outcome: 'failed',
        reason,
        count,
        durationMs: Math.max(0, Math.round(durationMs)),
      }),
    );
  } catch {
    // Diagnostics must never replace the public error response.
  }
}
