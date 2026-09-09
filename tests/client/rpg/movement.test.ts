import { describe, expect, it } from 'vitest';
import { getRpgSample } from '../../../src/features/rpg/sample-worlds';
import { RpgSimulation } from '../../../src/features/rpg/simulation';

const idle = { x: 0, y: 0, moving: false, sprinting: false };
const running = { x: 1, y: 0, moving: true, sprinting: true };
const createSimulation = () =>
  new RpgSimulation({
    ...getRpgSample('village'),
    spawn: { x: 104, y: 104 },
    colliders: [],
    npcs: [],
  });

describe('auto-run', () => {
  it('travels faster than manual running and uses the run animation', () => {
    const auto = createSimulation();
    const manual = createSimulation();
    auto.navigate({ x: 1000, y: 104 });
    for (let frame = 0; frame < 60; frame++) {
      auto.tick(1 / 60, idle);
      manual.tick(1 / 60, running);
    }
    expect(auto.player.x).toBeGreaterThan(manual.player.x);
    expect(auto.action).toBe('run');
  });

  it('stops at the destination without overshooting on longer frames', () => {
    const simulation = createSimulation();
    simulation.navigate({ x: 239, y: 104 });
    for (let frame = 0; frame < 60; frame++) {
      simulation.tick(0.05, idle);
      expect(simulation.player.x).toBeLessThanOrEqual(239);
    }
    expect(Math.abs(simulation.player.x - 239)).toBeLessThan(2);
    expect(simulation.action).toBe('idle');
  });

  it('hands control back to manual walking immediately and clears the route', () => {
    const simulation = createSimulation();
    simulation.navigate({ x: 1000, y: 104 });
    simulation.tick(1 / 60, idle);
    const before = simulation.player.x;
    simulation.tick(1 / 60, { x: -1, y: 0, moving: true, sprinting: false });
    expect(simulation.player.x).toBeLessThan(before);
    expect(simulation.action).toBe('walk');
    const stopped = { ...simulation.player };
    simulation.tick(1 / 60, idle);
    expect(simulation.player).toEqual(stopped);
    expect(simulation.action).toBe('idle');
  });
});

describe('saved scene positions', () => {
  it('replans to the clicked destination after a delayed movement correction', () => {
    const simulation = createSimulation();
    simulation.navigate({ x: 1000, y: 104 });
    for (let frame = 0; frame < 60; frame++) simulation.tick(1 / 60, idle);
    const correction = {
      x: 200,
      y: 104,
      direction: 'right',
      action: 'idle',
      scene: 'overworld',
    } as const;
    expect(simulation.setPlayerPosition(correction, true)).toBe(true);
    for (let frame = 0; frame < 250; frame++) simulation.tick(1 / 60, idle);
    expect(simulation.player.x).toBeCloseTo(1000, 0);
    expect(simulation.action).toBe('idle');
  });

  it('does not resume a cancelled click after a later correction', () => {
    const simulation = createSimulation();
    simulation.navigate({ x: 1000, y: 104 });
    simulation.tick(1 / 60, idle);
    simulation.stop();
    simulation.setPlayerPosition(
      { x: 108, y: 104, direction: 'right', action: 'idle', scene: 'overworld' },
      true,
    );
    simulation.tick(1 / 60, idle);
    expect(simulation.player.x).toBe(108);
    expect(simulation.action).toBe('idle');
  });

  it('restores authoritative positions safely and cancels the previous route', () => {
    const simulation = createSimulation();
    simulation.navigate({ x: 1000, y: 104 });
    simulation.tick(1 / 60, idle);
    const location = {
      x: 200,
      y: 200,
      direction: 'left',
      action: 'run',
      scene: 'overworld',
    } as const;
    expect(simulation.setPlayerPosition(location)).toBe(true);
    simulation.tick(1 / 60, idle);
    expect(simulation.player).toEqual({ x: 200, y: 200 });
    expect(simulation.direction).toBe('left');
    expect(simulation.action).toBe('idle');
    expect(simulation.setPlayerPosition({ ...location, scene: 'dungeon' })).toBe(false);
    expect(simulation.setPlayerPosition({ ...location, x: Number.NaN })).toBe(false);
    simulation.sample.colliders.push({ x: 285, y: 185, width: 30, height: 30 });
    expect(simulation.setPlayerPosition({ ...location, x: 300 })).toBe(false);
    expect(simulation.player).toEqual({ x: 200, y: 200 });
    const original = simulation.sample;
    simulation.changeSample({ ...original, id: 'dungeon' });
    simulation.changeSample(original);
    expect(simulation.player).toEqual({ x: 200, y: 200 });
  });

  it('keeps dungeon and server positions separate and rejects positions inside new obstacles', () => {
    const sample = {
      ...getRpgSample('village'),
      spawn: { x: 104, y: 104 },
      colliders: [],
      npcs: [],
    };
    const positions = new Map<string, { x: number; y: number }>();
    const first = new RpgSimulation(sample, 'server-a/village', positions);
    first.player = { x: 200, y: 200 };
    first.changeSample({ ...sample, id: 'dungeon' }, 'server-a/dungeon');
    first.player = { x: 300, y: 300 };
    first.changeSample(sample, 'server-a/village');
    expect(first.player).toEqual({ x: 200, y: 200 });
    first.rememberPosition();
    expect(new RpgSimulation(sample, 'server-b/village', positions).player).toEqual(sample.spawn);
    expect(new RpgSimulation(sample, 'server-a/village', positions).player).toEqual({
      x: 200,
      y: 200,
    });
    expect(
      new RpgSimulation(
        { ...sample, colliders: [{ x: 185, y: 185, width: 30, height: 30 }] },
        'server-a/village',
        positions,
      ).player,
    ).toEqual(sample.spawn);
  });
});
