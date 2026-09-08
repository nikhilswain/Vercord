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
