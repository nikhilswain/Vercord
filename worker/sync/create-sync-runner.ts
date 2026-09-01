import { createIdentifierFactory } from '../../src/domain/discord/identifiers';
import { parseRuntimeConfig } from '../config/runtime';
import { createDiscordRestClient } from '../discord/client';
import { createConsoleSafeLogger } from '../logging/safe-logger';
import { createKvGuildStructureRepository } from '../storage/guild-structure-repository';
import { createKvPublicMapRepository } from '../storage/public-map-repository';
import { synchronizeGuild, type SyncSummary } from './synchronize-guild';

export interface SyncRunner {
  run(env: Env): Promise<SyncSummary>;
}

export function createSyncRunner(): SyncRunner {
  return {
    async run(env) {
      const config = parseRuntimeConfig(env);
      const identifiers = await createIdentifierFactory(config.snapshotIdSecret);
      return synchronizeGuild(config, {
        discord: createDiscordRestClient({ botToken: config.botToken }),
        snapshots: createKvGuildStructureRepository(config.snapshots),
        publicMaps: createKvPublicMapRepository(config.snapshots),
        identifiers,
        now: () => new Date(),
        logger: createConsoleSafeLogger(),
      });
    },
  };
}
