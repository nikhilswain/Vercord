// The public-label boundary must recognize literal C0 and C1 control ranges.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_DISPLAY_CODE_POINT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

export const MAP_AREA_LABEL_LIMIT = 24 as const;
export const MAP_ROOM_LABEL_LIMIT = 18 as const;

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function countUnicodeScalars(value: string): number {
  return Array.from(value).length;
}

export function isSafeMapDisplayText(value: string): boolean {
  const scalarCount = countUnicodeScalars(value);
  return (
    !hasUnpairedSurrogate(value) &&
    value === value.trim() &&
    scalarCount >= 1 &&
    scalarCount <= 100 &&
    !FORBIDDEN_DISPLAY_CODE_POINT.test(value)
  );
}

export function truncateMapLabel(value: string, maximumScalars: number): string {
  const scalars = Array.from(value);
  return scalars.length <= maximumScalars
    ? value
    : scalars.slice(0, maximumScalars - 1).join('') + '…';
}
