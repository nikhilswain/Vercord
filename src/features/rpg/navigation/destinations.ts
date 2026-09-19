import { sampleSceneId } from '../../../domain/world/catalog/scenes';
import {
  forestAreaNeighbors,
  forestAreaName,
  type ForestDestination,
} from '../../../domain/world/forest/catalog';
import type { Point } from '../../../domain/world/content/v1/types';
import type { RpgSample } from '../types';
import type { NavigationContext, NavigationTarget } from './types';

export const navigationScene = (sample: RpgSample) => sample.demo?.area ?? sampleSceneId(sample);
const areaOf = (sample: RpgSample): ForestDestination | undefined =>
  sample.temple ??
  sample.forest?.region ??
  (sample.forestPortals?.some((p) => p.target === 'verge') ? 'town' : undefined);

export function pointDestination(
  sample: RpgSample,
  place: Point & { id: string; name: string },
  kind: 'place' | 'pin' = 'place',
): NavigationTarget {
  return {
    id: `${kind}:${place.id}`,
    name: place.name,
    kind,
    scene: navigationScene(sample),
    point: { x: place.x, y: place.y },
    radius: kind === 'pin' ? 48 : 56,
    area: areaOf(sample),
  };
}

export const regionDestination = (area: ForestDestination): NavigationTarget => ({
  kind: 'region',
  id: `region:${area}`,
  area,
  name: forestAreaName(area),
});

/** The small region graph only chooses a gate; local geometry owns the walk to it. */
export function regionRoute(from: ForestDestination, to: ForestDestination): ForestDestination[] {
  const queue: ForestDestination[][] = [[from]];
  const seen = new Set<ForestDestination>([from]);
  for (let index = 0; index < queue.length; index++) {
    const route = queue[index]!;
    const current = route.at(-1)!;
    if (current === to) return route;
    const neighbors = forestAreaNeighbors(current);
    for (const next of neighbors) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([...route, next]);
    }
  }
  return [];
}

export function navigationContext(
  sample: RpgSample,
  paths: NavigationContext['paths'],
): NavigationContext {
  const scene = navigationScene(sample);
  const area = areaOf(sample);
  return {
    scene,
    paths,
    resolve(target) {
      if (target.kind === 'story') {
        if (target.scene === scene) {
          const point = target.siteId
            ? sample.forest?.sites.find((site) => site.id === target.siteId)
            : target.point;
          return point ? { id: target.id, point, radius: target.radius } : null;
        }
        if (sample.demo && !area) {
          // The authored demo has one connected, bidirectional route. Admission still belongs to its gates.
          const route = ['village', 'jungle', 'fern-hollow', 'temple', 'temple-interior'];
          const from = route.indexOf(sample.demo.area),
            to = route.indexOf(target.scene);
          const next = from >= 0 && to >= 0 ? route[from + Math.sign(to - from)] : undefined;
          const portal = sample.demo.portals.find((p) => p.target === next);
          const point = sample.landmarks.find((p) => p.id === portal?.id);
          if (point) return { id: point.id, point, radius: 44, portal: point.name };
        }
      }
      if (target.kind !== 'region' && target.scene === scene) {
        // Current landmark membership also catches a removed or permission-filtered house.
        if (target.kind === 'place' && !sample.landmarks.some((p) => `place:${p.id}` === target.id))
          return null;
        const place =
          target.kind === 'place'
            ? sample.landmarks.find((p) => `place:${p.id}` === target.id)
            : undefined;
        return {
          id: target.id,
          point: place ? { x: place.x, y: place.y } : target.point,
          radius: target.radius,
        };
      }
      if (!area || !target.area) return null;
      if (target.kind === 'region' && target.area === area) return 'arrived';
      const next = regionRoute(area, target.area)[1];
      const portal = sample.forestPortals?.find((p) => p.target === next);
      if (!portal) return null;
      return {
        id: portal.id,
        point: portal,
        radius: 44,
        portal: forestAreaName(next!),
      };
    },
  };
}
