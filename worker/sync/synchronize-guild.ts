import { DiscordDomainError } from '../../src/domain/discord/errors';
import type { IdentifierFactory } from '../../src/domain/discord/identifiers';
import { normalizeGuildStructure } from '../../src/domain/discord/normalize';
import { parseGuildStructureSnapshot } from '../../src/domain/discord/snapshot';
import { validateDiscordSourceBundle } from '../../src/domain/discord/source-schema';
import type { RuntimeConfig } from '../config/runtime';
import type { DiscordGuildSourceClient } from '../discord/client';
import { WorkerError } from '../errors';
import type { SafeLogFields, SafeLogger } from '../logging/safe-logger';
import { createPublicMapSnapshot } from '../publication/create-public-map';
import type { GuildStructureRepository } from '../storage/guild-structure-repository';
import type { PublicMapRepository } from '../storage/public-map-repository';

export interface SyncSummary {
  status: 'SNAPSHOT_STORED';
  schemaVersion: 1;
  generatedAt: string;
  categoryCount: number;
  channelCount: number;
  publishedAreaCount?: number;
  publishedRoomCount?: number;
}

export interface SyncPorts {
  discord: DiscordGuildSourceClient;
  snapshots: GuildStructureRepository;
  publicMaps?: PublicMapRepository;
  identifiers: IdentifierFactory;
  now(): Date;
  logger: SafeLogger;
}

function durationSince(startedAt: number): number {
  return Math.max(0, performance.now() - startedAt);
}

function failureOutcome(error: unknown): string {
  if (error instanceof WorkerError || error instanceof DiscordDomainError) return error.code;
  return 'SYNC_FAILED';
}

function safelyLog(log: () => void): void {
  try {
    log();
  } catch {
    // Logging is best-effort and must not replace the synchronization result.
  }
}

export async function synchronizeGuild(
  config: Pick<RuntimeConfig, 'guildId' | 'mapSlug'> &
    Partial<Pick<RuntimeConfig, 'publicationAllowlist'>>,
  ports: SyncPorts,
): Promise<SyncSummary> {
  const correlationId = crypto.randomUUID();
  const startedAt = performance.now();

  try {
    const source = validateDiscordSourceBundle(
      await ports.discord.fetchGuildSource(config.guildId),
      config.guildId,
    );
    const generatedAt = ports.now().toISOString();
    const snapshot = parseGuildStructureSnapshot(
      await normalizeGuildStructure(source, {
        generatedAt,
        identifiers: ports.identifiers,
      }),
    );
    const previous = await ports.snapshots.read(config.mapSlug);
    const isEmpty = snapshot.channels.length === 0;
    const previousMayContainData =
      previous.state === 'invalid' ||
      (previous.state === 'valid' && previous.snapshot.channels.length > 0);

    if (isEmpty && previousMayContainData) {
      throw new WorkerError('SUSPICIOUS_EMPTY_SNAPSHOT');
    }

    let publicationSummary: Pick<SyncSummary, 'publishedAreaCount' | 'publishedRoomCount'> = {};
    if (ports.publicMaps) {
      const publicMap = await createPublicMapSnapshot(snapshot, {
        slug: config.mapSlug,
        allowlist: config.publicationAllowlist ?? { categoryIds: [], channelIds: [] },
        identifiers: ports.identifiers,
      });
      await ports.publicMaps.write(config.mapSlug, publicMap);
      publicationSummary = {
        publishedAreaCount: publicMap.areas.length,
        publishedRoomCount: publicMap.areas.reduce(
          (total, area) => total + area.rooms.length,
          0,
        ),
      };
    }
    await ports.snapshots.write(config.mapSlug, snapshot);

    const categoryCount = snapshot.channels.filter(({ kind }) => kind === 'category').length;
    const channelCount = snapshot.channels.length - categoryCount;
    const summary: SyncSummary = {
      status: 'SNAPSHOT_STORED',
      schemaVersion: 1,
      generatedAt: snapshot.generatedAt,
      categoryCount,
      channelCount,
      ...publicationSummary,
    };
    const fields: SafeLogFields = {
      correlationId,
      outcome: summary.status,
      durationMs: durationSince(startedAt),
      categoryCount,
      channelCount,
    };
    safelyLog(() => ports.logger.info('discord_sync_complete', fields));
    return summary;
  } catch (error) {
    const fields: SafeLogFields = {
      correlationId,
      outcome: failureOutcome(error),
      durationMs: durationSince(startedAt),
    };
    safelyLog(() => ports.logger.error('discord_sync_failed', fields));
    throw error;
  }
}
