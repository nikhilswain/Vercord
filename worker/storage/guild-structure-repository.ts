import {
  parseGuildStructureSnapshot,
  type GuildStructureSnapshot,
} from '../../src/domain/discord/snapshot';
import { WorkerError } from '../errors';

export type SnapshotReadResult =
  | { state: 'missing' }
  | { state: 'valid'; snapshot: GuildStructureSnapshot }
  | { state: 'invalid' };

export interface GuildStructureRepository {
  read(slug: string): Promise<SnapshotReadResult>;
  write(slug: string, snapshot: GuildStructureSnapshot): Promise<void>;
}

export function guildStructureSnapshotKey(slug: string): string {
  return `guild-structure:v1:${slug}`;
}

export function createKvGuildStructureRepository(
  kv: KVNamespace,
): GuildStructureRepository {
  return {
    async read(slug) {
      let text: string | null;
      try {
        text = await kv.get(guildStructureSnapshotKey(slug), 'text');
      } catch {
        throw new WorkerError('SNAPSHOT_READ_FAILED');
      }
      if (text === null) return { state: 'missing' };
      try {
        return {
          state: 'valid',
          snapshot: parseGuildStructureSnapshot(JSON.parse(text)),
        };
      } catch {
        return { state: 'invalid' };
      }
    },

    async write(slug, snapshot) {
      const json = JSON.stringify(parseGuildStructureSnapshot(snapshot));
      try {
        await kv.put(guildStructureSnapshotKey(slug), json);
      } catch {
        throw new WorkerError('SNAPSHOT_WRITE_FAILED');
      }
    },
  };
}
