import type { AtlasModel, AtlasPin, PinDraft, PinKind } from './types';

export const PIN_LIMIT = 5;
export const pinCount = (pins: readonly AtlasPin[], kind: PinKind) =>
  pins.filter((p) => p.kind === kind).length;

export function loadPins(scope: string, model: AtlasModel): AtlasPin[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(`dmap.atlas.pins.v1/${scope}`) ?? '[]');
    if (!Array.isArray(data)) return [];
    const pins: AtlasPin[] = [],
      ids = new Set<string>();
    for (const value of data.slice(0, 100)) {
      if (!value || typeof value !== 'object') continue;
      const p = value as Partial<AtlasPin>;
      if (
        typeof p.id !== 'string' ||
        p.id.length > 100 ||
        ids.has(p.id) ||
        (p.kind !== 'location' && p.kind !== 'flower') ||
        typeof p.name !== 'string' ||
        typeof p.x !== 'number' ||
        typeof p.y !== 'number' ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y)
      )
        continue;
      if (pinCount(pins, p.kind) >= PIN_LIMIT || !model.regionAt({ x: p.x, y: p.y })) continue;
      ids.add(p.id);
      pins.push({ id: p.id, kind: p.kind, name: p.name.slice(0, 40), x: p.x, y: p.y });
    }
    return pins;
  } catch {
    return [];
  }
}
export function savePins(scope: string, pins: readonly AtlasPin[]): boolean {
  try {
    localStorage.setItem(`dmap.atlas.pins.v1/${scope}`, JSON.stringify(pins));
    return true;
  } catch {
    return false;
  }
}
export function upsertPin(
  pins: readonly AtlasPin[],
  draft: PinDraft,
  kind: PinKind,
  name: string,
): AtlasPin[] | null {
  const other = pins.filter((p) => p.id !== draft.existing?.id);
  if (pinCount(other, kind) >= PIN_LIMIT) return null;
  return [
    ...other,
    {
      id: draft.existing?.id ?? crypto.randomUUID(),
      x: draft.x,
      y: draft.y,
      kind,
      name: name.trim().slice(0, 40) || (kind === 'flower' ? 'Discovery' : 'Location'),
    },
  ];
}
