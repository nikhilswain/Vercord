import type { WorldTown } from '../../../domain/world/protocol';
import type { RpgSample } from '../types';
import type { AtlasModel, AtlasRegion, Point } from './types';
import { buildTerritories } from './territory';

const cache = new WeakMap<
  RpgSample,
  { towns: WeakMap<WorldTown, AtlasModel>; demo?: AtlasModel }
>();
const colors = ['#b5c48c', '#c8ac87', '#96bbb1', '#d4a16b', '#9baecb', '#c29cb0'];
let revision = 0;
const colorFor = (key: string) => {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return colors[hash % colors.length]!;
};
const inside = (p: Point, sample: RpgSample) =>
  p.x >= sample.bounds.x &&
  p.y >= sample.bounds.y &&
  p.x < sample.bounds.x + sample.bounds.width &&
  p.y < sample.bounds.y + sample.bounds.height;

/** Immutable response identities invalidate labels/visibility. Movement and camera
 * updates reuse this model, including when the Map dialog is reopened. */
export function getAtlasModel(sample: RpgSample, town?: WorldTown): AtlasModel {
  const entries = cache.get(sample) ?? {
    towns: new WeakMap<WorldTown, AtlasModel>(),
    demo: undefined,
  };
  cache.set(sample, entries);
  const existing = town ? entries.towns.get(town) : entries.demo;
  if (existing) return existing;
  const landmarks = new Map(sample.landmarks.map((p) => [p.id, p]));
  const regions: AtlasRegion[] = [];
  const create = (id: string, name: string): AtlasRegion => ({
    id,
    name,
    color: sample.forest ? colors[0]! : colorFor(id),
    places: [],
    seeds: [],
    path: '',
    bounds: sample.bounds,
    center: sample.spawn,
  });
  if (town) {
    for (const district of [...town.districts].sort((a, b) => a.key.localeCompare(b.key))) {
      const region = create(district.key, district.label);
      for (const room of district.streets.flatMap((s) => s.rooms)) {
        const home = landmarks.get(room.landmarkId);
        if (!home || !inside(home, sample)) continue;
        region.places.push({
          id: room.key,
          landmarkId: home.id,
          name: room.label,
          kind: room.type,
          x: home.x,
          y: home.y,
        });
        region.seeds.push({ x: home.x, y: home.y });
      }
      region.seeds.push(...(district.anchors ?? []).filter((p) => inside(p, sample)));
      regions.push(region);
    }
  } else {
    const region = create('scene', sample.name);
    region.seeds.push(sample.spawn);
    regions.push(region);
  }
  // Public landmarks may decorate the chart; unbound channel houses never do.
  for (const place of sample.landmarks) {
    if (place.id.startsWith('house:') || !inside(place, sample) || !regions.length) continue;
    let nearest: AtlasRegion | undefined,
      best = Infinity;
    for (const region of regions)
      for (const seed of region.seeds) {
        const d = Math.hypot(seed.x - place.x, seed.y - place.y);
        if (d < best) {
          best = d;
          nearest = region;
        }
      }
    if (!nearest) continue;
    nearest.places.push({
      id: place.id,
      name: place.name,
      kind: 'landmark',
      x: place.x,
      y: place.y,
    });
    nearest.seeds.push(place);
  }
  const regionAt = sample.forest
    ? (() => {
        const region = regions[0]!;
        const b = sample.bounds;
        region.path = `M${b.x} ${b.y}h${b.width}v${b.height}h${-b.width}Z`;
        region.bounds = b;
        region.center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        return (point: Point) => (inside(point, sample) ? region : undefined);
      })()
    : buildTerritories(sample.bounds, regions);
  const roads =
    sample.terrain?.roads
      .map((r) => `M${r.x} ${r.y}h${r.width}v${r.height}h${-r.width}Z`)
      .join('') ?? '';
  const model = {
    revision: ++revision,
    bounds: sample.bounds,
    regions,
    regionAt,
    roads,
    local: !town,
    water: sample.adventure?.definition?.water ?? sample.demo?.jungle?.water,
  };
  if (town) entries.towns.set(town, model);
  else entries.demo = model;
  return model;
}
