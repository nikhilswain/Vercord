import { parseMapSnapshot, type MapSnapshot } from '../../src/domain/map/snapshot';
import { WorkerError } from '../errors';

export type PublicMapReadResult =
  | { state: 'missing' }
  | { state: 'valid'; snapshot: MapSnapshot }
  | { state: 'invalid' };

export interface PublicMapRepository {
  read(slug: string): Promise<PublicMapReadResult>;
  write(slug: string, snapshot: MapSnapshot): Promise<void>;
}

export function publicMapSnapshotKey(slug: string): string {
  return `public-map:v1:${slug}`;
}

export function createKvPublicMapRepository(kv: KVNamespace): PublicMapRepository {
  return {
    async read(slug) {
      let text: string | null;
      try {
        text = await kv.get(publicMapSnapshotKey(slug), 'text');
      } catch {
        throw new WorkerError('SNAPSHOT_READ_FAILED');
      }
      if (text === null) return { state: 'missing' };

      try {
        return { state: 'valid', snapshot: parseMapSnapshot(JSON.parse(text)) };
      } catch {
        return { state: 'invalid' };
      }
    },

    async write(slug, snapshot) {
      const json = JSON.stringify(parseMapSnapshot(snapshot));
      try {
        await kv.put(publicMapSnapshotKey(slug), json);
      } catch {
        throw new WorkerError('SNAPSHOT_WRITE_FAILED');
      }
    },
  };
}
