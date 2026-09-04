import {
  gatewayCommandResultSchema,
  type GatewayCommand,
  type GatewayCommandResult,
} from '../../src/domain/voice/protocol';

type CommandWithoutRequestId = GatewayCommand extends infer Command
  ? Command extends GatewayCommand
    ? Omit<Command, 'requestId'>
    : never
  : never;

export type BridgeCommandOutcome =
  | { service: 'online'; result: GatewayCommandResult }
  | { service: 'offline'; result: null }
  | { service: 'timeout'; result: null };

export async function sendDiscordGatewayCommand(
  env: Env,
  command: CommandWithoutRequestId,
): Promise<BridgeCommandOutcome> {
  const requestId = crypto.randomUUID();
  const stub = env.DISCORD_GATEWAY_BRIDGE.getByName('singleton');
  const response = await stub.fetch('https://discord-gateway.dmap/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...command, requestId }),
  });

  if (response.status === 503) return { service: 'offline', result: null };
  if (response.status === 504) return { service: 'timeout', result: null };
  if (!response.ok) throw new Error('VOICE_BRIDGE_FAILED');
  const parsed = gatewayCommandResultSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.requestId !== requestId) {
    throw new Error('VOICE_BRIDGE_FAILED');
  }
  return { service: 'online', result: parsed.data };
}
