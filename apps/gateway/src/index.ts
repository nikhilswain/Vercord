import { fileURLToPath } from 'node:url';

import { WorkerBridge } from './bridge';
import { parseGatewayConfig } from './config';
import { DiscordVoiceService } from './discord';

async function main(): Promise<void> {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../../.dev.vars', import.meta.url)));
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  const config = parseGatewayConfig(process.env);
  const discord = new DiscordVoiceService(config);
  await discord.start();

  const bridge = new WorkerBridge(config, {
    onConnected: (send) => discord.attachBridge(send),
    onCommand: (command) => discord.handleCommand(command),
  });
  bridge.start();

  const shutdown = (): void => {
    bridge.stop();
    discord.stop();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  const code =
    error instanceof Error && error.message === 'GATEWAY_CONFIG_INVALID'
      ? error.message
      : 'GATEWAY_START_FAILED';
  console.error(JSON.stringify({ service: 'dmap-gateway', event: 'startup_failed', code }));
  process.exitCode = 1;
});
