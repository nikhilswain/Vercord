import { describe, expect, it } from 'vitest';

import {
  MAP_AREA_LABEL_LIMIT,
  MAP_ROOM_LABEL_LIMIT,
  countUnicodeScalars,
  isSafeMapDisplayText,
  truncateMapLabel,
} from '../../../../src/domain/map/labels';

describe('safe map labels', () => {
  it('counts Unicode scalars rather than UTF-16 code units', () => {
    expect(countUnicodeScalars('A🧭B')).toBe(3);
    expect(isSafeMapDisplayText('🧭'.repeat(100))).toBe(true);
    expect(isSafeMapDisplayText('🧭'.repeat(101))).toBe(false);
  });

  it.each([
    '',
    ' leading',
    'trailing ',
    'line\nbreak',
    'c1\u0085control',
    'override\u202esegment',
    'isolate\u2066segment',
    '\ud800',
    '\udc00',
  ])('rejects unsafe display text %j', (value) => {
    expect(isSafeMapDisplayText(value)).toBe(false);
  });

  it('accepts paired surrogates and exact scalar limits', () => {
    expect(isSafeMapDisplayText('🧭')).toBe(true);
    expect(isSafeMapDisplayText('A'.repeat(100))).toBe(true);
  });

  it('truncates at the area and room limits with one terminal ellipsis', () => {
    expect(truncateMapLabel('A'.repeat(24), MAP_AREA_LABEL_LIMIT)).toBe('A'.repeat(24));
    expect(truncateMapLabel('A'.repeat(25), MAP_AREA_LABEL_LIMIT)).toBe('A'.repeat(23) + '…');
    expect(truncateMapLabel('🧭'.repeat(18), MAP_ROOM_LABEL_LIMIT)).toBe('🧭'.repeat(18));
    expect(truncateMapLabel('🧭'.repeat(19), MAP_ROOM_LABEL_LIMIT)).toBe('🧭'.repeat(17) + '…');
  });
});
