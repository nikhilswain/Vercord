import { trailGround } from '../forest/portal-art';
import type { Point } from '../../world/engine/types';
import type { RpgSample, RpgStamp } from '../types';
import type { StationKind } from '../../../domain/adventure/crafting';
import { HOUSE_V2_TEXTURES } from '../../../domain/world/content/house-v2/assets';
import { townForestTrail } from '../../../domain/world/forest/town-entrance';

export interface ProvisionStation extends Point {
  id: string;
  name: string;
  kind: StationKind;
  region: string;
}
export function nearbyStation(sample: RpgSample, point: Point): ProvisionStation | undefined {
  return sample.provisionStations
    ?.filter((station) => Math.hypot(point.x - station.x, point.y - station.y) < 72)
    .sort(
      (a, b) => Math.hypot(point.x - a.x, point.y - a.y) - Math.hypot(point.x - b.x, point.y - b.y),
    )[0];
}

/** A small courtyard uses the same bounded, flood-filled empty-space search as
 * the gate. It receives the gate's art/roads as obstacles and never moves a house. */
export function withProvisionCamp(sample: RpgSample, town = false): RpgSample {
  let center: Point;
  let roads = sample.terrain?.roads ?? [];
  let paving: RpgStamp[] = [];
  if (town) {
    const site = townForestTrail(sample, 'provisions');
    center = site.entrance;
    roads = [...roads, ...site.roads];
    if (!sample.terrain) paving = trailGround(site.roads);
  } else if (sample.forest) center = sample.forest.camp;
  else return sample;
  const region = town ? 'town' : sample.forest!.region;
  const key = `provisions:${region}`;
  const brew = {
    id: `${key}:brew`,
    name: town ? 'Town brewing bench' : 'Camp brewing bench',
    kind: 'brew' as const,
    region,
    x: center.x - (town ? 40 : 64),
    y: center.y + 18,
  };
  const cook = {
    id: `${key}:cook`,
    name: town ? 'Town cooking hearth' : 'Camp cooking hearth',
    kind: 'cook' as const,
    region,
    x: center.x + (town ? 48 : 64),
    y: center.y + 18,
  };
  const stamp = (
    asset: string,
    frame: string,
    dx: number,
    dy: number,
    depth?: number,
  ): RpgStamp => ({
    texture: `house-v2-${asset}`,
    frame,
    x: center.x + dx,
    y: center.y + dy,
    depth: depth ?? center.y + dy + 48,
  });
  const decor = town
    ? [
        stamp('workbench', 'bench', -80, -60),
        stamp('clutter', 'bottles', -68, -74),
        stamp('clutter', 'herbs', -36, -70),
        stamp('clutter', 'basket', -76, 26),
        stamp('chair', 'amber', 40, 26),
      ]
    : [
        stamp('workbench', 'bench', -108, -68),
        stamp('clutter', 'bottles', -90, -82),
        stamp('clutter', 'herbs', -52, -77),
        stamp('clutter', 'basket', -94, 44),
        stamp('chair', 'moss', 36, 50),
        stamp('chair', 'amber', 88, 50),
        stamp('candles', 'lantern', -16, -72),
      ];
  if (!town) decor.push(stamp('bed', 'moss', -32, -150));
  return {
    ...sample,
    textures: [
      ...sample.textures,
      ...HOUSE_V2_TEXTURES.filter((t) => !sample.textures.some((s) => s.key === t.key)),
    ],
    stamps: [...sample.stamps, ...paving, ...decor],
    colliders: [
      ...sample.colliders,
      { x: center.x - (town ? 80 : 108), y: center.y - 48, width: 96, height: 40 },
      { x: center.x + (town ? 31 : 47), y: center.y - 23, width: 34, height: 24 },
      ...(!town ? [{ x: center.x - 26, y: center.y - 120, width: 52, height: 50 }] : []),
    ],
    ...(sample.terrain ? { terrain: { ...sample.terrain, roads } } : {}),
    provisionStations: [brew, cook],
    animatedScenery: [
      ...(sample.animatedScenery ?? []),
      {
        ...stamp('cauldron', 'pot1', town ? 30 : 46, -44),
        frames: ['pot1', 'pot2', 'pot3', 'pot4'],
        durationMs: 840,
      },
      {
        ...stamp('cauldron', 'pot1', town ? -32 : -52, -74),
        frames: ['pot1', 'pot2', 'pot3', 'pot4'],
        durationMs: 1100,
        ...(region === 'verge' ? { requiresProject: 'verge-bench', inactiveFrame: 'pot0' } : {}),
      },
    ],
    landmarks: [
      ...sample.landmarks,
      ...[brew, cook].map((s) => ({
        ...s,
        description:
          s.kind === 'brew'
            ? 'Prepare bottles here. Recipes and ingredients are shown at the bench.'
            : 'Cook a meal or rest safely by the hearth.',
        radius: 64,
        kind: 'view' as const,
      })),
    ],
    signage: [
      ...(sample.signage ?? []).filter((s) => s.text !== 'Trail shelter'),
      {
        x: center.x,
        y: center.y - (town ? 88 : 178),
        text: town ? 'Provisions' : 'Trail camp',
        detail: 'Brew · Cook · Rest',
        kind: 'place',
        maxWidth: town ? 150 : 205,
      },
    ],
  };
}
