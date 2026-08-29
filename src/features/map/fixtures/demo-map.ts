import { mapSnapshotSchema, type MapSnapshot } from '../../../domain/map/snapshot';

const AUTHORED_DEMO_MAP = {
  schemaVersion: 1,
  slug: 'northstar-commons',
  generatedAt: '2026-08-29T09:00:00+05:30',
  server: { displayName: 'Northstar Commons' },
  areas: [
    {
      key: 'area-arrivals',
      label: 'Arrivals',
      order: 0,
      rooms: [
        { key: 'room-welcome', label: 'welcome', type: 'text', order: 0 },
        { key: 'room-broadcasts', label: 'broadcasts', type: 'announcement', order: 1 },
      ],
    },
    {
      key: 'area-workshop',
      label: 'Workshop',
      order: 1,
      rooms: [
        { key: 'room-lab', label: 'project lab', type: 'forum', order: 0 },
        { key: 'room-stage', label: 'showcase stage', type: 'stage', order: 1 },
        { key: 'room-gallery', label: 'media gallery', type: 'media', order: 2 },
      ],
    },
    {
      key: 'area-commons',
      label: 'Commons',
      order: 2,
      rooms: [
        { key: 'room-general', label: 'general chat', type: 'text', order: 0 },
        { key: 'room-lounge', label: 'voice lounge', type: 'voice', order: 1 },
      ],
    },
    {
      key: 'area-quiet-wing',
      label: 'Quiet Wing',
      order: 3,
      rooms: [],
    },
    {
      key: 'area-uncategorized',
      label: 'Uncategorized',
      order: 4,
      rooms: [{ key: 'room-oddments', label: 'oddments', type: 'unsupported', order: 0 }],
    },
  ],
} satisfies MapSnapshot;

export type DemoMapFixtureResult = { ok: true; snapshot: MapSnapshot } | { ok: false };

const parsedDemoMap = mapSnapshotSchema.safeParse(AUTHORED_DEMO_MAP);
export const demoMapFixtureResult: DemoMapFixtureResult = parsedDemoMap.success
  ? { ok: true, snapshot: parsedDemoMap.data }
  : { ok: false };
