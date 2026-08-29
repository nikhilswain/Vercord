import { describe, expect, it } from 'vitest';

import { mapSnapshotSchema } from '../../../src/domain/map/snapshot';
import { demoMapFixtureResult } from '../../../src/features/map/fixtures/demo-map';

describe('demo map fixture boundary', () => {
  it('exports one validated invented presentation fixture', () => {
    expect(demoMapFixtureResult.ok).toBe(true);
    if (!demoMapFixtureResult.ok) throw new Error('Expected the authored demo fixture to parse.');
    const snapshot = demoMapFixtureResult.snapshot;
    expect(mapSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.server.displayName).toBe('Northstar Commons');
    expect(snapshot.areas).toHaveLength(5);
    expect(snapshot.areas.some(({ rooms }) => rooms.length === 0)).toBe(true);
    expect(snapshot.areas.some(({ label }) => label === 'Uncategorized')).toBe(true);
    expect(new Set(snapshot.areas.flatMap(({ rooms }) => rooms.map(({ type }) => type)))).toEqual(
      new Set(['text', 'voice', 'announcement', 'stage', 'forum', 'media', 'unsupported']),
    );
    const serialized = JSON.stringify(snapshot);
    for (const forbidden of [
      'hmac-sha256-v1',
      'everyoneRoleKey',
      'permission_overwrites',
      'guildId',
      'ownerId',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toMatch(/\b\d{17,20}\b/u);
  });
});
