import { ENTITY_DEFINITIONS, type EntityKind } from '../../../domain/world/catalog/entities';
import {
  ambientPopulationFor,
  type AmbientPopulationEntry,
} from '../../../domain/world/catalog/population';
import { isHouseSceneId, sampleSceneId } from '../../../domain/world/catalog/scenes';
import {
  containsRect,
  footprint,
  overlaps,
  WORLD_PLAYER_FEET,
} from '../../../domain/world/geometry';
import { seededRandom } from '../../../domain/world/random';
import type { Point, Rect } from '../../../domain/world/content/v1/types';
import { RpgPathfinder } from '../pathfinding';
import type { RpgAction, RpgDirection, RpgSample } from '../types';

export interface AmbientEntity extends Point {
  id: string;
  kind: EntityKind;
  name: string;
  role: string;
  appearance?: string;
  color?: number;
  direction: RpgDirection;
  action: RpgAction;
  lines: string[];
}
interface Segment {
  from: Point;
  to: Point;
  direction: RpgDirection;
  action: RpgAction;
  start: number;
  end: number;
}
interface Schedule {
  entity: AmbientEntity;
  segments: Segment[];
  duration: number;
  phase: number;
}
const HOME_ATTEMPTS = 24;
const ROUTE_ATTEMPTS = 12;
const MAX_PATH_POINTS = 24;
const TAU = Math.PI * 2;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const exclusion = (point: Point, radius: number): Rect => ({
  x: point.x - radius,
  y: point.y - radius,
  width: radius * 2,
  height: radius * 2,
});
function directionToward(from: Point, to: Point): RpgDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}

/** Routes are planned once. Absolute time makes decorative motion independent of frame history. */
export class AmbientSimulation {
  public readonly entities: AmbientEntity[] = [];
  private readonly schedules: Schedule[] = [];

  public constructor(sample: RpgSample, seed: string) {
    const sceneId = sampleSceneId(sample);
    const population = ambientPopulationFor(sample.id, sceneId);
    if (population.length === 0) return;
    const obstacles = [
      ...sample.colliders,
      ...sample.npcs.map(footprint),
      exclusion(sample.spawn, 40),
      ...sample.landmarks
        .filter((landmark) => isHouseSceneId(landmark.id) || landmark.kind === 'portal')
        .map((landmark) => exclusion(landmark, 24)),
    ];
    // Human feet contain both animal footprints. All actors share this one conservative index.
    const pathfinder = new RpgPathfinder(sample.bounds, obstacles, WORLD_PLAYER_FEET);
    const safe = (point: Point) => {
      const feet = footprint(point);
      const padded = {
        x: feet.x - 2,
        y: feet.y - 2,
        width: feet.width + 4,
        height: feet.height + 4,
      };
      return (
        containsRect(sample.bounds, padded) &&
        !pathfinder.queryColliders(padded).some((box) => overlaps(padded, box))
      );
    };
    const homes: Point[] = [];
    for (const [index, entry] of population.entries()) {
      const random = seededRandom(`${seed}:ambient-v1:${sceneId}:${entry.id}`);
      let home: Point | undefined;
      for (let attempt = 0; attempt < HOME_ATTEMPTS; attempt++) {
        const angle = (index / population.length + random() * 0.35) * TAU;
        const radius = 80 + random() * 144;
        const candidate = {
          x: Math.round((sample.spawn.x + Math.cos(angle) * radius) / 16) * 16 + 8,
          y: Math.round((sample.spawn.y + Math.sin(angle) * radius) / 16) * 16 + 8,
        };
        if (safe(candidate) && homes.every((other) => distance(other, candidate) >= 32)) {
          home = candidate;
          break;
        }
      }
      if (!home) continue;
      homes.push(home);
      const entity: AmbientEntity = {
        id: `ambient:${sceneId}:${entry.id}`,
        kind: entry.kind,
        name: entry.name,
        role: entry.role,
        ...(entry.appearance ? { appearance: entry.appearance } : {}),
        ...(entry.color === undefined ? {} : { color: entry.color }),
        ...home,
        direction: 'down',
        action: 'idle',
        lines: [...entry.lines],
      };
      this.entities.push(entity);
      this.schedules.push(this.plan(entity, home, entry, random, safe, pathfinder));
    }
    this.update(0);
  }

  public update(timeMs: number): void {
    if (!Number.isFinite(timeMs)) return;
    for (const schedule of this.schedules) {
      const time =
        (((timeMs + schedule.phase) % schedule.duration) + schedule.duration) % schedule.duration;
      const segment = schedule.segments.find((candidate) => time < candidate.end)!;
      const fraction = (time - segment.start) / (segment.end - segment.start);
      const entity = schedule.entity;
      entity.x = segment.from.x + (segment.to.x - segment.from.x) * fraction;
      entity.y = segment.from.y + (segment.to.y - segment.from.y) * fraction;
      entity.direction = segment.direction;
      entity.action = segment.action;
    }
  }

  private plan(
    entity: AmbientEntity,
    home: Point,
    entry: AmbientPopulationEntry,
    random: () => number,
    safe: (point: Point) => boolean,
    pathfinder: RpgPathfinder,
  ): Schedule {
    const navigation = ENTITY_DEFINITIONS[entry.kind].navigation;
    const segments: Segment[] = [];
    let elapsed = 0;
    let position = home;
    let direction: RpgDirection = 'down';
    const add = (to: Point, duration: number, action: RpgAction) => {
      if (action !== 'idle') direction = directionToward(position, to);
      segments.push({
        from: position,
        to,
        direction,
        action,
        start: elapsed,
        end: elapsed + duration,
      });
      position = to;
      elapsed += duration;
    };
    const pause = () =>
      add(
        position,
        navigation.pauseMs[0] + random() * (navigation.pauseMs[1] - navigation.pauseMs[0]),
        'idle',
      );
    pause();
    let routes = 0;
    const desiredRoutes = entry.behavior === 'idle' ? 0 : entry.behavior === 'patrol' ? 1 : 2;
    for (let attempt = 0; attempt < ROUTE_ATTEMPTS && routes < desiredRoutes; attempt++) {
      const angle = random() * TAU;
      const radius = 32 + random() * (navigation.wanderRadius - 32);
      const target = { x: home.x + Math.cos(angle) * radius, y: home.y + Math.sin(angle) * radius };
      if (!safe(target)) continue;
      const path = pathfinder.findPath(home, target, navigation.maxPathNodes);
      if (
        path.length === 0 ||
        path.length > MAX_PATH_POINTS ||
        path.some((point) => distance(home, point) > navigation.wanderRadius)
      )
        continue;
      if (routes > 0) pause();
      for (const point of path)
        add(point, (distance(position, point) / navigation.speed) * 1000, 'walk');
      pause();
      // Reverse the same validated edges; closing a route never introduces a shortcut through walls.
      for (const point of [home, ...path.slice(0, -1)].reverse())
        add(point, (distance(position, point) / navigation.speed) * 1000, 'walk');
      routes++;
    }
    return { entity, segments, duration: elapsed, phase: random() * elapsed };
  }
}
