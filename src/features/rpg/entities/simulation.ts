import { ENTITY_DEFINITIONS, type EntityKind } from '../../../domain/world/catalog/entities';
import {
  ambientPopulationFor,
  type AmbientInteraction,
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
  interaction: AmbientInteraction;
}
export interface AmbientHoldOptions {
  durationMs?: number;
  facing?: Point;
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
  pausedMs: number;
  held?: { until: number };
}
const HOME_ATTEMPTS = 40;
const HOME_SEPARATION = 176;
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

/** Farthest-first landmarks cover the saved neighborhoods without depending on member labels. */
function populationAnchors(sample: RpgSample, count: number): Point[] {
  const candidates = sample.landmarks
    .map((landmark) => ({ ...landmark, nearest: Infinity }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (candidates.length === 0) return [sample.spawn];
  const anchors: Point[] = [];
  const add = (candidate: (typeof candidates)[number]) => {
    anchors.push(candidate);
    for (const other of candidates)
      other.nearest = Math.min(other.nearest, distance(other, candidate));
  };
  add(
    candidates.reduce((nearest, candidate) =>
      distance(candidate, sample.spawn) < distance(nearest, sample.spawn) ? candidate : nearest,
    ),
  );
  const square = candidates.find((candidate) => candidate.id === 'town-square');
  if (square && square.nearest > 0 && count > 1) add(square);
  while (anchors.length < Math.min(count, candidates.length)) {
    const next = candidates.reduce((furthest, candidate) =>
      candidate.nearest > furthest.nearest ? candidate : furthest,
    );
    if (next.nearest === 0) break;
    add(next);
  }
  return anchors;
}

/** Routes are planned once. Absolute time makes decorative motion independent of frame history. */
export class AmbientSimulation {
  public readonly entities: AmbientEntity[] = [];
  private readonly schedules: Schedule[] = [];
  private time = 0;

  public constructor(sample: RpgSample, seed: string) {
    const sceneId = sampleSceneId(sample);
    const houseCount = sample.landmarks.filter((landmark) => isHouseSceneId(landmark.id)).length;
    const population = ambientPopulationFor(sample.id, sceneId, Math.ceil(houseCount / 6));
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
    const anchors = populationAnchors(sample, population.length);
    const homes: Point[] = [];
    const residents: Array<{
      entity: AmbientEntity;
      home: Point;
      entry: AmbientPopulationEntry;
      random: () => number;
    }> = [];
    for (const [index, entry] of population.entries()) {
      const random = seededRandom(`${seed}:ambient-v2:${sceneId}:${entry.id}`);
      const anchor = anchors[index % anchors.length]!;
      let home: Point | undefined;
      for (let attempt = 0; attempt < HOME_ATTEMPTS; attempt++) {
        const angle = random() * TAU;
        const radius = 64 + random() * 144;
        const candidate = {
          x: Math.round((anchor.x + Math.cos(angle) * radius) / 16) * 16 + 8,
          y: Math.round((anchor.y + Math.sin(angle) * radius) / 16) * 16 + 8,
        };
        if (
          safe(candidate) &&
          homes.every((other) => distance(other, candidate) >= HOME_SEPARATION)
        ) {
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
        interaction: { ...entry.interaction },
      };
      this.entities.push(entity);
      residents.push({ entity, home, entry, random });
    }
    for (const { entity, home, entry, random } of residents) {
      const nearest = Math.min(
        ...homes.filter((other) => other !== home).map((other) => distance(home, other)),
      );
      const radius = Math.min(
        ENTITY_DEFINITIONS[entry.kind].navigation.wanderRadius,
        nearest / 2 - 40,
      );
      this.schedules.push(this.plan(entity, home, entry, random, safe, pathfinder, radius));
    }
    this.update(0);
  }

  public update(timeMs: number, motionPaused = false): void {
    if (!Number.isFinite(timeMs)) return;
    const now = Math.max(this.time, timeMs);
    const elapsed = now - this.time;
    for (const schedule of this.schedules) {
      schedule.pausedMs += motionPaused
        ? elapsed
        : schedule.held
          ? Math.max(0, Math.min(now, schedule.held.until) - this.time)
          : 0;
      if (schedule.held && now >= schedule.held.until) delete schedule.held;
      if (schedule.held || motionPaused) schedule.entity.action = 'idle';
      else this.positionAt(schedule, now);
    }
    this.time = now;
  }

  /** Hold the currently rendered route point; stable entity IDs can key future dialogue actions. */
  public hold(id: string, options: AmbientHoldOptions = {}): boolean {
    const schedule = this.schedules.find((candidate) => candidate.entity.id === id);
    if (!schedule) return false;
    const duration = options.durationMs ?? schedule.entity.interaction.durationMs;
    if (duration !== undefined && (!Number.isFinite(duration) || duration < 0)) return false;
    if (options.facing && ![options.facing.x, options.facing.y].every(Number.isFinite))
      return false;
    schedule.held = { until: duration === undefined ? Infinity : this.time + duration };
    schedule.entity.action = 'idle';
    if (options.facing && distance(schedule.entity, options.facing) > 0.01)
      schedule.entity.direction = directionToward(schedule.entity, options.facing);
    return true;
  }

  public release(id: string): boolean {
    const schedule = this.schedules.find((candidate) => candidate.entity.id === id);
    if (!schedule?.held) return false;
    delete schedule.held;
    this.positionAt(schedule, this.time);
    return true;
  }

  private positionAt(schedule: Schedule, now: number): void {
    const time =
      (((now - schedule.pausedMs + schedule.phase) % schedule.duration) + schedule.duration) %
      schedule.duration;
    const segment = schedule.segments.find((candidate) => time < candidate.end)!;
    const fraction = (time - segment.start) / (segment.end - segment.start);
    const entity = schedule.entity;
    entity.x = segment.from.x + (segment.to.x - segment.from.x) * fraction;
    entity.y = segment.from.y + (segment.to.y - segment.from.y) * fraction;
    entity.direction = segment.direction;
    entity.action = segment.action;
  }

  private plan(
    entity: AmbientEntity,
    home: Point,
    entry: AmbientPopulationEntry,
    random: () => number,
    safe: (point: Point) => boolean,
    pathfinder: RpgPathfinder,
    wanderRadius: number,
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
      const radius = 32 + random() * (wanderRadius - 32);
      const target = { x: home.x + Math.cos(angle) * radius, y: home.y + Math.sin(angle) * radius };
      if (!safe(target)) continue;
      const path = pathfinder.findPath(home, target, navigation.maxPathNodes);
      if (
        path.length === 0 ||
        path.length > MAX_PATH_POINTS ||
        path.some((point) => distance(home, point) > wanderRadius)
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
    return { entity, segments, duration: elapsed, phase: random() * elapsed, pausedMs: 0 };
  }
}
