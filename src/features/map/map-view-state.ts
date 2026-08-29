import { mapSnapshotSchema, type MapSnapshot } from '../../domain/map/snapshot';

export type MapSource = 'fixture' | 'public';
export type MapViewState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: MapSnapshot; source: MapSource; stale: boolean }
  | { status: 'empty'; source: MapSource }
  | { status: 'invalid' }
  | { status: 'unavailable' };

export function createMapViewState(input: unknown, source: MapSource, stale = false): MapViewState {
  const parsed = mapSnapshotSchema.safeParse(input);
  if (!parsed.success) return { status: 'invalid' };
  if (parsed.data.areas.length === 0) return { status: 'empty', source };
  return {
    status: 'ready',
    snapshot: parsed.data,
    source,
    stale: source === 'public' && stale,
  };
}
