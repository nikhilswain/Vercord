import { describe, expect, it } from 'vitest';
import {
  TrailSparkField,
  TRAIL_SPARK_LIMIT,
} from '../../../src/features/rpg/navigation/trail-field';

const path = [
  { x: 0, y: 0 },
  { x: 600, y: 0 },
  { x: 600, y: 600 },
];
const snapshot = (field: TrailSparkField, points = path, x = 0, now = 1000, reduced = false) =>
  field.sample(points, { x, y: 0 }, now, reduced).map((s) => ({ ...s }));

describe('navigation sparkle motion', () => {
  it('keeps existing glints in world space when walking trims the start of the route', () => {
    const field = new TrailSparkField();
    const idle = snapshot(field);
    const walking = snapshot(field, [{ x: 80, y: 0 }, ...path.slice(1)], 80);
    const common = idle.filter((a) => walking.some((b) => b.id === a.id));
    expect(common.length).toBeGreaterThan(40);
    for (const a of common) {
      const b = walking.find((b) => b.id === a.id)!;
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.y).toBeCloseTo(a.y, 9);
      expect(b.rotation).toBe(a.rotation);
      expect(b.size).toBe(a.size);
    }
  });

  it('uses the same animation pace while idle, walking and sprinting', () => {
    const capture = (x: number, time: number) =>
      snapshot(new TrailSparkField(), [{ x, y: 0 }, ...path.slice(1)], x, time).find(
        (s) => s.id === 50,
      )!;
    const start = capture(0, 2000);
    const idle = capture(0, 2250),
      walk = capture(27, 2250),
      run = capture(60, 2250);
    expect(walk.x).toBeCloseTo(idle.x, 9);
    expect(run.x).toBeCloseTo(idle.x, 9);
    expect(walk.y).toBeCloseTo(idle.y, 9);
    expect(run.y).toBeCloseTo(idle.y, 9);
    expect(Math.hypot(idle.x - start.x, idle.y - start.y)).toBeLessThan(4);
    expect(Math.hypot(idle.x - start.x, idle.y - start.y)).toBeGreaterThan(0.1);
  });

  it('preserves glints past a corner and across a changed player connector', () => {
    const field = new TrailSparkField();
    const before = snapshot(field);
    const after = field.sample(
      [
        { x: 600, y: 90 },
        { x: 600, y: 600 },
      ],
      { x: 600, y: 90 },
      1000,
      false,
    );
    const common = before.filter((a) => after.some((b) => b.id === a.id));
    expect(common.length).toBeGreaterThan(15);
    for (const a of common) {
      const b = after.find((b) => b.id === a.id)!;
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.y).toBeCloseTo(a.y, 9);
    }
  });

  it('freezes drift, twinkles and rotation with reduced motion', () => {
    const field = new TrailSparkField();
    expect(snapshot(field, path, 0, 1000, true)).toEqual(snapshot(field, path, 0, 9000, true));
    expect(snapshot(field, path, 0, 1000)).not.toEqual(snapshot(field, path, 0, 9000));
  });

  it('bounds the pool and visible distance even for an extremely long route', () => {
    const field = new TrailSparkField();
    const result = snapshot(field, [
      { x: 0, y: 0 },
      { x: 1000000, y: 0 },
    ]);
    expect(result.length).toBeLessThanOrEqual(TRAIL_SPARK_LIMIT);
    expect(result.length).toBeGreaterThan(60);
    expect(new Set(result.map((s) => s.id % TRAIL_SPARK_LIMIT)).size).toBe(result.length);
    for (const s of result) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(910);
      expect(s.alpha).toBeGreaterThanOrEqual(0);
      expect(s.alpha).toBeLessThanOrEqual(1);
    }
  });

  it('drops old glints for an empty or zero-length route', () => {
    const field = new TrailSparkField();
    expect(snapshot(field).length).toBeGreaterThan(0);
    expect(snapshot(field, [])).toEqual([]);
    expect(
      snapshot(field, [
        { x: 2, y: 2 },
        { x: 2, y: 2 },
      ]),
    ).toEqual([]);
  });
});
