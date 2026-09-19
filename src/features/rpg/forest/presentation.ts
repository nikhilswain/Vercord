import { withProvisionCamp } from '../provisions/stations';
import { buildForestLayout } from '../../../domain/world/forest/layout';
import { townForestTrail } from '../../../domain/world/forest/town-entrance';
import { FOREST_PORTAL_TEXTURES, forestPortalArt, trailGround } from './portal-art';
import {
  forestAreaName,
  isTempleAreaId,
  forestSceneId,
  type ForestVisit,
} from '../../../domain/world/forest/catalog';
import type { RpgSample } from '../types';
import { populateForest } from './population';
import { templeSamples } from './temple-presentation';

export const PREVIEW_FOREST_SEED = '92a49e2c-0719-4a66-b9b6-24c824af63d0';

export function presentForest(visit: ForestVisit): RpgSample {
  if (isTempleAreaId(visit.region)) return templeSamples.find((s) => s.temple === visit.region)!;
  const layout = buildForestLayout(visit.seed, visit.region);
  const content = populateForest(layout, visit.seed);
  return withProvisionCamp({
    ...layout.scene,
    textures: [...layout.scene.textures, ...FOREST_PORTAL_TEXTURES],
    stamps: [...layout.scene.stamps, ...layout.portals.flatMap((p) => forestPortalArt(p))],
    sceneId: forestSceneId(visit.region),
    adventure: { id: forestSceneId(visit.region), definition: content },
    forest: { region: visit.region, sites: layout.sites, camp: layout.camp },
    forestPortals: layout.portals,
    signage: [
      ...layout.portals.map((p) => ({
        x: p.x,
        y: p.y - 164,
        text: p.target === 'town' ? 'Return to town' : forestAreaName(p.target),
        detail: 'Forest waygate · E',
        kind: 'place' as const,
        maxWidth: 215,
      })),
      {
        x: layout.camp.x,
        y: layout.camp.y - 110,
        text: 'Trail shelter',
        detail: 'A quiet place to rest',
        kind: 'place',
        maxWidth: 190,
      },
      ...layout.sites
        .filter((p) => p.id !== 'rootbound-reach-site-0')
        .map((p) => ({
          x: p.x,
          y: p.y - 128,
          text: p.name,
          kind: 'place' as const,
          maxWidth: 220,
        })),
    ],
  });
}

export function withForestTrail(sample: RpgSample): RpgSample {
  const { entrance, roads, gateScale = 1 } = townForestTrail(sample);
  return withProvisionCamp(
    {
      ...sample,
      textures: [...sample.textures, ...FOREST_PORTAL_TEXTURES],
      ...(sample.terrain
        ? { terrain: { ...sample.terrain, roads: [...sample.terrain.roads, ...roads] } }
        : {}),
      stamps: [
        ...sample.stamps,
        ...(!sample.terrain ? trailGround(roads) : []),
        ...forestPortalArt(entrance, gateScale),
      ],
      adventure: { id: 'town' },
      forestPortals: [{ ...entrance, id: 'mosswild-trail', target: 'verge' }],
      landmarks: [
        ...sample.landmarks,
        {
          ...entrance,
          id: 'mosswild-trail',
          name: 'Mosswild Forest',
          description:
            'Follow the trail into the forest. Open Map there to find connecting regions and the way home.',
          radius: 82,
          kind: 'portal',
        },
      ],
      signage: [
        ...(sample.signage ?? []),
        {
          x: entrance.x,
          y: entrance.y - 164 * gateScale,
          text: 'Mosswild Forest',
          detail: 'Forest waygate · E',
          kind: 'place',
          maxWidth: 220 * gateScale,
        },
      ],
    },
    true,
  );
}
