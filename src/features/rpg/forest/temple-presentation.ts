import { forestSceneId, type TempleAreaId } from '../../../domain/world/forest/catalog';
import { buildTempleLayout } from '../../../domain/world/forest/temple';
import { buildTempleDemo } from '../demo/forest-expansion';
import { buildTempleInterior } from '../demo/temple-interior';
import type { RpgSample } from '../types';

/** The same authored encounters and art, admitted as scenes of the member's server world. */
export function presentTemple(area: TempleAreaId): RpgSample {
  const authored = area === 'temple' ? buildTempleDemo() : buildTempleInterior();
  const { scene, portals } = buildTempleLayout(area);
  const content = authored.demo!.jungle!;
  const sample: RpgSample = {
    ...authored,
    bounds: scene.bounds,
    spawn: scene.spawn,
    colliders: scene.colliders,
    sceneId: forestSceneId(area),
    temple: area,
    adventure: { id: forestSceneId(area), definition: content },
    forestPortals: portals,
    landmarks: scene.landmarks,
    signage: authored.signage?.map((label) =>
      label.text === 'Fern Hollow'
        ? {
            ...label,
            x: label.x + 132,
            y: label.y + 88,
            text: 'Rootbound Reach',
            detail: 'Return to the forest · E',
          }
        : label,
    ),
  };
  delete sample.demo;
  return sample;
}

export const templeSamples = [presentTemple('temple'), presentTemple('temple-interior')];
