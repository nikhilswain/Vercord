import { createIdentifierFactory } from '../../src/domain/discord/identifiers';
import { parseRuntimeConfig } from '../config/runtime';
import { createDiscordRestClient } from '../discord/client';
import { createConsoleSafeLogger } from '../logging/safe-logger';
import { createKvGuildStructureRepository } from '../storage/guild-structure-repository';
import { synchronizeGuild, type SyncSummary } from './synchronize-guild';

export async function synchronizePrivateGuild(env: Env, guildId: string): Promise<SyncSummary> {
  const runtime = parseRuntimeConfig(env);
  const identifiers = await createIdentifierFactory(runtime.snapshotIdSecret);

  return synchronizeGuild(
    { guildId, mapSlug: guildId },
    {
      discord: createDiscordRestClient({ botToken: runtime.botToken }),
      snapshots: createKvGuildStructureRepository(runtime.snapshots),
      identifiers,
      now: () => new Date(),
      logger: createConsoleSafeLogger(),
    },
  );
}
