import { makeSample } from '../content/v1/builder';
import type { WorldScene } from '../document';
import { forestAreaName, isTempleAreaId, type ForestAreaId, type TempleAreaId } from './catalog';
import { buildForestLayout, type ForestPortal } from './layout';
import layouts from './temple-layouts.json';

/** Published, authored collision templates. Regenerate with scripts/export-temple-layouts.ts
 * when editing the original temple scenes; the parity test prevents client/server drift. */
export function buildTempleLayout(area: TempleAreaId): {
  scene: WorldScene;
  portals: ForestPortal[];
} {
  const layout = layouts[area];
  const portals: ForestPortal[] =
    area === 'temple'
      ? [
          { id: 'temple-return', target: 'rootbound-reach', x: 22 * 32, y: 39 * 32, doorway: true },
          {
            id: 'sanctuary-entry',
            target: 'temple-interior',
            x: 22 * 32,
            y: 10.3 * 32,
            doorway: true,
          },
        ]
      : [{ id: 'sanctuary-return', target: 'temple', x: 19 * 32, y: 32 * 32, doorway: true }];
  const scene: WorldScene = {
    ...makeSample('village', forestAreaName(area), 'The Hollow Choir', layout.spawn),
    bounds: layout.bounds,
    stamps: [],
    textures: [],
    lights: [],
    colliders: layout.colliders.map((rect, i) => ({ ...rect, id: `${area}-solid-${i}` })),
    landmarks: portals.map((portal) => ({
      ...portal,
      name: forestAreaName(portal.target),
      description: 'Follow the passage.',
      kind: 'portal',
      radius: 48,
    })),
  };
  return { scene, portals };
}

export function buildForestAreaLayout(seed: string, area: ForestAreaId) {
  return isTempleAreaId(area) ? buildTempleLayout(area) : buildForestLayout(seed, area);
}
