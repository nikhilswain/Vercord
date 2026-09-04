import { createIdentifierFactory } from '../../src/domain/discord/identifiers';
import { normalizeGuildStructure } from '../../src/domain/discord/normalize';
import type { DiscordSourceBundle } from '../../src/domain/discord/source';
import {
  parseGuildStructureSnapshot,
  type GuildStructureSnapshot,
} from '../../src/domain/discord/snapshot';
import { decodeBase64UrlSecret } from '../config/runtime';
import { createDiscordRestClient } from '../discord/client';
import { createKvGuildStructureRepository } from '../storage/guild-structure-repository';
import { createD1WorldRepository } from '../worlds/repository';

export interface LiveGuildStructure {
  source: DiscordSourceBundle;
  snapshot: GuildStructureSnapshot;
}

/** Guild-scoped DO owner. Raw source is transient server memory, never a browser payload. */
export class LiveStructureCache {
  private cached: { guildId: string; value: LiveGuildStructure; expiresAt: number } | null = null;
  private inFlight: Promise<LiveGuildStructure> | null = null;
  private generation = 0;
  private persistedFingerprint: string | null = null;
  private lastPersistenceAt = 0;

  public constructor(private readonly env: Env) {}

  public invalidate(): void {
    this.generation += 1;
    this.cached = null;
  }

  public async read(guildId: string): Promise<LiveGuildStructure> {
    if (this.cached?.guildId === guildId && this.cached.expiresAt > Date.now())
      return this.cached.value;
    if (this.inFlight !== null) return this.inFlight;
    const request = this.refresh(guildId);
    this.inFlight = request;
    try {
      return await request;
    } finally {
      if (this.inFlight === request) this.inFlight = null;
    }
  }

  private async refresh(guildId: string): Promise<LiveGuildStructure> {
    const world = await createD1WorldRepository(this.env.AUTH_DB).read(guildId);
    if (world === null) throw new Error('WORLD_NOT_FOUND');
    const identifiers = await createIdentifierFactory(
      decodeBase64UrlSecret(this.env.SNAPSHOT_ID_SECRET),
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const generation = this.generation;
      const source = await createDiscordRestClient({
        botToken: this.env.DISCORD_BOT_TOKEN,
      }).fetchGuildSource(guildId);
      const snapshot = await normalizeGuildStructure(source, {
        identifiers,
        generatedAt: new Date().toISOString(),
      });
      if (generation !== this.generation) continue;
      // Compatibility storage for previews/manual reads. Live maps and voice do not depend on
      // KV propagation or its one-write-per-key-per-second limit. Retry persistence on later reads.
      const fingerprint = JSON.stringify({ ...snapshot, generatedAt: '' });
      if (
        fingerprint !== this.persistedFingerprint &&
        Date.now() - this.lastPersistenceAt >= 1_100
      ) {
        this.lastPersistenceAt = Date.now();
        try {
          await createKvGuildStructureRepository(this.env.MAP_SNAPSHOTS).write(
            world.mapSlug,
            snapshot,
          );
          this.persistedFingerprint = fingerprint;
        } catch {
          console.warn(
            JSON.stringify({ service: 'dmap-worker', event: 'channel_snapshot_persist_failed' }),
          );
        }
      }
      if (generation !== this.generation) continue;
      const value = { source, snapshot };
      this.cached = { guildId, value, expiresAt: Date.now() + 15_000 };
      return value;
    }
    throw new Error('WORLD_CHANGING');
  }
}

export async function guildPresenceStub(env: Env, guildId: string): Promise<DurableObjectStub> {
  const identifiers = await createIdentifierFactory(decodeBase64UrlSecret(env.SNAPSHOT_ID_SECRET));
  return env.WORLD_PRESENCE.getByName(await identifiers.for('guild', guildId));
}

export async function readLiveStructure(env: Env, guildId: string): Promise<LiveGuildStructure> {
  const stub = await guildPresenceStub(env, guildId);
  const response = await stub.fetch('https://presence.dmap/internal/channel-state', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guildId }),
  });
  if (!response.ok) throw new Error('WORLD_UNAVAILABLE');
  // Both producer and consumer are server-owned; Discord responses are validated at ingestion.
  const value = (await response.json()) as LiveGuildStructure;
  if (value.source.guild.id !== guildId) throw new Error('WORLD_UNAVAILABLE');
  return { source: value.source, snapshot: parseGuildStructureSnapshot(value.snapshot) };
}

export async function invalidateLiveStructure(env: Env, guildId: string): Promise<void> {
  const stub = await guildPresenceStub(env, guildId);
  const response = await stub.fetch('https://presence.dmap/internal/channels-changed', {
    method: 'POST',
  });
  if (!response.ok) throw new Error('WORLD_UNAVAILABLE');
}
