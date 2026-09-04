import { pathToFileURL } from 'node:url';

import { DiscordDomainError } from '../../src/domain/discord/errors';
import { parseDiscordSourceConfig } from '../../worker/config/schema';
import { createDiscordRestClient } from '../../worker/discord/client';
import { WorkerError } from '../../worker/errors';
import { formatBotVisibleInventory } from './format-inventory';

async function main(): Promise<void> {
  process.loadEnvFile('.dev.vars');
  const source = parseDiscordSourceConfig(process.env);
  const client = createDiscordRestClient({ botToken: source.botToken });
  const bundle = await client.fetchGuildSource(source.guildId);
  process.stdout.write(`${formatBotVisibleInventory(bundle)}\n`);
}

async function runWithSafeFailureBoundary(): Promise<void> {
  try {
    await main();
  } catch (error) {
    const code =
      error instanceof DiscordDomainError || error instanceof WorkerError
        ? error.code
        : error instanceof Error && error.message === 'CONFIG_INVALID'
          ? 'CONFIG_INVALID'
          : 'VERIFY_FAILED';
    process.stderr.write(`Discord access verification failed: ${code}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runWithSafeFailureBoundary();
}
