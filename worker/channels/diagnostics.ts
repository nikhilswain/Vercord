import { DiscordDomainError } from '../../src/domain/discord/errors';
import { WorkerError } from '../errors';

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

export function logChannelFailure(stage: string, error: unknown): void {
  console.warn(
    JSON.stringify({
      service: 'dmap-worker',
      event: 'channel_read_failed',
      stage,
      reason: channelFailureReason(error),
    }),
  );
}
