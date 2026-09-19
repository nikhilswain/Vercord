import type { Point } from '../../../domain/world/content/v1/types';

export const TRAIL_SPARK_LIMIT = 84;
const SPACING = 12;
const REACH = 900;
const TAU = Math.PI * 2;

interface Segment {
  a: Point;
  b: Point;
  length: number;
  endDistance: number;
}

export interface TrailSpark extends Point {
  id: number;
  major: boolean;
  alpha: number;
  size: number;
  rotation: number;
}

const fraction = (n: number) => n - Math.floor(n);
const noise = (id: number, salt: number) =>
  fraction(Math.sin(id * 127.1 + salt * 311.7) * 43758.5453);
const smooth = (a: number, b: number, n: number) => {
  const t = Math.max(0, Math.min(1, (n - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A fixed lattice measured BACK from the destination. Trimming the player end of
 * a route cannot move its sparkles or change their age, spacing or drift speed. */
export class TrailSparkField {
  private source: readonly Point[] | null = null;
  private segments: Segment[] = [];
  private length = 0;
  private readonly pool: TrailSpark[] = Array.from({ length: TRAIL_SPARK_LIMIT }, () => ({
    id: 0,
    x: 0,
    y: 0,
    major: false,
    alpha: 0,
    size: 0,
    rotation: 0,
  }));
  public readonly sparks: TrailSpark[] = [];

  public sample(
    path: readonly Point[],
    player: Point,
    now: number,
    reducedMotion: boolean,
  ): readonly TrailSpark[] {
    if (this.source !== path) this.measure(path);
    this.sparks.length = 0;
    if (!this.segments.length) return this.sparks;
    const remaining = this.remaining(player);
    const time = reducedMotion ? 0 : now / 1000;
    const first = Math.max(0, Math.floor((remaining - REACH) / SPACING) - 1);
    const last = Math.ceil(remaining / SPACING) + 1;
    for (let id = first; id <= last && this.sparks.length < TRAIL_SPARK_LIMIT; id++) {
      const seed = noise(id, 1);
      const major = id % 4 === 0;
      const duration = 2.2 + noise(id, 2) * 2;
      const age = fraction(time / duration + seed);
      // Each mote makes one small forward drift, fading out before its cycle resets.
      const fromEnd =
        id * SPACING + (noise(id, 3) - 0.5) * 5 + (reducedMotion ? 0 : (0.5 - age) * 16);
      const ahead = remaining - fromEnd;
      if (fromEnd < 0 || fromEnd > this.length || ahead < 8 || ahead > REACH) continue;
      const spark = this.pool[this.sparks.length]!;
      if (!this.place(fromEnd, spark)) continue;
      const envelope = smooth(8, 40, ahead) * (1 - smooth(REACH - 160, REACH, ahead));
      const life = reducedMotion ? 0.7 : Math.sin(Math.PI * age) ** 2;
      // A slow light pulse travels toward the goal, independent of the player's pace.
      const shimmer = reducedMotion ? 1 : 0.78 + 0.22 * Math.sin(fromEnd * 0.035 + time * 1.6);
      const sway = reducedMotion ? 0 : Math.sin(time * 0.8 + seed * TAU) * 1.5;
      spark.x += (noise(id, 5) - 0.5) * (major ? 5 : 13) + sway;
      spark.y += (noise(id, 6) - 0.5) * 8 - (reducedMotion ? 0 : Math.sin(age * Math.PI) * 3);
      spark.id = id;
      spark.major = major;
      spark.alpha = envelope * life * shimmer;
      spark.size = major ? 24 + noise(id, 7) * 10 : 4 + noise(id, 7) * 5;
      spark.rotation = major ? 0.12 * Math.sin(time * 0.45 + seed * TAU) : 0;
      this.sparks.push(spark);
    }
    return this.sparks;
  }

  private measure(path: readonly Point[]): void {
    this.source = path;
    this.segments = [];
    this.length = 0;
    for (let i = path.length - 1; i > 0; i--) {
      const a = path[i - 1]!,
        b = path[i]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 0.001 || !Number.isFinite(length)) continue;
      this.segments.push({ a, b, length, endDistance: this.length });
      this.length += length;
    }
  }

  private remaining(player: Point): number {
    let nearest = Infinity,
      remaining = this.length;
    for (const segment of this.segments) {
      const { a, b, length, endDistance } = segment;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(1, ((player.x - a.x) * dx + (player.y - a.y) * dy) / (length * length)),
      );
      const distance = (player.x - a.x - dx * t) ** 2 + (player.y - a.y - dy * t) ** 2;
      if (distance < nearest) {
        nearest = distance;
        remaining = endDistance + length * (1 - t);
      }
    }
    return remaining;
  }

  private place(fromEnd: number, spark: TrailSpark): boolean {
    for (const { a, b, length, endDistance } of this.segments) {
      if (fromEnd > endDistance + length) continue;
      const t = (fromEnd - endDistance) / length;
      spark.x = b.x + (a.x - b.x) * t;
      spark.y = b.y + (a.y - b.y) * t;
      return true;
    }
    return false;
  }
}
