import type { Point, Rect } from '../world/engine/types';
import type { PathFootprint } from '../world/engine/pathfinding';
import { overlaps } from '../world/engine/collision';

const CELL_SIZE = 16;
const CLEARANCE = 2;
const MAX_VISITED = 6000;
const SMOOTH_LOOKAHEAD = 64;
const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

interface Budget {
  remaining: number;
  edges: number;
}

interface SearchNode {
  id: string | number;
  point: Point;
  cost: number;
  estimate: number;
  parent: SearchNode | null;
}

interface Road extends Rect {
  id: number;
}

/** Large rectangles stay in one overflow list instead of occupying thousands of buckets. */
class SpatialIndex<T extends Rect> {
  private readonly cells = new Map<string, T[]>();
  private readonly large: T[] = [];

  public constructor(
    items: T[],
    private readonly size = 128,
  ) {
    for (const item of items) {
      const [left, top, right, bottom] = this.range(item);
      if ((right - left + 1) * (bottom - top + 1) > 256) {
        this.large.push(item);
        continue;
      }
      for (let x = left; x <= right; x++) {
        for (let y = top; y <= bottom; y++) {
          const key = `${x}:${y}`;
          const entries = this.cells.get(key) ?? [];
          entries.push(item);
          this.cells.set(key, entries);
        }
      }
    }
  }

  public query(box: Rect): T[] {
    const result = new Set<T>(this.large);
    const [left, top, right, bottom] = this.range(box);
    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        for (const item of this.cells.get(`${x}:${y}`) ?? []) result.add(item);
      }
    }
    return [...result];
  }

  private range(box: Rect): [number, number, number, number] {
    return [
      Math.floor(box.x / this.size),
      Math.floor(box.y / this.size),
      Math.floor((box.x + box.width) / this.size),
      Math.floor((box.y + box.height) / this.size),
    ];
  }
}

class MinHeap {
  private readonly nodes: SearchNode[] = [];

