import { describe, expect, it, vi } from 'vitest';

import { KENNEY_TINY_TOWN_THEME } from '../../../src/features/world/engine/themes';
import type { WorldDefinition, WorldPortal } from '../../../src/features/world/engine/types';
import { WorldSimulation } from '../../../src/features/world/three/world-simulation';

const portal: WorldPortal = {
  key: 'welcome',
  x: 100,
  y: 100,
  areaKey: 'arrivals',
  areaLabel: 'Arrivals',
  room: { key: 'welcome', label: 'welcome', type: 'text', order: 0 },
  accent: '#9284f7',
  destination: 'room',
};

function village(): WorldDefinition {
  return {
    name: 'Test village',
    environment: 'exterior',
    theme: KENNEY_TINY_TOWN_THEME,
    bounds: { x: 0, y: 0, width: 600, height: 400 },
    spawn: { x: 100, y: 100 },
    areas: [],
    paths: [],
    tileLayers: [],
    tileStamps: [],
    props: [],
    colliders: [],
    portals: [portal],
  };
}

const right = { x: 1, y: 0, moving: true, sprinting: false };

describe('3D world simulation', () => {
  it('routes around an obstacle with enough clearance for the actual avatar feet', () => {
    const world = village();
    world.spawn = { x: 100, y: 200 };
    world.colliders = [{ x: 180, y: 80, width: 50, height: 112 }];
    const simulation = new WorldSimulation(world, { onSceneChange: vi.fn() });
    simulation.navigate({ x: 300, y: 200 });
    for (let frame = 0; frame < 180; frame++) {
      simulation.tick(1 / 60, { x: 0, y: 0, moving: false, sprinting: false });
    }
    expect(Math.hypot(simulation.player.x - 300, simulation.player.y - 200)).toBeLessThanOrEqual(4);
  });
  it('clamps elapsed time and keeps walking feet outside obstacles', () => {
    const world = village();
    world.colliders = [{ x: 120, y: 0, width: 20, height: 400 }];
    const simulation = new WorldSimulation(world, { onSceneChange: vi.fn() });
    simulation.tick(20, right);
    expect(simulation.player.x).toBe(107.5);
    for (let frame = 0; frame < 60; frame++) simulation.tick(1 / 60, right);
    const collider = world.theme.avatar!.collider;
    expect(simulation.player.x + collider.offsetX + collider.width).toBeLessThanOrEqual(120);
    expect(simulation.player.moving).toBe(false);
  });

  it('enters a generated room and returns to the previous exterior position', () => {
    const onSceneChange = vi.fn();
    const simulation = new WorldSimulation(village(), { onSceneChange });
    simulation.interact();
    expect(simulation.world.environment).toBe('interior');
    expect(simulation.scene).toBe('room:welcome');
    expect(simulation.world.props.some((prop) => prop.kind === 'desk')).toBe(true);
    expect(onSceneChange).toHaveBeenLastCalledWith(portal);
    simulation.interact();
    expect(simulation.scene).toBe('exterior');
    expect(simulation.player).toMatchObject({ x: 100, y: 100, moving: false });
    expect(onSceneChange).toHaveBeenLastCalledWith(null);
  });

  it('refreshes a renamed room without treating the refresh as a user entry', () => {
    const onSceneChange = vi.fn();
    const simulation = new WorldSimulation(village(), { onSceneChange });
    simulation.enterRoomByKey('welcome');
    onSceneChange.mockClear();
    const renamed = village();
    renamed.portals = [{ ...portal, room: { ...portal.room, label: 'introductions' } }];
    simulation.updateWorld(renamed);
    expect(simulation.world.name).toBe('#introductions');
    expect(onSceneChange).toHaveBeenCalledExactlyOnceWith(renamed.portals[0], 'refresh');
  });

  it('returns outside safely when a live refresh removes the occupied room', () => {
    const onSceneChange = vi.fn();
    const simulation = new WorldSimulation(village(), { onSceneChange });
    simulation.enterRoomByKey('welcome');
    const refreshed = village();
    refreshed.portals = [];
    refreshed.colliders = [{ x: 80, y: 80, width: 50, height: 50 }];
    refreshed.spawn = { x: 300, y: 300 };
    simulation.updateWorld(refreshed);
    expect(simulation.scene).toBe('exterior');
    expect(simulation.player).toMatchObject({ x: 300, y: 300, moving: false });
    expect(onSceneChange).toHaveBeenLastCalledWith(null, 'refresh');
    expect(simulation.enterRoomByKey('welcome')).toBe(false);
  });

  it('cancels automatic movement when gameplay is blocked by a form', () => {
    const simulation = new WorldSimulation(village(), { onSceneChange: vi.fn() });
    simulation.navigate({ x: 300, y: 100 });
    simulation.tick(0.05, right, true);
    simulation.tick(0.05, { x: 0, y: 0, moving: false, sprinting: false });
    expect(simulation.player).toMatchObject({ x: 100, y: 100, moving: false });
  });
});
