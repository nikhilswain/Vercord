import {
  LIVE_COMMAND_MAX_BYTES,
  LIVE_MUTATION_MAX_BYTES,
  liveCommandResultSchema,
  liveCommandSchema,
  type LiveCommand,
  type LiveCommandResult,
} from '../../src/domain/discord/live-protocol';

type CommandInput = LiveCommand extends infer Command
  ? Command extends LiveCommand
    ? Omit<Command, 'requestId' | 'expiresAt'>
    : never
  : never;

export async function sendLiveCommand(env: Env, input: CommandInput): Promise<LiveCommandResult> {
  const requestId = crypto.randomUUID();
  const command = liveCommandSchema.parse({ ...input, requestId, expiresAt: Date.now() + 6_000 });
  const body = JSON.stringify(command);
  const encoder = new TextEncoder();
  if (
    encoder.encode(body).byteLength > LIVE_COMMAND_MAX_BYTES ||
    (command.type === 'channel-mutate' &&
      encoder.encode(JSON.stringify(command.input)).byteLength > LIVE_MUTATION_MAX_BYTES)
  ) {
    return { type: 'live-error', requestId, error: { code: 'INVALID_REQUEST', status: 413 } };
  }
  try {
    const response = await env.DISCORD_GATEWAY_BRIDGE.getByName('singleton').fetch(
      'https://discord-gateway.dmap/live-command',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      },
    );
    const value: unknown = await response.json();
    if (
      response.status === 503 &&
      typeof value === 'object' &&
      value !== null &&
      'error' in value &&
      typeof value.error === 'object' &&
      value.error !== null &&
      'code' in value.error &&
      value.error.code === 'GATEWAY_UPDATE_REQUIRED'
    ) {
      return {
        type: 'live-error',
        requestId,
        error: { code: 'GATEWAY_UPDATE_REQUIRED', status: 503 },
      };
    }
    const parsed = liveCommandResultSchema.safeParse(value);
    if (response.ok && parsed.success && parsed.data.requestId === requestId) return parsed.data;
  } catch {
    /* A lost HTTP response can hide a dispatched write. Never retry it. */
  }
  return command.type === 'channel-mutate'
    ? {
        type: 'channel-result',
        requestId,
        read: null,
        result: { status: 'uncertain', requestId, code: 'CHANNEL_ACTION_UNCERTAIN' },
      }
    : { type: 'live-error', requestId, error: { code: 'WORLD_SOURCE_UNAVAILABLE', status: 503 } };
}