  public push(node: SearchNode): void {
    let index = this.nodes.length;
    this.nodes.push(node);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.before(node, this.nodes[parent]!)) break;
      this.nodes[index] = this.nodes[parent]!;
      index = parent;
    }
    this.nodes[index] = node;
  }

  public pop(): SearchNode | undefined {
    const first = this.nodes[0];
    const last = this.nodes.pop();
    if (!last || this.nodes.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < this.nodes.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.nodes.length && this.before(this.nodes[child + 1]!, this.nodes[child]!))
        child++;
      if (!this.before(this.nodes[child]!, last)) break;
      this.nodes[index] = this.nodes[child]!;
      index = child;
    }
    this.nodes[index] = last;
    return first;
  }

  private before(a: SearchNode, b: SearchNode): boolean {
    const difference = a.cost + a.estimate - b.cost - b.estimate;
    return difference < 0 || (difference === 0 && a.estimate < b.estimate);
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The portion of a line inside a rectangle, including its boundary. */
function segmentInterval(from: Point, to: Point, box: Rect): [number, number] | null {
  let low = 0;
  let high = 1;
  for (const axis of ['x', 'y'] as const) {
    const delta = to[axis] - from[axis];
    const min = box[axis];
    const max = min + (axis === 'x' ? box.width : box.height);
    if (delta === 0) {
      if (from[axis] < min || from[axis] > max) return null;
      continue;
    }
    const first = (min - from[axis]) / delta;
    const last = (max - from[axis]) / delta;
    low = Math.max(low, Math.min(first, last));
    high = Math.min(high, Math.max(first, last));
    if (low > high) return null;
  }
  return [low, high];
}

function reconstruct(end: SearchNode): Point[] {
  const points: Point[] = [];
  for (let node: SearchNode | null = end; node; node = node.parent) points.push(node.point);
  points.reverse();
  return points;
}

export class RpgPathfinder {
  private readonly collisionIndex: SpatialIndex<Rect>;
  private readonly roads: Road[];
  private readonly roadIndex: SpatialIndex<Road>;

  public constructor(
    private readonly bounds: Rect,
    colliders: Rect[],
    private readonly feet: PathFootprint,
    roads: Rect[] = [],
  ) {
    this.collisionIndex = new SpatialIndex(colliders);
    // These rectangles describe valid player origins with the full feet inside each road.
    this.roads = roads
      .map((road, id) => ({
        id,
        x: road.x - feet.offsetX + CLEARANCE,
        y: road.y - feet.offsetY + CLEARANCE,
        width: road.width - feet.width - CLEARANCE * 2,
        height: road.height - feet.height - CLEARANCE * 2,
      }))
      .filter((road) => road.width >= 0 && road.height >= 0);
    this.roadIndex = new SpatialIndex(this.roads, 512);
  }

  public queryColliders(box: Rect): Rect[] {
    return this.collisionIndex.query(box);
  }

  public canTravel(from: Point, to: Point): boolean {
    return this.segmentIsClear(from, to, 0);
  }

  /** Road graph and local A* share one hard budget; an incomplete search never starts a route. */
  public findPath(from: Point, to: Point, maxVisited = MAX_VISITED): Point[] {
    if (![from.x, from.y, to.x, to.y, maxVisited].every(Number.isFinite)) return [];
    if (!this.walkable(from, 0)) return [];
    const visits = Math.max(0, Math.min(MAX_VISITED, Math.floor(maxVisited)));
    const budget = { remaining: visits, edges: visits * 16 };
    const destination = this.walkable(to, 0) ? to : this.nearestGrid(to, false);
    if (!destination || visits === 0) return [];
    if (this.roads.length > 0 && distance(from, destination) > 512) {
      const route = this.roadRoute(from, destination, budget);
      if (route.length > 0) return route;
    }
    return this.localRoute(from, destination, budget);
  }

  private walkable(point: Point, clearance = CLEARANCE): boolean {
    const box = this.boxAt(point);
    if (!this.inside(box)) return false;
    const padded = {
      x: box.x - clearance,
      y: box.y - clearance,
      width: box.width + clearance * 2,
      height: box.height + clearance * 2,
    };
    return !this.queryColliders(padded).some((collider) => overlaps(padded, collider));
  }

  private boxAt(point: Point): Rect {
    return {
      x: point.x + this.feet.offsetX,
      y: point.y + this.feet.offsetY,
      width: this.feet.width,
      height: this.feet.height,
    };
  }

  private inside(box: Rect): boolean {
    return (
      box.x >= this.bounds.x &&
      box.y >= this.bounds.y &&
      box.x + box.width <= this.bounds.x + this.bounds.width &&
      box.y + box.height <= this.bounds.y + this.bounds.height
    );
  }

  private segmentIsClear(from: Point, to: Point, clearance = CLEARANCE): boolean {
    if (!this.inside(this.boxAt(from)) || !this.inside(this.boxAt(to))) return false;
    // Bounded strips avoid querying every bucket in a map-wide diagonal's bounding box.
    const steps = Math.max(1, Math.ceil(distance(from, to) / 128));
    let previous = from;
    for (let step = 1; step <= steps; step++) {
      const next = {
        x: from.x + ((to.x - from.x) * step) / steps,
        y: from.y + ((to.y - from.y) * step) / steps,
      };
      const swept = {
        x: Math.min(previous.x, next.x) + this.feet.offsetX - clearance,
        y: Math.min(previous.y, next.y) + this.feet.offsetY - clearance,
        width: Math.abs(next.x - previous.x) + this.feet.width + clearance * 2,
        height: Math.abs(next.y - previous.y) + this.feet.height + clearance * 2,
      };
      // Test the line against expanded walls; a diagonal's bounding box is only broad phase.
      if (
        this.queryColliders(swept).some((collider) => {
          if (!overlaps(swept, collider)) return false;
          const epsilon = 0.00001;
          return (
            segmentInterval(previous, next, {
              x: collider.x - this.feet.offsetX - this.feet.width - clearance + epsilon,
              y: collider.y - this.feet.offsetY - this.feet.height - clearance + epsilon,
              width: collider.width + this.feet.width + clearance * 2 - epsilon * 2,
              height: collider.height + this.feet.height + clearance * 2 - epsilon * 2,
            }) !== null
          );
        })
      )
        return false;
      previous = next;
    }
    return true;
  }

  private segmentStaysOnRoads(from: Point, to: Point): boolean {
    const steps = Math.max(1, Math.ceil(distance(from, to) / 128));
    let previous = from;
    for (let step = 1; step <= steps; step++) {
      const next = {
        x: from.x + ((to.x - from.x) * step) / steps,
        y: from.y + ((to.y - from.y) * step) / steps,
      };
      const box = {
        x: Math.min(previous.x, next.x),
        y: Math.min(previous.y, next.y),
        width: Math.abs(next.x - previous.x),
        height: Math.abs(next.y - previous.y),
      };
      const intervals = this.roadIndex
        .query(box)
        .map((road) => segmentInterval(previous, next, road))
        .filter((interval): interval is [number, number] => interval !== null)
        .sort((a, b) => a[0] - b[0]);
      let covered = 0;
      for (const [low, high] of intervals) {
        if (low > covered + 0.00001) return false;
        covered = Math.max(covered, high);
      }
      if (covered < 1) return false;
      previous = next;
    }
    return true;
  }

  /** Four-direction rigs use straight legs and right-angle turns, including grid attachments. */
  private cardinalConnection(
    from: Point,
    to: Point,
    clearance = CLEARANCE,
    onRoads = false,
  ): Point[] {
    const candidates =
      from.x === to.x || from.y === to.y
        ? [[to]]
        : [
            [{ x: to.x, y: from.y }, to],
            [{ x: from.x, y: to.y }, to],
          ];
    for (const candidate of candidates) {
      let previous = from;
      if (
        candidate.every((point) => {
          const clear =
            this.segmentIsClear(previous, point, clearance) &&
            (!onRoads || this.segmentStaysOnRoads(previous, point));
          previous = point;
          return clear;
        })
      )
        return candidate;
    }
    return [];
  }

  private smoothRoute(from: Point, route: Point[], budget: Budget, onRoads = false): Point[] {
    const points = route.filter(
      (point, index) => distance(index > 0 ? route[index - 1]! : from, point) > 0.00001,
    );
    const corners = points.filter((point, index) => {
      const previous = index > 0 ? points[index - 1]! : from;
      const next = points[index + 1];
      if (!next) return true;
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const nx = next.x - point.x;
      const ny = next.y - point.y;
      return Math.abs(dx * ny - dy * nx) > 0.00001 || dx * nx + dy * ny < 0;
    });
    const result: Point[] = [];
    let previous = from;
    for (let index = 0; index < corners.length;) {
      let furthest = index;
      let connection = this.cardinalConnection(previous, corners[index]!, 0, onRoads);
      for (
        let next = Math.min(corners.length - 1, index + SMOOTH_LOOKAHEAD);
        next > index;
        next--
      ) {
        // Smoothing has a bounded horizon and shares the graph's edge budget.
        if (--budget.edges <= 0) break;
        const point = corners[next]!;
        const shortcut = this.cardinalConnection(previous, point, CLEARANCE, onRoads);
        if (shortcut.length > 0) {
          furthest = next;
          connection = shortcut;
          break;
        }
      }
      if (connection.length === 0) return [];
      previous = corners[furthest]!;
      for (const point of connection) {
        const before = result.at(-2) ?? from;
        const last = result.at(-1);
        if (
          last &&
          ((before.x === last.x && last.x === point.x) ||
            (before.y === last.y && last.y === point.y)) &&
          (last.x - before.x) * (point.x - last.x) + (last.y - before.y) * (point.y - last.y) >= 0
        )
          result.pop();
        result.push(point);
      }
      index = furthest + 1;
    }
    return result;
  }

  private nearestGrid(point: Point, connect: boolean): Point | null {
    const reach = CELL_SIZE * 11;
    if (
      point.x < this.bounds.x - reach ||
      point.y < this.bounds.y - reach ||
      point.x > this.bounds.x + this.bounds.width + reach ||
      point.y > this.bounds.y + this.bounds.height + reach
    )
      return null;
    const originCol = Math.floor(point.x / CELL_SIZE);
    const originRow = Math.floor(point.y / CELL_SIZE);
    for (let radius = 0; radius <= 10; radius++) {
      let nearest: Point | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let col = originCol - radius; col <= originCol + radius; col++) {
        for (let row = originRow - radius; row <= originRow + radius; row++) {
          if (
            radius > 0 &&
            Math.abs(col - originCol) !== radius &&
            Math.abs(row - originRow) !== radius
          )
            continue;
          const candidate = { x: col * CELL_SIZE + 8, y: row * CELL_SIZE + 8 };
          const length = distance(point, candidate);
          if (length >= nearestDistance || !this.walkable(candidate)) continue;
          if (connect && this.cardinalConnection(point, candidate, 0).length === 0) continue;
          nearest = candidate;
          nearestDistance = length;
        }
      }
      if (nearest) return nearest;
    }
    return null;
  }

  private localRoute(from: Point, to: Point, budget: Budget): Point[] {
    if (budget.remaining <= 0) return [];
    const direct = this.cardinalConnection(from, to);
    if (direct.length > 0) return direct;
    const start = this.nearestGrid(from, true);
    const target = this.nearestGrid(to, true);
    if (!start || !target) return [];
    const key = (point: Point) => `${point.x}:${point.y}`;
    const estimate = (point: Point) => {
      const dx = Math.abs(point.x - target.x);
      const dy = Math.abs(point.y - target.y);
      return dx + dy;
    };
    const open = new MinHeap();
    const scores = new Map<string | number, number>();
    const closed = new Set<string | number>();
    const free = new Map<string, boolean>();
    const first = {
      id: key(start),
      point: start,
      cost: 0,
      estimate: estimate(start),
      parent: null,
    };
    scores.set(first.id, 0);
    open.push(first);
    while (budget.remaining > 0) {
      const current = open.pop();
      if (!current) break;
      if (closed.has(current.id)) continue;
      closed.add(current.id);
      budget.remaining--;
      if (current.point.x === target.x && current.point.y === target.y) {
        return this.smoothRoute(from, [...reconstruct(current), to], budget);
      }
      for (const [dx, dy] of DIRECTIONS) {
        const point = { x: current.point.x + dx * CELL_SIZE, y: current.point.y + dy * CELL_SIZE };
        const id = key(point);
        if (closed.has(id)) continue;
        let walkable = free.get(id);
        if (walkable === undefined) {
          walkable = this.walkable(point);
          free.set(id, walkable);
        }
        if (!walkable || !this.segmentIsClear(current.point, point)) continue;
        const cost = current.cost + CELL_SIZE;
        if (cost >= (scores.get(id) ?? Number.POSITIVE_INFINITY)) continue;
        scores.set(id, cost);
        open.push({ id, point, cost, estimate: estimate(point), parent: current });
      }
    }
    return [];
  }

  private attachment(
    point: Point,
    budget: Budget,
    outgoing: boolean,
  ): { road: Road; point: Point; route: Point[] } | null {
    const candidates = this.roads
      .map((road) => {
        const entry = {
          x: Math.max(road.x, Math.min(road.x + road.width, point.x)),
          y: Math.max(road.y, Math.min(road.y + road.height, point.y)),
        };
        return { road, point: entry, distance: distance(point, entry) };
      })
      .filter((candidate) => candidate.distance <= 768)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);
    for (const candidate of candidates) {
      if (!this.walkable(candidate.point, 0)) continue;
      const route = outgoing
        ? this.localRoute(point, candidate.point, budget)
        : this.localRoute(candidate.point, point, budget);
      if (route.length > 0) return { ...candidate, route };
    }
    return null;
  }

  private roadRoute(from: Point, to: Point, budget: Budget): Point[] {
    const start = this.attachment(from, budget, true);
    const target = this.attachment(to, budget, false);
    if (!start || !target) return [];
    const roadsById = new Map(this.roads.map((road) => [road.id, road]));
    const open = new MinHeap();
    const scores = new Map<string | number, number>([[start.road.id, 0]]);
    const closed = new Set<string | number>();
    open.push({
      id: start.road.id,
      point: start.point,
      cost: 0,
      estimate: distance(start.point, to),
      parent: null,
    });
    while (budget.remaining > 0 && budget.edges > 0) {
      const current = open.pop();
      if (!current) break;
      if (closed.has(current.id)) continue;
      closed.add(current.id);
      budget.remaining--;
      if (current.id === target.road.id) {
        const waypoints = [...reconstruct(current), target.point];
        const route: Point[] = [];
        for (let index = 1; index < waypoints.length; index++) {
          const section = this.localRoute(waypoints[index - 1]!, waypoints[index]!, budget);
          if (section.length === 0) return [];
          route.push(...section);
        }
        const middle = this.smoothRoute(start.point, route, budget, true);
        return [...start.route, ...middle, ...target.route].filter(
          (point, index, points) =>
            distance(index > 0 ? points[index - 1]! : from, point) > 0.00001,
        );
      }
      const road = roadsById.get(current.id as number)!;
      for (const next of this.roadIndex.query(road)) {
        if (--budget.edges <= 0) return [];
        if (closed.has(next.id)) continue;
        const left = Math.max(road.x, next.x);
        const top = Math.max(road.y, next.y);
        const right = Math.min(road.x + road.width, next.x + next.width);
        const bottom = Math.min(road.y + road.height, next.y + next.height);
        if (right < left || bottom < top) continue;
        const point = { x: (left + right) / 2, y: (top + bottom) / 2 };
        const cost = current.cost + distance(current.point, point);
        if (cost >= (scores.get(next.id) ?? Number.POSITIVE_INFINITY)) continue;
        scores.set(next.id, cost);
        open.push({ id: next.id, point, cost, estimate: distance(point, to), parent: current });
      }
    }
    return [];
  }
}
